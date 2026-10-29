import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import zlib from "zlib";
import { forgetDbCache, saveDB } from "../../../src/utils/db-server.js";
import { migrateFileCalibrationData } from "../../migrations/migrations/013-calibration-data-to-mongo.js";
import { documentsMatch } from "../../calibrationData/documentCanonical.js";
import {
  CALIBRATION_JOB_INDEX_FIELDS,
} from "../calibrationJobBackend.js";
import { ANALYSIS_ARTEFACT_INDEX_FIELDS } from "../../analysisArtefacts/analysisArtefactBackend.js";
import {
  claimQueuedCalibrationJob,
  exportAllCalibrationJobs,
  finishRunningCalibrationJob,
  getCalibrationJobById,
  insertCalibrationJob,
  queryCalibrationJobs,
  resetCalibrationJobStoreForTests,
  saveCalibrationJob,
} from "../calibrationJobRepository.js";
import {
  exportAllAnalysisArtefacts,
  getAnalysisArtefactById,
  persistAnalysisArtefact,
  placeAnalysisArtefact,
  queryAnalysisArtefacts,
  resetAnalysisArtefactStoreForTests,
} from "../../analysisArtefacts/analysisArtefactRepository.js";
import { resetAuditStoreForTests } from "../../auditLog/auditRepository.js";
import { processJobById } from "../../r/calibrationWorker.js";
import { runFullBackup } from "../../backup/runFullBackup.js";
import { decryptBackupBlob } from "../../backup/cryptoArchive.js";

function readFile() {
  return JSON.parse(fs.readFileSync(process.env.ECD_DB_FILE, "utf8"));
}

function job(id, extra = {}) {
  return {
    id,
    kind: "irt-parameters",
    status: "queued",
    evidenceModelId: "em1",
    statisticalModelId: "sm1",
    createdAt: "2026-10-29T00:00:00.000Z",
    requestedAt: "2026-10-29T00:00:00.000Z",
    response: null,
    error: null,
    ...extra,
  };
}

function artefact(id, extra = {}) {
  return {
    id,
    jobId: "job1",
    kind: "dif-analysis",
    scope: { evidenceModelId: "em1", districtId: "d1" },
    payload: { parameters: { a: 1 }, notes: {} },
    ...extra,
  };
}

let tmp;
let prevJobs;
let prevArtefacts;
let prevAudit;
let prevFile;
let prevBackup;
let prevKey;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-cal-"));
  prevJobs = process.env.CALIBRATION_JOBS_BACKEND;
  prevArtefacts = process.env.ANALYSIS_ARTEFACTS_BACKEND;
  prevAudit = process.env.AUDITLOG_BACKEND;
  prevFile = process.env.ECD_DB_FILE;
  prevBackup = process.env.ECD_BACKUP_DIR;
  prevKey = process.env.ECD_BACKUP_ENCRYPTION_KEY;
  process.env.CALIBRATION_JOBS_BACKEND = "memory";
  process.env.ANALYSIS_ARTEFACTS_BACKEND = "memory";
  process.env.AUDITLOG_BACKEND = "memory";
  process.env.ECD_DB_FILE = path.join(tmp, "db.json");
  process.env.ECD_BACKUP_DIR = path.join(tmp, "backups");
  delete process.env.ECD_BACKUP_ENCRYPTION_KEY;
  resetCalibrationJobStoreForTests();
  resetAnalysisArtefactStoreForTests();
  resetAuditStoreForTests();
  forgetDbCache();
});

