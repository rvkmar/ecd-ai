import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import zlib from "zlib";
import {
  encryptBackupBlob,
  decryptBackupBlob,
  parseBackupEncryptionKey,
} from "../cryptoArchive.js";
import {
  BACKUP_INVENTORY,
  inventoryIncluded,
  inventoryExcluded,
  BACKUP_FILE_PREFIX,
  BACKUP_FILE_SUFFIX,
} from "../inventory.js";
import { runFullBackup } from "../runFullBackup.js";

function openEncryptedBackup(blob, key) {
  const compressed = decryptBackupBlob(blob, key);
  const json = zlib.gunzipSync(compressed).toString("utf8");
  const payload = JSON.parse(json);
  const files = {};
  for (const [p, b64] of Object.entries(payload.files || {})) {
    files[p] = Buffer.from(b64, "base64");
  }
  return { createdAt: payload.createdAt, files };
}

describe("D107 backup crypto", () => {
  it("round-trips AES-256-GCM", () => {
    const key = crypto.randomBytes(32);
    const plain = Buffer.from("ecd-backup-payload", "utf8");
    const blob = encryptBackupBlob(plain, key);
    expect(decryptBackupBlob(blob, key).toString("utf8")).toBe(
      "ecd-backup-payload"
    );
  });

  it("parses 64-char hex keys", () => {
    const hex = crypto.randomBytes(32).toString("hex");
    expect(parseBackupEncryptionKey({ ECD_BACKUP_ENCRYPTION_KEY: hex })).toEqual(
      Buffer.from(hex, "hex")
    );
  });

  it("rejects short keys", () => {
    expect(parseBackupEncryptionKey({ ECD_BACKUP_ENCRYPTION_KEY: "short" })).toBeNull();
  });
});

describe("D107 backup inventory", () => {
  it("accounts for jobs and artefacts as included", () => {
    const ids = BACKUP_INVENTORY.map((r) => r.id);
    expect(ids).toContain("calibrationJobs");
    expect(ids).toContain("analysisArtefacts");
    expect(ids).toContain("users");
    expect(ids).toContain("sessions");
    expect(ids).toContain("auditLog");
    expect(ids).toContain("presentationModels");
    const jobs = BACKUP_INVENTORY.find((r) => r.id === "calibrationJobs");
    expect(jobs.pathInArchive).toBe("mongo/calibrationJobs.json");
    const artefacts = BACKUP_INVENTORY.find((r) => r.id === "analysisArtefacts");
    expect(artefacts.pathInArchive).toBe("mongo/analysisArtefacts.json");
    const audit = BACKUP_INVENTORY.find((r) => r.id === "auditLog");
    expect(audit.pathInArchive).toBe("mongo/auditLog.json");
  });

  it("has an explicit reason on every excluded row", () => {
    for (const row of inventoryExcluded()) {
      expect(row.reason.length).toBeGreaterThan(10);
      expect(row.pathInArchive).toBeNull();
    }
    expect(inventoryIncluded().length).toBeGreaterThan(10);
  });
});

