import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import zlib from "zlib";
import { forgetDbCache, saveDB } from "../../../src/utils/db-server.js";
import { documentsMatch } from "../../calibrationData/documentCanonical.js";
import { migrateFileStudentModelRecords } from "../../migrations/migrations/014-student-model-records-to-mongo.js";
import { STUDENT_MODEL_RECORD_INDEX_FIELDS } from "../studentModelRecordBackend.js";
import {
  commitFinishedStudentModel,
  exportAllStudentModelRecords,
  getStudentModelRecordById,
  queryStudentModelRecords,
  resetStudentModelRecordStoreForTests,
  seedStoredSessionStudentModel,
  upsertStudentModelRecords,
} from "../studentModelRecordRepository.js";
import { runFullBackup } from "../../backup/runFullBackup.js";
import { decryptBackupBlob } from "../../backup/cryptoArchive.js";

const NOW = "2026-01-02T00:00:00.000Z";
const LATER = "2026-02-02T00:00:00.000Z";

function readFile() {
  return JSON.parse(fs.readFileSync(process.env.ECD_DB_FILE, "utf8"));
}

function posterior(estimate, at) {
  return {
    smvId: "smv1",
    competencyModelId: "cm1",
    evidenceModelId: "em1",
    parameterSetId: "ps1",
    estimate,
    updatedAt: at,
    distribution: {},
  };
}

function finishedSession(id, estimate, at) {
  return {
    id,
    studentId: "stu1",
    finishedAt: at,
    studentModel: { smvPosteriors: { smv1: posterior(estimate, at) } },
  };
}

function record(id, extra = {}) {
  return {
    id,
    studentId: "stu1",
    displayName: "Pat",
    identityAliases: ["stu1"],
    competencyModelId: "cm1",
    competencyModelName: "Fractions",
    parameterSetId: "ps1",
    statisticalModelIds: [],
    smvPosteriors: { smv1: posterior(0.2, NOW) },
    history: [
      {
        sessionId: "s1",
        timestamp: NOW,
        posteriorSnapshot: { smv1: posterior(0.2, NOW) },
        parameterSetIds: ["ps1"],
        statisticalModelIds: [],
      },
    ],
    provenance: { source: "session-finish", sessionId: "s1", notes: {} },
    districtId: "d1",
    schoolId: "sch-1",
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

let tmp;
let prevBackend;
let prevFile;
let prevBackup;
let prevKey;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-smr-"));
  prevBackend = process.env.STUDENT_MODEL_RECORDS_BACKEND;
  prevFile = process.env.ECD_DB_FILE;
  prevBackup = process.env.ECD_BACKUP_DIR;
  prevKey = process.env.ECD_BACKUP_ENCRYPTION_KEY;
  process.env.STUDENT_MODEL_RECORDS_BACKEND = "memory";
  process.env.ECD_DB_FILE = path.join(tmp, "db.json");
  process.env.ECD_BACKUP_DIR = path.join(tmp, "backups");
  delete process.env.ECD_BACKUP_ENCRYPTION_KEY;
  resetStudentModelRecordStoreForTests();
  forgetDbCache();
});