afterEach(() => {
  resetCalibrationJobStoreForTests();
  resetAnalysisArtefactStoreForTests();
  resetAuditStoreForTests();
  forgetDbCache();
  if (prevJobs === undefined) delete process.env.CALIBRATION_JOBS_BACKEND;
  else process.env.CALIBRATION_JOBS_BACKEND = prevJobs;
  if (prevArtefacts === undefined) delete process.env.ANALYSIS_ARTEFACTS_BACKEND;
  else process.env.ANALYSIS_ARTEFACTS_BACKEND = prevArtefacts;
  if (prevAudit === undefined) delete process.env.AUDITLOG_BACKEND;
  else process.env.AUDITLOG_BACKEND = prevAudit;
  if (prevFile === undefined) delete process.env.ECD_DB_FILE;
  else process.env.ECD_DB_FILE = prevFile;
  if (prevBackup === undefined) delete process.env.ECD_BACKUP_DIR;
  else process.env.ECD_BACKUP_DIR = prevBackup;
  if (prevKey === undefined) delete process.env.ECD_BACKUP_ENCRYPTION_KEY;
  else process.env.ECD_BACKUP_ENCRYPTION_KEY = prevKey;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("calibration repository memory", () => {
  it("inserts, filters, and documents the indexes used by list and claim", async () => {
    const db = { calibrationJobs: [], analysisArtefacts: [] };
    await insertCalibrationJob(db, job("job1", { kind: "ctt-statistics", status: "succeeded" }));
    await insertCalibrationJob(
      db,
      job("job2", { evidenceModelId: "em2", createdAt: "2026-10-29T01:00:00.000Z" })
    );
    placeAnalysisArtefact(db, artefact("art1"));
    await persistAnalysisArtefact(db, artefact("art1"));
    placeAnalysisArtefact(db, artefact("art2", { jobId: "job2", kind: "equating", scope: { evidenceModelId: "em2" } }));
    await persistAnalysisArtefact(
      db,
      artefact("art2", { jobId: "job2", kind: "equating", scope: { evidenceModelId: "em2" } })
    );

    const byStatus = await queryCalibrationJobs(db, { status: "queued" });
    expect(byStatus.map((row) => row.id)).toEqual(["job2"]);
    const byKind = await queryCalibrationJobs(db, { kind: "ctt-statistics" });
    expect(byKind.map((row) => row.id)).toEqual(["job1"]);
    const byEm = await queryCalibrationJobs(db, { evidenceModelId: "em2" });
    expect(byEm.map((row) => row.id)).toEqual(["job2"]);

    const byJob = await queryAnalysisArtefacts(db, { jobId: "job1" });
    expect(byJob.map((row) => row.id)).toEqual(["art1"]);
    const byArtefactKind = await queryAnalysisArtefacts(db, { kind: "equating" });
    expect(byArtefactKind.map((row) => row.id)).toEqual(["art2"]);
    const byScope = await queryAnalysisArtefacts(db, { evidenceModelId: "em1" });
    expect(byScope.map((row) => row.id)).toEqual(["art1"]);
    expect((await getAnalysisArtefactById(db, "art1")).payload.notes).toEqual({});

    const jobFields = CALIBRATION_JOB_INDEX_FIELDS.map((spec) => spec[0]);
    expect(jobFields).toContain("id");
    expect(jobFields).toContainEqual(["status", "createdAt"]);
    expect(jobFields).toContain("evidenceModelId");
    expect(jobFields).toContain("kind");
    const artefactFields = ANALYSIS_ARTEFACT_INDEX_FIELDS.map((spec) => spec[0]);
    expect(artefactFields).toContain("jobId");
    expect(artefactFields).toContain("scope.evidenceModelId");
    expect(artefactFields).toContainEqual(["scope.evidenceModelId", "kind"]);
  });

  it("claims a queued job once, refuses a second claim, and does not finish a requeued job", async () => {
    const db = {};
    await insertCalibrationJob(db, job("j1"));
    await insertCalibrationJob(db, job("j2", { createdAt: "2026-10-29T02:00:00.000Z" }));
    const fields = { startedAt: "t", finishedAt: null, updatedAt: "t", error: null };

    const [first, second] = await Promise.all([
      claimQueuedCalibrationJob(db, "j1", fields),
      claimQueuedCalibrationJob(db, "j1", fields),
    ]);
    expect([first, second].filter((row) => row.claimed)).toHaveLength(1);
    const loser = [first, second].find((row) => !row.claimed);
    expect(loser.job.status).toBe("running");

    const other = await claimQueuedCalibrationJob(db, "j2", fields);
    expect(other.claimed).toBe(true);

    const running = await getCalibrationJobById(db, "j1");
    await saveCalibrationJob(db, { ...running, status: "queued", startedAt: null, error: null });
    const again = await claimQueuedCalibrationJob(db, "j1", fields);
    expect(again.claimed).toBe(true);
    await saveCalibrationJob(db, { ...again.job, status: "queued", startedAt: null });
    const finished = await finishRunningCalibrationJob(db, "j1", {
      status: "succeeded",
      response: { converged: true },
    });
    expect(finished).toBeNull();
    expect((await getCalibrationJobById(db, "j1")).status).toBe("queued");
    expect((await getCalibrationJobById(db, "j1")).response).toBeNull();
  });

  it("a second worker processJobById cannot run the same queued job", async () => {
    fs.writeFileSync(process.env.ECD_DB_FILE, JSON.stringify({ items: [] }));
    forgetDbCache();
    const db = {};
    await insertCalibrationJob(
      db,
      job("j1", {
        request: { contractVersion: "1.0", jobId: "j1" },
        requestedBy: "admin1",
      })
    );
    let calls = 0;
    const client = {
      postCalibration: async () => {
        calls += 1;
        return {
          ok: true,
          status: 200,
          text: "",
          json: {
            contractVersion: "1.0",
            jobId: "j1",
            converged: true,
            packageVersion: "mirt 1.41",
            sampleSize: 2,
            calibratedAt: "2026-10-29T03:00:00.000Z",
            parameters: { item_a: { a: 1, b: 0 } },
          },
        };
      },
    };
    const [a, b] = await Promise.all([
      processJobById("j1", { client }),
      processJobById("j1", { client }),
    ]);
    expect(calls).toBe(1);
    expect([a, b].filter((row) => row.ok)).toHaveLength(1);
    expect((await getCalibrationJobById(db, "j1")).status).toBe("succeeded");
    expect((await getCalibrationJobById(db, "j1")).response.packageVersion).toBe("mirt 1.41");
  });
});

describe("013 calibration data migration", () => {
  function writeRows(jobs, artefacts, extra = {}) {
    fs.writeFileSync(
      process.env.ECD_DB_FILE,
      JSON.stringify({ items: [{ id: "i1" }], calibrationJobs: jobs, analysisArtefacts: artefacts, ...extra })
    );
    forgetDbCache();
  }

  const nestedJob = job("job1", {
    status: "succeeded",
    response: { converged: true, diagnostics: {}, packageVersion: "mirt 1.41" },
  });
  const nestedArtefact = artefact("art1");

  it("dry-run reports both collections and leaves the file untouched", async () => {
    writeRows([nestedJob], [nestedArtefact]);
    const result = await migrateFileCalibrationData({ dryRun: true });
    expect(result.changed.calibrationJobs).toEqual(["job1"]);
    expect(result.changed.analysisArtefacts).toEqual(["art1"]);
    expect(result.summary).toMatch(/Would copy 1 calibrationJobs and 1 analysisArtefacts/);
    expect(readFile().calibrationJobs).toHaveLength(1);
    expect(readFile().analysisArtefacts).toHaveLength(1);
    expect(await exportAllCalibrationJobs()).toEqual([]);
    expect(await exportAllAnalysisArtefacts()).toEqual([]);
  });

  it("copies, verifies canonical form, then removes both keys", async () => {
    writeRows([nestedJob], [nestedArtefact]);
    const result = await migrateFileCalibrationData({ dryRun: false });
    expect(result.changed.calibrationJobs).toEqual(["job1"]);
    expect(result.changed.analysisArtefacts).toEqual(["art1"]);
    const onDisk = readFile();
    expect(onDisk.calibrationJobs).toBeUndefined();
    expect(onDisk.analysisArtefacts).toBeUndefined();
    expect(onDisk.items).toEqual([{ id: "i1" }]);
    const storedJob = (await exportAllCalibrationJobs()).find((row) => row.id === "job1");
    const storedArtefact = (await exportAllAnalysisArtefacts()).find((row) => row.id === "art1");
    expect(documentsMatch(nestedJob, storedJob)).toBe(true);
    expect(documentsMatch(nestedArtefact, storedArtefact)).toBe(true);
    expect(storedJob.response.diagnostics).toEqual({});
    expect(storedArtefact.payload.notes).toEqual({});
    expect(
      fs.existsSync(path.join(process.env.ECD_BACKUP_DIR, "db.json.pre-calibration-mongo"))
    ).toBe(true);
  });

  it("does not strip the file when verification fails", async () => {
    writeRows([nestedJob], [nestedArtefact]);
    await expect(
      migrateFileCalibrationData({
        dryRun: false,
        loadJobs: async () => [
          {
            ...nestedJob,
            response: { converged: true, packageVersion: "mirt 1.41" },
          },
        ],
        loadArtefacts: async () => [nestedArtefact],
      })
    ).rejects.toThrow(/do not match/);
    expect(readFile().calibrationJobs).toHaveLength(1);
    expect(readFile().calibrationJobs[0].response.diagnostics).toEqual({});
    expect(readFile().analysisArtefacts).toHaveLength(1);
    expect(readFile().items).toEqual([{ id: "i1" }]);
  });

  it("leaves the JSON harness file alone", async () => {
    writeRows([nestedJob], [nestedArtefact]);
    const result = await migrateFileCalibrationData({
      dryRun: false,
      jobsBackend: "json",
      artefactsBackend: "json",
    });
    expect(result.summary).toMatch(/JSON harness/);
    expect(readFile().calibrationJobs).toHaveLength(1);
    expect(readFile().analysisArtefacts).toHaveLength(1);
  });

  it("re-run leaves the store in place when the file has neither key", async () => {
    writeRows([nestedJob], [nestedArtefact]);
    await migrateFileCalibrationData({ dryRun: false });
    const again = await migrateFileCalibrationData({ dryRun: false });
    expect(again.changed.calibrationJobs).toEqual([]);
    expect(again.summary).toMatch(/Nothing to copy/);
    expect((await exportAllCalibrationJobs()).map((row) => row.id)).toEqual(["job1"]);
    expect((await exportAllAnalysisArtefacts()).map((row) => row.id)).toEqual(["art1"]);
  });
});

describe("saveDB omits calibrationJobs and analysisArtefacts in external mode", () => {
  it("keeps other keys and drops both collections from the file", async () => {
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
        calibrationJobs: [],
        analysisArtefacts: [],
      })
    );
    forgetDbCache();
    const { loadDB } = await import("../../../src/utils/db-server.js");
    const db = loadDB();
    db.items[0].status = "reviewed";
    db.calibrationJobs = [job("job-omit", { response: { blob: "x".repeat(20) } })];
    db.analysisArtefacts = [artefact("art-omit", { payload: { blob: "y".repeat(20) } })];
    await saveDB(db);

    const onDisk = readFile();
    expect(onDisk.calibrationJobs).toBeUndefined();
    expect(onDisk.analysisArtefacts).toBeUndefined();
    expect(onDisk.items[0].status).toBe("reviewed");
    expect(JSON.stringify(onDisk)).not.toMatch(/job-omit/);
    expect(JSON.stringify(onDisk)).not.toMatch(/art-omit/);
  });
});

