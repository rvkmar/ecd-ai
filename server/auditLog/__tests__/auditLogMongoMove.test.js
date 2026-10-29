import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import zlib from "zlib";
import { forgetDbCache, saveDB, recordAuditEvent } from "../../../src/utils/db-server.js";
import { migrateFileAuditLog } from "../../migrations/migrations/012-auditlog-to-mongo.js";
import { runFullBackup } from "../../backup/runFullBackup.js";
import { decryptBackupBlob } from "../../backup/cryptoArchive.js";
import { AUDIT_INDEX_FIELDS, resolveAuditLogRetentionDays } from "../auditBackend.js";
import { auditEntriesMatch } from "../auditCanonical.js";
import {
  appendAuditEntries,
  exportAllAuditEntries,
  queryAuditLog,
  resetAuditStoreForTests,
  upsertAuditEntries,
} from "../auditRepository.js";

function readFile() {
  return JSON.parse(fs.readFileSync(process.env.ECD_DB_FILE, "utf8"));
}

let tmp;
let prevBackend;
let prevFile;
let prevBackup;
let prevRetention;
let prevKey;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-audit-"));
  prevBackend = process.env.AUDITLOG_BACKEND;
  prevFile = process.env.ECD_DB_FILE;
  prevBackup = process.env.ECD_BACKUP_DIR;
  prevRetention = process.env.AUDITLOG_RETENTION_DAYS;
  prevKey = process.env.ECD_BACKUP_ENCRYPTION_KEY;
  process.env.AUDITLOG_BACKEND = "memory";
  process.env.ECD_DB_FILE = path.join(tmp, "db.json");
  process.env.ECD_BACKUP_DIR = path.join(tmp, "backups");
  delete process.env.AUDITLOG_RETENTION_DAYS;
  resetAuditStoreForTests();
  forgetDbCache();
});

