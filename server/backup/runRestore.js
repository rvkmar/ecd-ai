/**
 * D108 — restore an encrypted full backup (D107) into a clean target tree.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import {
  decryptBackupBlob,
  parseBackupEncryptionKey,
} from "./cryptoArchive.js";

/**
 * @param {Buffer} blob
 * @param {Buffer} key
 * @returns {{ createdAt: string, files: Record<string, Buffer> }}
 */
function openEncryptedBackup(blob, key) {
  const compressed = decryptBackupBlob(blob, key);
  const json = zlib.gunzipSync(compressed).toString("utf8");
  const payload = JSON.parse(json);
  /** @type {Record<string, Buffer>} */
  const files = {};
  for (const [p, b64] of Object.entries(payload.files || {})) {
    files[p] = Buffer.from(String(b64), "base64");
  }
  return { createdAt: payload.createdAt, files };
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/**
 * @param {object} [options]
 * @returns {Promise<{
 *   ok: boolean,
 *   elapsedMs: number,
 *   backupCreatedAt?: string,
 *   filesRestored: string[],
 *   targets?: { ecdFile: string, mongoDir: string, materialsDir: string },
 *   error?: string,
 * }>}
 */
export async function runRestore(options = {}) {
  const started = Date.now();
  const env = options.env || process.env;
  const key =
    options.key !== undefined
      ? options.key
      : parseBackupEncryptionKey(env);
  if (!key) {
    return {
      ok: false,
      elapsedMs: Date.now() - started,
      filesRestored: [],
      error: "ECD_BACKUP_ENCRYPTION_KEY missing or invalid",
    };
  }

  let blob = options.blob;
  if (!blob) {
    const archivePath = options.archivePath;
    if (!archivePath || !fs.existsSync(archivePath)) {
      return {
        ok: false,
        elapsedMs: Date.now() - started,
        filesRestored: [],
        error: "archivePath missing or not found",
      };
    }
    blob = fs.readFileSync(archivePath);
  }

  let opened;
  try {
    opened = openEncryptedBackup(blob, key);
  } catch (err) {
    return {
      ok: false,
      elapsedMs: Date.now() - started,
      filesRestored: [],
      error: err?.message || String(err),
    };
  }

  const targetRoot =
    options.targetRoot ||
    path.join(process.cwd(), "restore-target");
  const ecdFile =
    options.targetEcdFile || path.join(targetRoot, "ecd", "db.json");
  const mongoDir =
    options.targetMongoDir || path.join(targetRoot, "mongo");
  const materialsDir =
    options.targetMaterialsDir || path.join(targetRoot, "materials");

  // Clean targets so we do not mix with leftover state.
  for (const p of [ecdFile, mongoDir, materialsDir]) {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
    }
  }
  fs.mkdirSync(path.dirname(ecdFile), { recursive: true });
  fs.mkdirSync(mongoDir, { recursive: true });
  fs.mkdirSync(materialsDir, { recursive: true });

  const restored = [];
  for (const [rel, buf] of Object.entries(opened.files)) {
    if (rel === "manifest.json") {
      const dest = path.join(targetRoot, "manifest.json");
      ensureParent(dest);
      fs.writeFileSync(dest, buf);
      restored.push(rel);
      continue;
    }
    if (rel === "ecd/db.json") {
      ensureParent(ecdFile);
      fs.writeFileSync(ecdFile, buf);
      restored.push(rel);
      continue;
    }
    if (rel.startsWith("mongo/")) {
      const dest = path.join(mongoDir, path.basename(rel));
      fs.writeFileSync(dest, buf);
      restored.push(rel);
      continue;
    }
    if (rel.startsWith("materials/")) {
      const sub = rel.slice("materials/".length);
      const dest = path.join(materialsDir, sub);
      ensureParent(dest);
      fs.writeFileSync(dest, buf);
      restored.push(rel);
      continue;
    }
  }

  return {
    ok: true,
    elapsedMs: Date.now() - started,
    backupCreatedAt: opened.createdAt,
    filesRestored: restored.sort(),
    targets: { ecdFile, mongoDir, materialsDir, targetRoot },
  };
}
