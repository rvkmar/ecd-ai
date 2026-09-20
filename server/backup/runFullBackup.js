/**
 * D107 — scheduled encrypted full backup.
 *
 * Packs ECD JSON + Mongo users/questions (+ optional materials dir), gzip,
 * AES-256-GCM. Retention prunes old ecd-full-*.ecd.bak.enc files.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { backupDirPath } from "../../src/utils/db-server.js";
import { dbAdapter } from "../utils/dbAdapter.js";
import { BACKUP_INVENTORY, inventoryIncluded, inventoryExcluded, BACKUP_FILE_PREFIX, BACKUP_FILE_SUFFIX } from "./inventory.js";
import {
  decryptBackupBlob,
  encryptBackupBlob,
  parseBackupEncryptionKey,
} from "./cryptoArchive.js";

function ecdDbFilePath() {
  return process.env.ECD_DB_FILE || path.join(process.cwd(), "db.json");
}

function materialsDirPath(env = process.env) {
  const d = (env.ECD_MATERIALS_DIR || "").trim();
  return d || null;
}

function retentionDays(env = process.env) {
  const n = Number(env.ECD_BACKUP_RETENTION_DAYS);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 14;
}

function stampFor(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function isScheduledBackupName(name) {
  return (
    typeof name === "string" &&
    name.startsWith(BACKUP_FILE_PREFIX) &&
    name.endsWith(BACKUP_FILE_SUFFIX)
  );
}

/**
 * Walk a directory; return relative path → Buffer map (files only).
 * @param {string} root
 * @returns {Record<string, Buffer>}
 */
function readTreeFiles(root) {
  /** @type {Record<string, Buffer>} */
  const out = {};
  if (!root || !fs.existsSync(root)) return out;
  const walk = (dir, relBase) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = relBase ? `${relBase}/${name}` : name;
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full, rel);
      else if (st.isFile()) out[rel.replace(/\\/g, "/")] = fs.readFileSync(full);
    }
  };
  walk(root, "");
  return out;
}

/**
 * @param {{ listCollection?: (name: string) => Promise<unknown[]> }} [deps]
 */
async function exportMongoCollections(deps = {}) {
  const list =
    deps.listCollection || ((name) => dbAdapter.list(name));
  const users = await list("users");
  const questions = await list("questions");
  return {
    "mongo/users.json": Buffer.from(JSON.stringify(users ?? [], null, 2), "utf8"),
    "mongo/questions.json": Buffer.from(
      JSON.stringify(questions ?? [], null, 2),
      "utf8"
    ),
  };
}

/**
 * @param {object} [options]
 * @returns {Promise<{
 *   ok: boolean,
 *   path?: string,
 *   createdAt: string,
 *   byteLength?: number,
 *   retentionDeleted: string[],
 *   inventoryCount: number,
 *   error?: string,
 * }>}
 */
export async function runFullBackup(options = {}) {
  const env = options.env || process.env;
  const createdAt = (options.now || new Date()).toISOString();
  const key =
    options.key !== undefined
      ? options.key
      : parseBackupEncryptionKey(env);
  if (!key) {
    return {
      ok: false,
      createdAt,
      retentionDeleted: [],
      inventoryCount: BACKUP_INVENTORY.length,
      error:
        "ECD_BACKUP_ENCRYPTION_KEY missing or invalid (need 64 hex chars, 32-byte base64, or passphrase ≥32 chars). Keys must not live in compose YAML.",
    };
  }

  const backupDir = options.backupDir || backupDirPath();
  fs.mkdirSync(backupDir, { recursive: true });

  const ecdPath = options.ecdFile || ecdDbFilePath();
  /** @type {Record<string, Buffer>} */
  const files = {};

  if (fs.existsSync(ecdPath)) {
    files["ecd/db.json"] = fs.readFileSync(ecdPath);
  } else {
    files["ecd/db.json"] = Buffer.from("{}", "utf8");
  }

  Object.assign(files, await exportMongoCollections(options));

  const matDir = options.materialsDir !== undefined
    ? options.materialsDir
    : materialsDirPath(env);
  if (matDir && fs.existsSync(matDir)) {
    const tree = readTreeFiles(matDir);
    for (const [rel, buf] of Object.entries(tree)) {
      files[`materials/${rel}`] = buf;
    }
  }

  const manifest = {
    version: 1,
    createdAt,
    adr: "0007",
    unit: "D107",
    inventory: BACKUP_INVENTORY,
    includedPaths: inventoryIncluded().map((r) => r.pathInArchive),
    excludedIds: inventoryExcluded().map((r) => r.id),
    filePaths: Object.keys(files).sort(),
    notes: [
      "calibrationJobs and analysisArtefacts are inside ecd/db.json",
      "uploaded task materials are inline on items unless ECD_MATERIALS_DIR is set",
    ],
  };
  files["manifest.json"] = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");

  const payload = {
    version: 1,
    createdAt,
    files: Object.fromEntries(
      Object.entries(files).map(([p, buf]) => [p, buf.toString("base64")])
    ),
  };
  const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(payload), "utf8"), {
    level: 9,
  });
  const encrypted = encryptBackupBlob(compressed, key);

  const filename = `${BACKUP_FILE_PREFIX}${stampFor(new Date(createdAt))}${BACKUP_FILE_SUFFIX}`;
  const outPath = path.join(backupDir, filename);
  const tmp = `${outPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, encrypted);
  fs.renameSync(tmp, outPath);

  // Integrity: decrypt must yield the same compressed payload (also keeps
  // decryptBackupBlob as a live production caller for the dead-export guard).
  const roundTrip = decryptBackupBlob(fs.readFileSync(outPath), key);
  if (!roundTrip.equals(compressed)) {
    try {
      fs.unlinkSync(outPath);
    } catch {
      // best-effort
    }
    return {
      ok: false,
      createdAt,
      retentionDeleted: [],
      inventoryCount: BACKUP_INVENTORY.length,
      error: "Backup integrity check failed after encrypt (decrypt mismatch)",
    };
  }

  // Sidecar for operators who cannot decrypt — age + inventory only.
  const metaPath = `${outPath}.meta.json`;
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        createdAt,
        file: filename,
        byteLength: encrypted.length,
        encrypted: true,
        algorithm: "aes-256-gcm",
        inventoryCount: BACKUP_INVENTORY.length,
      },
      null,
      2
    ),
    "utf8"
  );

  const retentionDeleted = pruneOldBackups(backupDir, retentionDays(env), {
    nowMs: Date.parse(createdAt) || Date.now(),
  });

  return {
    ok: true,
    path: outPath,
    createdAt,
    byteLength: encrypted.length,
    retentionDeleted,
    inventoryCount: BACKUP_INVENTORY.length,
  };
}

/**
 * @param {string} backupDir
 * @param {number} days
 * @param {{ nowMs?: number }} [opts]
 */
function pruneOldBackups(backupDir, days, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const maxAge = days * 24 * 60 * 60 * 1000;
  const deleted = [];
  if (!fs.existsSync(backupDir)) return deleted;
  for (const name of fs.readdirSync(backupDir)) {
    if (!isScheduledBackupName(name) && !name.endsWith(`${BACKUP_FILE_SUFFIX}.meta.json`)) {
      continue;
    }
    const full = path.join(backupDir, name);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    if (nowMs - st.mtimeMs > maxAge) {
      try {
        fs.unlinkSync(full);
        deleted.push(name);
      } catch {
        // best-effort
      }
    }
  }
  return deleted;
}
