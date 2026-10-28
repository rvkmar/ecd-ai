// JSON save path: cache the previous snapshot, write minified JSON,
// throttle db.json.<timestamp> crash copies.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { applySaveAudits, auditBaseline } from "../auditLog.js";
import { runWithTenancy } from "../tenancyContext.js";

const district = {
  role: "district",
  username: "dist1",
  viewScope: "district",
  districtId: "tn-chennai",
  schoolId: null,
};

function snapshotNames(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => /^db\.json\.\d{4}-\d{2}-\d{2}T/.test(name))
    .sort();
}

describe("auditBaseline stays put when the live db is mutated", () => {
  it("matches a deep copy for the fields saveDB diffs", () => {
    const original = {
      evidenceModels: [
        {
          id: "em1",
          status: "confirmed",
          versionNumber: 1,
          competencyId: "c1",
          statisticalModels: [
            { id: "sm1", type: "dina", active: true, activeParameterSetId: "ps1" },
          ],
        },
      ],
      competencyModels: [
        {
          id: "cm1",
          status: "operational",
          domainAnalysisId: "da1",
          psychologicalPerspective: "trait",
        },
      ],
      competencies: [{ id: "c1", modelId: "cm1" }],
      domainAnalyses: [
        { id: "da1", name: "Fractions", psychologicalPerspective: "trait" },
      ],
      calibrationJobs: [
        { id: "job1", status: "queued", kind: "irt", ingestedParameterSetId: null },
      ],
      sessions: [
        {
          id: "s1",
          responses: [{ taskId: "t1", humanRatedAt: null, rawAnswer: { selected: "A" } }],
        },
      ],
      auditLog: [],
    };
    const baseline = auditBaseline(original);
    const frozen = structuredClone(original);

    original.evidenceModels[0].status = "operational";
    original.evidenceModels[0].statisticalModels[0].activeParameterSetId = "ps2";
    original.calibrationJobs[0].status = "running";
    original.sessions[0].responses[0].humanRatedAt = "2026-04-01T00:00:00.000Z";
    original.sessions[0].responses[0].rawAnswer.selected = "B";

    expect(baseline.evidenceModels[0].status).toBe("confirmed");
    expect(baseline.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBe("ps1");
    expect(baseline.calibrationJobs[0].status).toBe("queued");
    expect(baseline.sessions[0].responses[0].humanRatedAt).toBeNull();

    const viaBaseline = structuredClone(original);
    const viaClone = structuredClone(original);
    applySaveAudits(baseline, viaBaseline);
    applySaveAudits(frozen, viaClone);
    const shape = (db) =>
      (db.auditLog || []).map((entry) => ({ action: entry.action, detail: entry.detail }));
    expect(shape(viaBaseline)).toEqual(shape(viaClone));
  });
});

describe("saveDB cache, minified JSON, snapshot throttle", () => {
  let tmpDir;
  let prevDbFile;
  let prevBackup;
  let prevInterval;
  let prevKeep;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-json-save-"));
    prevDbFile = process.env.ECD_DB_FILE;
    prevBackup = process.env.ECD_BACKUP_DIR;
    prevInterval = process.env.ECD_SNAPSHOT_INTERVAL_MS;
    prevKeep = process.env.ECD_SNAPSHOT_KEEP;
    process.env.ECD_DB_FILE = path.join(tmpDir, "db.json");
    process.env.ECD_BACKUP_DIR = path.join(tmpDir, "backups");
    delete process.env.ECD_SNAPSHOT_INTERVAL_MS;
    delete process.env.ECD_SNAPSHOT_KEEP;
  });

  afterEach(() => {
    if (prevDbFile === undefined) delete process.env.ECD_DB_FILE;
    else process.env.ECD_DB_FILE = prevDbFile;
    if (prevBackup === undefined) delete process.env.ECD_BACKUP_DIR;
    else process.env.ECD_BACKUP_DIR = prevBackup;
    if (prevInterval === undefined) delete process.env.ECD_SNAPSHOT_INTERVAL_MS;
    else process.env.ECD_SNAPSHOT_INTERVAL_MS = prevInterval;
    if (prevKeep === undefined) delete process.env.ECD_SNAPSHOT_KEEP;
    else process.env.ECD_SNAPSHOT_KEEP = prevKeep;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function dbApi() {
    return import("../../../src/utils/db-server.js");
  }

  it("uses the cache on an in-place edit and still audits the old status", async () => {
    const { loadDB, saveDB, readRawDB } = await dbApi();
    saveDB(
      {
        evidenceModels: [
          {
            id: "em1",
            status: "draft",
            versionNumber: 1,
            competencyId: "c1",
            statisticalModels: [
              { id: "sm1", type: "irt", active: true, activeParameterSetId: "ps1" },
            ],
          },
        ],
        calibrationJobs: [{ id: "job1", status: "queued" }],
        sessions: [
          { id: "s1", responses: [{ taskId: "t1", humanRatedAt: null }] },
        ],
        auditLog: [],
      },
      { skipAudit: true, now: "2026-06-01T00:00:00.000Z" }
    );

    const reads = vi.spyOn(fs, "readFileSync");
    const db = loadDB();
    reads.mockClear();
    db.evidenceModels[0].status = "reviewed";
    db.evidenceModels[0].statisticalModels[0].activeParameterSetId = "ps2";
    db.calibrationJobs[0].status = "running";
    db.sessions[0].responses[0].humanRatedAt = "2026-06-01T00:01:00.000Z";
    saveDB(db, { now: "2026-06-01T00:00:01.000Z" });
    const readsDuringSave = reads.mock.calls.length;
    reads.mockRestore();
    expect(readsDuringSave).toBe(0);

    db.evidenceModels[0].status = "confirmed";
    saveDB(db, { now: "2026-06-01T00:00:02.000Z" });

    const raw = readRawDB();
    const transitions = (raw.auditLog || []).filter(
      (entry) => entry.action === "lifecycle.transition"
    );
    expect(transitions.map((entry) => entry.detail)).toEqual([
      { from: "draft", to: "reviewed" },
      { from: "reviewed", to: "confirmed" },
    ]);
    expect(
      (raw.auditLog || []).some((entry) => entry.action === "parameter_set.replace")
    ).toBe(true);
    expect(
      (raw.auditLog || []).some((entry) => entry.action === "calibration_job.transition")
    ).toBe(true);
    expect(
      (raw.auditLog || []).some((entry) => entry.action === "human_rating.complete")
    ).toBe(true);

    const text = fs.readFileSync(process.env.ECD_DB_FILE, "utf8");
    expect(text.includes("\n")).toBe(false);
    expect(JSON.parse(text).evidenceModels[0].status).toBe("confirmed");
  });

  it("re-reads when the file changes under the cache", async () => {
    const { loadDB, saveDB, readRawDB } = await dbApi();
    saveDB(
      {
        evidenceModels: [{ id: "em1", status: "draft", versionNumber: 1 }],
        auditLog: [],
      },
      { skipAudit: true, now: "2026-06-02T00:00:00.000Z" }
    );
    const db = loadDB();
    const disk = JSON.parse(fs.readFileSync(process.env.ECD_DB_FILE, "utf8"));
    disk.evidenceModels[0].status = "reviewed";
    disk.evidenceModels[0].marker = "external";
    fs.writeFileSync(process.env.ECD_DB_FILE, JSON.stringify(disk));
    const bumped = new Date(Date.now() + 10_000);
    fs.utimesSync(process.env.ECD_DB_FILE, bumped, bumped);

    db.evidenceModels[0].status = "confirmed";
    saveDB(db, { now: "2026-06-02T00:05:00.000Z" });

    const raw = readRawDB();
    const transitions = (raw.auditLog || []).filter(
      (entry) => entry.action === "lifecycle.transition"
    );
    // Unscoped save writes the caller's object. The external marker is not
    // on that object, so it is not kept. The audited "from" is the disk
    // status, which is what proves the cache missed.
    expect(transitions.map((entry) => entry.detail)).toEqual([
      { from: "reviewed", to: "confirmed" },
    ]);
    expect(raw.evidenceModels[0].status).toBe("confirmed");
  });

  it("loads a pretty file and writes minified JSON", async () => {
    const { readRawDB, saveDB } = await dbApi();
    fs.writeFileSync(
      process.env.ECD_DB_FILE,
      JSON.stringify(
        { evidenceModels: [{ id: "em1", status: "draft" }], auditLog: [] },
        null,
        2
      )
    );
    const db = readRawDB();
    expect(db.evidenceModels[0].status).toBe("draft");
    db.evidenceModels[0].status = "reviewed";
    saveDB(db, { now: "2026-06-03T00:00:00.000Z" });
    const text = fs.readFileSync(process.env.ECD_DB_FILE, "utf8");
    expect(text.includes("\n")).toBe(false);
    expect(JSON.parse(text).evidenceModels[0].status).toBe("reviewed");
  });

  it("keeps hidden tenant rows and audits an in-place rating without a second read", async () => {
    const { loadDB, saveDB, readRawDB } = await dbApi();
    const seeded = {
      students: [
        { id: "stu-a", districtId: "tn-chennai" },
        { id: "stu-b", districtId: "tn-madurai" },
      ],
      sessions: [
        {
          id: "s-a",
          studentId: "stu-a",
          responses: [{ taskId: "t1", humanRatedAt: null, rawAnswer: { selected: "A" } }],
        },
        {
          id: "s-b",
          studentId: "stu-b",
          responses: [{ taskId: "t9", note: "hidden", humanRatedAt: null }],
        },
      ],
      evidenceModels: [{ id: "em1", status: "draft", versionNumber: 1 }],
      auditLog: [],
    };
    saveDB(seeded, { skipAudit: true, now: "2026-06-04T00:00:00.000Z" });

    const reads = vi.spyOn(fs, "readFileSync");
    runWithTenancy(district, () => {
      const db = loadDB();
      expect(db.sessions.map((row) => row.id)).toEqual(["s-a"]);
      reads.mockClear();
      db.sessions[0].responses[0].humanRatedAt = "2026-06-04T00:02:00.000Z";
      db.sessions[0].responses[0].rawAnswer.selected = "C";
      db.evidenceModels[0].status = "reviewed";
      saveDB(db, { now: "2026-06-04T00:02:00.000Z" });
      expect(reads).not.toHaveBeenCalled();
      const again = loadDB();
      expect(reads).not.toHaveBeenCalled();
      expect(again.sessions.map((row) => row.id)).toEqual(["s-a"]);
      expect(again.evidenceModels[0].status).toBe("reviewed");
    });
    reads.mockRestore();

    const raw = readRawDB();
    expect(raw.sessions.map((row) => row.id).sort()).toEqual(["s-a", "s-b"]);
    expect(raw.sessions.find((row) => row.id === "s-b").responses[0].note).toBe("hidden");
    expect(raw.sessions.find((row) => row.id === "s-a").responses[0].rawAnswer.selected).toBe(
      "C"
    );
    const ratings = (raw.auditLog || []).filter(
      (entry) => entry.action === "human_rating.complete"
    );
    expect(ratings).toHaveLength(1);
    expect(ratings[0].detail.taskId).toBe("t1");
    const transitions = (raw.auditLog || []).filter(
      (entry) => entry.action === "lifecycle.transition"
    );
    expect(transitions.map((entry) => entry.detail)).toEqual([
      { from: "draft", to: "reviewed" },
    ]);
  });

  it("copies on the interval, prunes to KEEP, and leaves other names", async () => {
    const { saveDB } = await dbApi();
    process.env.ECD_SNAPSHOT_INTERVAL_MS = "300000";
    process.env.ECD_SNAPSHOT_KEEP = "20";
    const dir = process.env.ECD_BACKUP_DIR;
    fs.mkdirSync(dir, { recursive: true });
    const keepNames = [
      "db.json.old",
      "db.json.manual",
      "notes.txt",
      "ecd-full-2026-01-01T00-00-00-000Z.ecd.bak.enc",
      "ecd-full-2026-01-01T00-00-00-000Z.ecd.bak.enc.meta.json",
    ];
    for (const name of keepNames) {
      fs.writeFileSync(path.join(dir, name), "leave-me");
    }

    const body = { evidenceModels: [{ id: "em1", status: "draft" }], auditLog: [] };
    saveDB(body, { skipAudit: true, now: "2026-07-01T00:00:00.000Z" });
    saveDB(body, { skipAudit: true, now: "2026-07-01T00:01:00.000Z" });
    saveDB(body, { skipAudit: true, now: "2026-07-01T00:05:00.000Z" });
    expect(snapshotNames(dir)).toEqual([
      "db.json.2026-07-01T00-00-00-000Z",
      "db.json.2026-07-01T00-05-00-000Z",
    ]);

    process.env.ECD_SNAPSHOT_INTERVAL_MS = "0";
    process.env.ECD_SNAPSHOT_KEEP = "2";
    for (let i = 1; i <= 4; i++) {
      saveDB(
        { evidenceModels: [{ id: "em1", status: "draft", n: i }], auditLog: [] },
        { skipAudit: true, now: `2026-07-02T00:0${i}:00.000Z` }
      );
    }
    const left = snapshotNames(dir);
    expect(left).toHaveLength(2);
    expect(left).toEqual([
      "db.json.2026-07-02T00-03-00-000Z",
      "db.json.2026-07-02T00-04-00-000Z",
    ]);
    for (const name of keepNames) {
      expect(fs.readFileSync(path.join(dir, name), "utf8")).toBe("leave-me");
    }
  });

  it("prunes old crash copies even when this save is inside the interval", async () => {
    const { saveDB } = await dbApi();
    process.env.ECD_SNAPSHOT_INTERVAL_MS = "300000";
    process.env.ECD_SNAPSHOT_KEEP = "1";
    const dir = process.env.ECD_BACKUP_DIR;
    fs.mkdirSync(dir, { recursive: true });
    for (const name of [
      "db.json.2026-08-01T00-00-00-000Z",
      "db.json.2026-08-02T00-00-00-000Z",
      "db.json.2026-08-03T00-00-00-000Z",
    ]) {
      fs.writeFileSync(path.join(dir, name), "{}");
    }
    fs.writeFileSync(path.join(dir, "operator-copy.json"), "{\"manual\":true}");
    saveDB(
      { evidenceModels: [], auditLog: [] },
      { skipAudit: true, now: "2026-08-03T00:01:00.000Z" }
    );
    expect(snapshotNames(dir)).toEqual(["db.json.2026-08-03T00-00-00-000Z"]);
    expect(fs.existsSync(path.join(dir, "operator-copy.json"))).toBe(true);
  });
});