afterEach(() => {
  resetStudentModelRecordStoreForTests();
  forgetDbCache();
  if (prevBackend === undefined) delete process.env.STUDENT_MODEL_RECORDS_BACKEND;
  else process.env.STUDENT_MODEL_RECORDS_BACKEND = prevBackend;
  if (prevFile === undefined) delete process.env.ECD_DB_FILE;
  else process.env.ECD_DB_FILE = prevFile;
  if (prevBackup === undefined) delete process.env.ECD_BACKUP_DIR;
  else process.env.ECD_BACKUP_DIR = prevBackup;
  if (prevKey === undefined) delete process.env.ECD_BACKUP_ENCRYPTION_KEY;
  else process.env.ECD_BACKUP_ENCRYPTION_KEY = prevKey;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("student model record repository memory", () => {
  it("filters by student, competency model, and session id, and names those indexes", async () => {
    const db = { competencyModels: [{ id: "cm1", name: "Fractions" }] };
    await commitFinishedStudentModel(db, finishedSession("s1", 0.2, NOW), { now: NOW });
    await commitFinishedStudentModel(
      db,
      {
        ...finishedSession("s9", 0.1, NOW),
        studentId: "stu-other",
        studentModel: {
          smvPosteriors: {
            smv1: { ...posterior(0.1, NOW), competencyModelId: "cm2" },
          },
        },
      },
      { now: NOW }
    );

    const byStudent = await queryStudentModelRecords(db, { studentId: "stu1", unscoped: true });
    expect(byStudent).toHaveLength(1);
    expect(byStudent[0].studentId).toBe("stu1");
    expect(byStudent[0].smvPosteriors.smv1.distribution).toEqual({});

    const byModel = await queryStudentModelRecords(db, {
      competencyModelId: "cm1",
      unscoped: true,
    });
    expect(byModel.map((row) => row.studentId)).toEqual(["stu1"]);

    const bySession = await queryStudentModelRecords(db, { sessionId: "s1", unscoped: true });
    expect(bySession).toHaveLength(1);
    expect(await getStudentModelRecordById({ studentModelRecords: byStudent }, byStudent[0].id)).toMatchObject({
      id: byStudent[0].id,
    });

    const fields = STUDENT_MODEL_RECORD_INDEX_FIELDS.map((spec) => spec[0]);
    expect(fields).toContain("id");
    expect(fields).toContain("studentId");
    expect(fields).toContain("history.sessionId");
    expect(fields).toContain("competencyModelId");
    expect(fields).toContainEqual(["studentId", "competencyModelId"]);
    const compound = STUDENT_MODEL_RECORD_INDEX_FIELDS.find(
      (spec) => Array.isArray(spec[0]) && spec[0][0] === "studentId"
    );
    expect(compound[1].unique).toBe(true);
  });

  it("merges two finishes onto one record and replaces the same session entry", async () => {
    const db = {
      competencyModels: [{ id: "cm1", name: "Fractions" }],
      deliveryModels: [
        { id: "dm1", competencyModelId: "cm1", administration: { carryForward: true } },
      ],
    };
    const [first, second] = await Promise.all([
      commitFinishedStudentModel(db, finishedSession("s1", 0.2, NOW), { now: NOW }),
      commitFinishedStudentModel(db, finishedSession("s2", 0.9, LATER), { now: LATER }),
    ]);
    expect(first.length + second.length).toBeGreaterThan(0);
    const rows = await queryStudentModelRecords(db, { studentId: "stu1", unscoped: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].history.map((entry) => entry.sessionId).sort()).toEqual(["s1", "s2"]);
    expect(rows[0].smvPosteriors.smv1.estimate).toBe(0.9);
    expect(rows[0].smvPosteriors.smv1.distribution).toEqual({});

    await commitFinishedStudentModel(db, finishedSession("s2", 0.4, LATER), { now: LATER });
    const replaced = await queryStudentModelRecords(db, { studentId: "stu1", unscoped: true });
    expect(replaced).toHaveLength(1);
    expect(replaced[0].history.filter((entry) => entry.sessionId === "s2")).toHaveLength(1);
    expect(replaced[0].history.map((entry) => entry.sessionId).sort()).toEqual(["s1", "s2"]);
    expect(replaced[0].id).toBe(rows[0].id);
    expect(replaced[0].createdAt).toBe(rows[0].createdAt);

    const seeded = { id: "s3", studentId: "stu1", studentModel: {}, deliveryModelId: "dm1" };
    await seedStoredSessionStudentModel(seeded, db, { now: LATER });
    expect(seeded.studentModel.carriedForward.recordIds).toEqual([rows[0].id]);
    expect(seeded.studentModel.smvPosteriors.smv1.distribution).toEqual({});
  });
});

describe("014 student model records migration", () => {
  function writeRows(records, extra = {}) {
    fs.writeFileSync(
      process.env.ECD_DB_FILE,
      JSON.stringify({ items: [{ id: "i1" }], studentModelRecords: records, ...extra })
    );
    forgetDbCache();
  }

  const nested = record("smr1");

  it("dry-run reports the rows and leaves the file and the store untouched", async () => {
    writeRows([nested]);
    const result = await migrateFileStudentModelRecords({ dryRun: true });
    expect(result.changed).toEqual(["smr1"]);
    expect(result.summary).toMatch(/Would copy 1 studentModelRecords/);
    expect(readFile().studentModelRecords).toHaveLength(1);
    expect(await exportAllStudentModelRecords()).toEqual([]);
  });

  it("copies, verifies canonical form including empty objects, then removes the key", async () => {
    writeRows([nested]);
    const result = await migrateFileStudentModelRecords({ dryRun: false });
    expect(result.changed).toEqual(["smr1"]);
    const onDisk = readFile();
    expect(onDisk.studentModelRecords).toBeUndefined();
    expect(onDisk.items).toEqual([{ id: "i1" }]);
    const stored = (await exportAllStudentModelRecords()).find((row) => row.id === "smr1");
    expect(documentsMatch(nested, stored)).toBe(true);
    expect(stored.smvPosteriors.smv1.distribution).toEqual({});
    expect(stored.provenance.notes).toEqual({});
    expect(
      fs.existsSync(path.join(process.env.ECD_BACKUP_DIR, "db.json.pre-student-model-mongo"))
    ).toBe(true);
  });

  it("does not strip the file when verification fails", async () => {
    writeRows([nested]);
    const stripped = structuredClone(nested);
    delete stripped.smvPosteriors.smv1.distribution;
    delete stripped.provenance.notes;
    await expect(
      migrateFileStudentModelRecords({
        dryRun: false,
        loadStored: async () => [stripped],
      })
    ).rejects.toThrow(/do not match/);
    expect(readFile().studentModelRecords).toHaveLength(1);
    expect(readFile().studentModelRecords[0].smvPosteriors.smv1.distribution).toEqual({});
    expect(readFile().studentModelRecords[0].provenance.notes).toEqual({});
    expect(readFile().items).toEqual([{ id: "i1" }]);
  });

  it("leaves the JSON harness file alone", async () => {
    writeRows([nested]);
    const result = await migrateFileStudentModelRecords({
      dryRun: false,
      backend: "json",
    });
    expect(result.summary).toMatch(/JSON harness/);
    expect(readFile().studentModelRecords).toHaveLength(1);
    expect(await exportAllStudentModelRecords()).toEqual([]);
  });

  it("re-run leaves the store in place when the file no longer has the key", async () => {
    writeRows([nested]);
    await migrateFileStudentModelRecords({ dryRun: false });
    const again = await migrateFileStudentModelRecords({ dryRun: false });
    expect(again.changed).toEqual([]);
    expect(again.summary).toMatch(/Nothing to copy/);
    expect((await exportAllStudentModelRecords()).map((row) => row.id)).toEqual(["smr1"]);
    expect(readFile().studentModelRecords).toBeUndefined();
  });

  it("refuses a row with no id and does not change the file", async () => {
    writeRows([{ ...nested, id: "" }]);
    await expect(migrateFileStudentModelRecords({ dryRun: false })).rejects.toThrow(/no id/);
    expect(readFile().studentModelRecords).toHaveLength(1);
    expect(await exportAllStudentModelRecords()).toEqual([]);
  });
});

describe("saveDB omits studentModelRecords in external mode", () => {
  it("keeps other keys and drops the collection from the file", async () => {
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
        sessions: [],
        studentModelRecords: [],
      })
    );
    forgetDbCache();
    const { loadDB } = await import("../../../src/utils/db-server.js");
    const db = loadDB();
    db.items[0].status = "reviewed";
    db.studentModelRecords = [record("smr-omit")];
    await saveDB(db);

    const onDisk = readFile();
    expect(onDisk.studentModelRecords).toBeUndefined();
    expect(onDisk.items[0].status).toBe("reviewed");
    expect(JSON.stringify(onDisk)).not.toMatch(/smr-omit/);
  });
});

describe("backup includes student model records", () => {
  it("packs external records into the encrypted archive", async () => {
    process.env.ECD_BACKUP_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(process.env.ECD_DB_FILE, JSON.stringify({ items: [{ id: "i1" }] }));
    forgetDbCache();
    await upsertStudentModelRecords([record("smr-bak")]);
    const result = await runFullBackup({ listCollection: async () => [] });
    expect(result.ok).toBe(true);
    const key = Buffer.from(process.env.ECD_BACKUP_ENCRYPTION_KEY, "hex");
    const compressed = decryptBackupBlob(fs.readFileSync(result.path), key);
    const payload = JSON.parse(zlib.gunzipSync(compressed).toString("utf8"));
    const rows = JSON.parse(
      Buffer.from(payload.files["mongo/studentModelRecords.json"], "base64").toString("utf8")
    );
    expect(rows.map((row) => row.id)).toEqual(["smr-bak"]);
    expect(rows[0].provenance.notes).toEqual({});
    const ecd = JSON.parse(Buffer.from(payload.files["ecd/db.json"], "base64").toString("utf8"));
    expect(ecd.studentModelRecords).toBeUndefined();
  });
});