describe("D107 runFullBackup", () => {
  let tmp;
  let prevBackup;
  let prevEcd;
  let prevKey;
  let prevRetention;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-d107-"));
    prevBackup = process.env.ECD_BACKUP_DIR;
    prevEcd = process.env.ECD_DB_FILE;
    prevKey = process.env.ECD_BACKUP_ENCRYPTION_KEY;
    prevRetention = process.env.ECD_BACKUP_RETENTION_DAYS;
    process.env.ECD_BACKUP_DIR = path.join(tmp, "backups");
    process.env.ECD_DB_FILE = path.join(tmp, "db.json");
    process.env.ECD_BACKUP_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
    process.env.ECD_BACKUP_RETENTION_DAYS = "14";
    fs.writeFileSync(
      process.env.ECD_DB_FILE,
      JSON.stringify(
        {
          items: [{ id: "i1", stimulus: { blocks: [{ type: "text", content: "q" }] } }],
          calibrationJobs: [{ id: "job1" }],
          analysisArtefacts: [{ id: "art1" }],
          sessions: [],
          auditLog: [],
        },
        null,
        2
      )
    );
  });

  afterEach(() => {
    if (prevBackup === undefined) delete process.env.ECD_BACKUP_DIR;
    else process.env.ECD_BACKUP_DIR = prevBackup;
    if (prevEcd === undefined) delete process.env.ECD_DB_FILE;
    else process.env.ECD_DB_FILE = prevEcd;
    if (prevKey === undefined) delete process.env.ECD_BACKUP_ENCRYPTION_KEY;
    else process.env.ECD_BACKUP_ENCRYPTION_KEY = prevKey;
    if (prevRetention === undefined) delete process.env.ECD_BACKUP_RETENTION_DAYS;
    else process.env.ECD_BACKUP_RETENTION_DAYS = prevRetention;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("refuses to run without an encryption key", async () => {
    const result = await runFullBackup({
      env: { ...process.env, ECD_BACKUP_ENCRYPTION_KEY: "" },
      key: null,
      listCollection: async () => [],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ECD_BACKUP_ENCRYPTION_KEY/);
  });

  it("writes an encrypted archive that round-trips ECD jobs and artefacts", async () => {
    const key = parseBackupEncryptionKey(process.env);
    const result = await runFullBackup({
      listCollection: async (name) =>
        name === "users"
          ? [{ username: "admin1", role: "admin" }]
          : name === "questions"
            ? [{ id: "q1" }]
            : [],
    });
    expect(result.ok).toBe(true);
    expect(result.path).toMatch(new RegExp(`${BACKUP_FILE_PREFIX}.*${BACKUP_FILE_SUFFIX}$`));
    expect(fs.existsSync(result.path)).toBe(true);
    expect(fs.existsSync(`${result.path}.meta.json`)).toBe(true);

    const opened = openEncryptedBackup(fs.readFileSync(result.path), key);
    const ecd = JSON.parse(opened.files["ecd/db.json"].toString("utf8"));
    expect(ecd.calibrationJobs[0].id).toBe("job1");
    expect(ecd.analysisArtefacts[0].id).toBe("art1");
    const jobsExport = JSON.parse(opened.files["mongo/calibrationJobs.json"].toString("utf8"));
    const artefactsExport = JSON.parse(
      opened.files["mongo/analysisArtefacts.json"].toString("utf8")
    );
    expect(jobsExport[0].id).toBe("job1");
    expect(artefactsExport[0].id).toBe("art1");
    const users = JSON.parse(opened.files["mongo/users.json"].toString("utf8"));
    expect(users[0].username).toBe("admin1");
    expect(opened.files["mongo/auditLog.json"]).toBeTruthy();
    const auditExport = JSON.parse(opened.files["mongo/auditLog.json"].toString("utf8"));
    expect(Array.isArray(auditExport)).toBe(true);
    const manifest = JSON.parse(opened.files["manifest.json"].toString("utf8"));
    expect(manifest.inventory.length).toBe(BACKUP_INVENTORY.length);
  });

  it("prunes scheduled backups older than retention during a run", async () => {
    const dir = process.env.ECD_BACKUP_DIR;
    fs.mkdirSync(dir, { recursive: true });
    const oldName = `${BACKUP_FILE_PREFIX}old${BACKUP_FILE_SUFFIX}`;
    const oldPath = path.join(dir, oldName);
    fs.writeFileSync(oldPath, Buffer.from("x"));
    const ancient = Date.now() - 40 * 24 * 60 * 60 * 1000;
    fs.utimesSync(oldPath, new Date(ancient), new Date(ancient));

    const result = await runFullBackup({
      listCollection: async () => [],
      now: new Date(),
    });
    expect(result.ok).toBe(true);
    expect(result.retentionDeleted).toContain(oldName);
    expect(fs.existsSync(oldPath)).toBe(false);
  });
});