describe("backup includes calibration collections", () => {
  it("packs external jobs and artefacts into the encrypted archive", async () => {
    process.env.ECD_BACKUP_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(
      process.env.ECD_DB_FILE,
      JSON.stringify({ items: [{ id: "i1" }] })
    );
    forgetDbCache();
    const db = {};
    await insertCalibrationJob(db, job("job-bak", { response: { diagnostics: {} } }));
    placeAnalysisArtefact(db, artefact("art-bak"));
    await persistAnalysisArtefact(db, artefact("art-bak"));
    const result = await runFullBackup({ listCollection: async () => [] });
    expect(result.ok).toBe(true);
    const key = Buffer.from(process.env.ECD_BACKUP_ENCRYPTION_KEY, "hex");
    const compressed = decryptBackupBlob(fs.readFileSync(result.path), key);
    const payload = JSON.parse(zlib.gunzipSync(compressed).toString("utf8"));
    const jobs = JSON.parse(
      Buffer.from(payload.files["mongo/calibrationJobs.json"], "base64").toString("utf8")
    );
    const artefacts = JSON.parse(
      Buffer.from(payload.files["mongo/analysisArtefacts.json"], "base64").toString("utf8")
    );
    expect(jobs.map((row) => row.id)).toEqual(["job-bak"]);
    expect(jobs[0].response.diagnostics).toEqual({});
    expect(artefacts.map((row) => row.id)).toEqual(["art-bak"]);
    const ecd = JSON.parse(Buffer.from(payload.files["ecd/db.json"], "base64").toString("utf8"));
    expect(ecd.calibrationJobs).toBeUndefined();
    expect(ecd.analysisArtefacts).toBeUndefined();
  });
});