afterEach(() => {
  resetAuditStoreForTests();
  forgetDbCache();
  if (prevBackend === undefined) delete process.env.AUDITLOG_BACKEND;
  else process.env.AUDITLOG_BACKEND = prevBackend;
  if (prevFile === undefined) delete process.env.ECD_DB_FILE;
  else process.env.ECD_DB_FILE = prevFile;
  if (prevBackup === undefined) delete process.env.ECD_BACKUP_DIR;
  else process.env.ECD_BACKUP_DIR = prevBackup;
  if (prevRetention === undefined) delete process.env.AUDITLOG_RETENTION_DAYS;
  else process.env.AUDITLOG_RETENTION_DAYS = prevRetention;
  if (prevKey === undefined) delete process.env.ECD_BACKUP_ENCRYPTION_KEY;
  else process.env.ECD_BACKUP_ENCRYPTION_KEY = prevKey;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("audit repository memory", () => {
  it("appends, lists by action/actor/time, and is idempotent by id", async () => {
    const a = {
      id: "aud1",
      at: "2026-10-29T10:00:00.000Z",
      action: "lifecycle.transition",
      actor: { userId: "admin1", role: "admin" },
      entity: { collection: "taskModels", id: "tm1", version: 1 },
      detail: { from: "confirmed", to: "operational" },
      requestId: null,
    };
    const b = {
      id: "aud2",
      at: "2026-10-29T11:00:00.000Z",
      action: "human_rating.complete",
      actor: { userId: "rater1", role: "teacher" },
      entity: { collection: "sessions", id: "s1", version: null },
      detail: { responseIndex: 0 },
      requestId: null,
    };
    await appendAuditEntries([a, b]);
    await appendAuditEntries([{ ...a, detail: { from: "confirmed", to: "operational" } }]);

    const all = await queryAuditLog({});
    expect(all.map((row) => row.id)).toEqual(["aud2", "aud1"]);

    const byAction = await queryAuditLog({ action: "human_rating.complete" });
    expect(byAction.map((row) => row.id)).toEqual(["aud2"]);

    const byActor = await queryAuditLog({ actor: "admin" });
    expect(byActor.map((row) => row.id)).toEqual(["aud1"]);

    const byTime = await queryAuditLog({
      from: "2026-10-29T10:30:00.000Z",
      to: "2026-10-29T12:00:00.000Z",
    });
    expect(byTime.map((row) => row.id)).toEqual(["aud2"]);

    const byEntity = await queryAuditLog({
      entityCollection: "taskModels",
      entityId: "tm1",
    });
    expect(byEntity.map((row) => row.id)).toEqual(["aud1"]);
  });

  it("documents the index fields used for listing", () => {
    const fields = AUDIT_INDEX_FIELDS.map((spec) => spec[0]);
    expect(fields).toContain("id");
    expect(fields).toContain("at");
    expect(fields).toContain("action");
    expect(fields).toContain("actor.userId");
    expect(fields).toContainEqual(["entity.collection", "entity.id"]);
    expect(resolveAuditLogRetentionDays({})).toBe(0);
    expect(resolveAuditLogRetentionDays({ AUDITLOG_RETENTION_DAYS: "90" })).toBe(90);
  });
});

describe("012 auditLog migration", () => {
  function writeAudit(rows) {
    fs.writeFileSync(
      process.env.ECD_DB_FILE,
      JSON.stringify({ items: [{ id: "i1" }], auditLog: rows, sessions: [] })
    );
    forgetDbCache();
  }

  it("dry-run reports ids and leaves the file untouched", async () => {
    writeAudit([
      {
        id: "aud1",
        at: "2026-10-29T10:00:00.000Z",
        action: "entity.create",
        actor: { userId: "a", role: "admin" },
        entity: { collection: "items", id: "i1", version: 1 },
        detail: {},
        requestId: null,
      },
    ]);
    const result = await migrateFileAuditLog({ dryRun: true });
    expect(result.changed).toEqual(["aud1"]);
    expect(result.summary).toMatch(/Would copy 1/);
    expect(readFile().auditLog).toHaveLength(1);
    expect(await exportAllAuditEntries()).toEqual([]);
  });

  it("copies, verifies count and canonical form, then removes auditLog", async () => {
    const rows = [
      {
        id: "aud1",
        at: "2026-10-29T10:00:00.000Z",
        action: "lifecycle.transition",
        actor: { userId: "admin1", role: "admin" },
        entity: { collection: "items", id: "i1", version: 1 },
        detail: { from: "draft", to: "reviewed" },
        requestId: null,
      },
      {
        id: "aud2",
        at: "2026-10-29T11:00:00.000Z",
        action: "auth.failure",
        actor: { userId: "x", role: null },
        entity: { collection: "users", id: "x", version: null },
        detail: { reason: "invalid_credentials" },
        requestId: null,
      },
    ];
    writeAudit(rows);
    const result = await migrateFileAuditLog({ dryRun: false });
    expect(result.changed).toEqual(["aud1", "aud2"]);
    expect(readFile().auditLog).toBeUndefined();
    expect(readFile().items).toEqual([{ id: "i1" }]);
    const stored = await exportAllAuditEntries();
    expect(stored.map((row) => row.id).sort()).toEqual(["aud1", "aud2"]);
    expect(auditEntriesMatch(rows[0], stored.find((r) => r.id === "aud1"))).toBe(true);
    expect(
      fs.existsSync(path.join(process.env.ECD_BACKUP_DIR, "db.json.pre-auditlog-mongo"))
    ).toBe(true);
  });

  it("re-run leaves the store in place when the file has no auditLog", async () => {
    writeAudit([
      {
        id: "aud1",
        at: "2026-10-29T10:00:00.000Z",
        action: "entity.create",
        actor: { userId: "a", role: "admin" },
        entity: { collection: "items", id: "i1", version: null },
        detail: {},
        requestId: null,
      },
    ]);
    await migrateFileAuditLog({ dryRun: false });
    const again = await migrateFileAuditLog({ dryRun: false });
    expect(again.changed).toEqual([]);
    expect(again.summary).toMatch(/Nothing to copy/);
    expect((await exportAllAuditEntries()).map((row) => row.id)).toEqual(["aud1"]);
  });

  it("does not strip the file when verification fails", async () => {
    writeAudit([
      {
        id: "aud1",
        at: "2026-10-29T10:00:00.000Z",
        action: "entity.create",
        actor: { userId: "a", role: "admin" },
        entity: { collection: "items", id: "i1", version: null },
        detail: { status: "draft" },
        requestId: null,
      },
    ]);
    await expect(
      migrateFileAuditLog({
        dryRun: false,
        upsert: async () => ["aud1"],
        loadStored: async () => [
          {
            id: "aud1",
            at: "2026-10-29T10:00:00.000Z",
            action: "entity.create",
            actor: { userId: "a", role: "admin" },
            entity: { collection: "items", id: "i1", version: null },
            detail: {},
            requestId: null,
          },
        ],
      })
    ).rejects.toThrow(/do not match/);
    expect(readFile().auditLog).toHaveLength(1);
    expect(readFile().auditLog[0].detail).toEqual({ status: "draft" });
  });

  it("leaves the JSON harness file alone", async () => {
    writeAudit([
      {
        id: "aud1",
        at: "2026-10-29T10:00:00.000Z",
        action: "entity.create",
        actor: { userId: "a", role: "admin" },
        entity: { collection: "items", id: "i1", version: null },
        detail: {},
        requestId: null,
      },
    ]);
    const result = await migrateFileAuditLog({ dryRun: false, backend: "json" });
    expect(result.summary).toMatch(/JSON harness/);
    expect(readFile().auditLog).toHaveLength(1);
  });
});

describe("saveDB omits auditLog in external mode", () => {
  it("diffs lifecycle changes into the store and omits auditLog from the file", async () => {
    fs.writeFileSync(
      process.env.ECD_DB_FILE,
      JSON.stringify({
        items: [{ id: "i1", status: "draft", versionNumber: 1 }],
        competencyModels: [],
        evidenceModels: [],
        taskModels: [],
        assemblyModels: [],
        qMatrixModels: [],
        presentationModels: [],
        policies: [],
        curricularPolicies: [],
        calibrationJobs: [],
        sessions: [],
      })
    );
    forgetDbCache();
    const { loadDB } = await import("../../../src/utils/db-server.js");
    const db = loadDB();
    db.items[0].status = "reviewed";
    await saveDB(db);

    const onDisk = readFile();
    expect(onDisk.auditLog).toBeUndefined();
    expect(onDisk.items[0].status).toBe("reviewed");
    const stored = await exportAllAuditEntries();
    expect(stored.some((row) => row.action === "lifecycle.transition")).toBe(true);
    expect(
      stored.find((row) => row.action === "lifecycle.transition").entity.id
    ).toBe("i1");
  });

  it("recordAuditEvent writes the store without putting auditLog on disk", async () => {
    fs.writeFileSync(
      process.env.ECD_DB_FILE,
      JSON.stringify({ items: [{ id: "i1" }], sessions: [] })
    );
    forgetDbCache();
    await recordAuditEvent({
      action: "auth.failure",
      entity: { collection: "users", id: "x", version: null },
      detail: { reason: "invalid_credentials" },
      actor: { userId: "x", role: null },
    });
    expect(readFile().auditLog).toBeUndefined();
    const stored = await exportAllAuditEntries();
    expect(stored.map((row) => row.action)).toEqual(["auth.failure"]);
  });
});

describe("backup includes mongo/auditLog.json", () => {
  it("packs external audit rows into the encrypted archive", async () => {
    process.env.ECD_BACKUP_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(
      process.env.ECD_DB_FILE,
      JSON.stringify({ items: [{ id: "i1" }], calibrationJobs: [], analysisArtefacts: [] })
    );
    forgetDbCache();
    await upsertAuditEntries([
      {
        id: "aud-bak",
        at: "2026-10-29T12:00:00.000Z",
        action: "lifecycle.transition",
        actor: { userId: "admin1", role: "admin" },
        entity: { collection: "items", id: "i1", version: 1 },
        detail: { from: "draft", to: "reviewed" },
        requestId: null,
      },
    ]);
    const result = await runFullBackup({
      listCollection: async () => [],
    });
    expect(result.ok).toBe(true);
    const key = Buffer.from(process.env.ECD_BACKUP_ENCRYPTION_KEY, "hex");
    const compressed = decryptBackupBlob(fs.readFileSync(result.path), key);
    const payload = JSON.parse(zlib.gunzipSync(compressed).toString("utf8"));
    const auditBuf = Buffer.from(payload.files["mongo/auditLog.json"], "base64");
    const rows = JSON.parse(auditBuf.toString("utf8"));
    expect(rows.map((row) => row.id)).toEqual(["aud-bak"]);
    const ecd = JSON.parse(Buffer.from(payload.files["ecd/db.json"], "base64").toString("utf8"));
    expect(ecd.auditLog).toBeUndefined();
  });
});
