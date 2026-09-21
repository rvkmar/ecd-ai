/**
 * D108 — timed restore rehearsal against a D107 encrypted archive.
 *
 * An untested backup is a hypothesis. This module builds a small but
 * provenance-complete fixture, backs it up, restores into a clean tree,
 * times the restore, and verifies the four calendar checks.
 */
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { accumulateEvidence, applyPosteriorsToSession } from "../delivery/evidenceAccumulation.js";
import { runFullBackup } from "./runFullBackup.js";
import { parseBackupEncryptionKey } from "./cryptoArchive.js";
import { runRestore } from "./runRestore.js";

/** Daily backup → lose at most one day of writes. */
const STATED_RPO_MS = 24 * 60 * 60 * 1000;

/** App-level restore of ECD JSON + mongo exports + materials into a clean tree. */
const STATED_RTO_MS = 60 * 60 * 1000;

function continuousSmv() {
  return {
    id: "smv-theta",
    label: "Numerical Reasoning Ability",
    type: "continuous",
    scale: { min: -4, max: 4 },
    priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } },
  };
}

/**
 * Minimal ECD store that exercises all four restore verification points.
 */
function buildRehearsalFixture() {
  const jobId = "job-rehearsal-1";
  const parameterSetId = "ps-rehearsal-1";
  const materialText = "Restore-rehearsal passage: the incline is frictionless.";
  const db = {
    competencyModels: [
      {
        id: "cm1",
        versionNumber: 1,
        smVariables: [continuousSmv()],
      },
    ],
    competencies: [{ id: "c1", modelId: "cm1" }],
    evidenceModels: [
      {
        id: "em1",
        competencyId: "c1",
        versionNumber: 1,
        observables: [
          { id: "o1", evidenceRule: { direction: "supports", strengthLevel: 4 } },
        ],
        statisticalModels: [
          {
            id: "sm1",
            type: "irt",
            active: true,
            structureConfig: {},
            parameterSets: [
              {
                parameterSetId,
                calibrationJobId: jobId,
                parameters: { o1: { a: 1.2, b: -0.3 } },
                packageVersion: "mirt 1.44",
                converged: true,
                sampleSize: 500,
                calibratedAt: "2026-09-19T12:00:00.000Z",
              },
            ],
            activeParameterSetId: parameterSetId,
          },
        ],
      },
    ],
    items: [
      {
        id: "item1",
        observationId: "o1",
        stimulus: {
          layout: "single",
          blocks: [{ type: "text", content: materialText }],
        },
        interaction: { type: "mcq", options: [{ id: "opt_a", content: "A" }] },
      },
    ],
    calibrationJobs: [
      {
        id: jobId,
        kind: "irt-parameters",
        status: "succeeded",
        evidenceModelId: "em1",
        ingestedParameterSetId: parameterSetId,
      },
    ],
    analysisArtefacts: [],
    sessions: [
      {
        id: "s-rehearsal",
        status: "in_progress",
        responses: [
          {
            taskId: "t1",
            itemId: "item1",
            evidenceModelId: "em1",
            parameterSetId,
            parameterSource: "calibrated",
            observationId: "o1",
            observableId: "o1",
            activated: true,
            direction: "supports",
            strength: 4,
          },
        ],
      },
    ],
    auditLog: [
      {
        id: "audit-rehearsal-1",
        at: "2026-09-19T12:05:00.000Z",
        action: "lifecycle.transition",
        entity: { collection: "taskModels", id: "tm1", version: 1 },
        detail: { toStatus: "operational" },
        actor: { username: "admin1", role: "admin" },
      },
    ],
    students: [],
    tasks: [],
    announcements: [],
    policies: [],
    curricularPolicies: [],
    assemblyModels: [],
    qMatrixModels: [],
    presentationModels: [],
    compositeLibrary: [],
    questions: [],
  };

  const accumulation = accumulateEvidence(db.sessions[0], db);
  applyPosteriorsToSession(db.sessions[0], accumulation);

  return {
    db,
    jobId,
    parameterSetId,
    materialText,
    expectedPosterior: accumulation.posteriors[0],
    users: [{ username: "admin1", role: "admin", passwordHash: "$2b$10$rehearsal" }],
    questions: [{ id: "q-legacy", stem: "unused" }],
  };
}

/**
 * Four calendar verification points on a restored tree.
 * @param {{
 *   ecdFile: string,
 *   mongoDir: string,
 *   materialsDir: string,
 *   materialText: string,
 *   jobId: string,
 *   parameterSetId: string,
 *   expectedEstimate: number,
 * }} args
 */
function verifyRestoreFourPoints(args) {
  const ecd = JSON.parse(fs.readFileSync(args.ecdFile, "utf8"));
  const checks = {
    posteriorRecomputes: { ok: false, detail: null },
    parameterSetResolvesToJob: { ok: false, detail: null },
    materialsRender: { ok: false, detail: null },
    auditLogIntact: { ok: false, detail: null },
  };

  const session = (ecd.sessions || []).find((s) => s.id === "s-rehearsal");
  if (!session) {
    checks.posteriorRecomputes.detail = "session s-rehearsal missing";
  } else {
    const { posteriors } = accumulateEvidence(session, ecd);
    const p = posteriors[0];
    const match =
      p?.supported === true &&
      Number.isFinite(p.estimate) &&
      Math.abs(p.estimate - args.expectedEstimate) < 1e-12;
    checks.posteriorRecomputes.ok = match;
    checks.posteriorRecomputes.detail = {
      restoredEstimate: p?.estimate,
      expectedEstimate: args.expectedEstimate,
      supported: p?.supported,
    };
  }

  const em = (ecd.evidenceModels || []).find((e) => e.id === "em1");
  const sm = em?.statisticalModels?.[0];
  const ps = (sm?.parameterSets || []).find(
    (s) => s.parameterSetId === args.parameterSetId
  );
  const job = (ecd.calibrationJobs || []).find((j) => j.id === args.jobId);
  checks.parameterSetResolvesToJob.ok =
    !!ps &&
    ps.calibrationJobId === args.jobId &&
    !!job &&
    job.ingestedParameterSetId === args.parameterSetId;
  checks.parameterSetResolvesToJob.detail = {
    parameterSetCalibrationJobId: ps?.calibrationJobId ?? null,
    jobIngestedParameterSetId: job?.ingestedParameterSetId ?? null,
  };

  const item = (ecd.items || []).find((i) => i.id === "item1");
  const stimulusText = item?.stimulus?.blocks?.[0]?.content;
  const materialFile = path.join(args.materialsDir, "passage.txt");
  const fileText = fs.existsSync(materialFile)
    ? fs.readFileSync(materialFile, "utf8")
    : null;
  checks.materialsRender.ok =
    stimulusText === args.materialText && fileText === args.materialText;
  checks.materialsRender.detail = {
    stimulusText,
    materialFileText: fileText,
  };

  const audit = ecd.auditLog || [];
  checks.auditLogIntact.ok = audit.some(
    (a) => a.id === "audit-rehearsal-1" && a.action === "lifecycle.transition"
  );
  checks.auditLogIntact.detail = { auditCount: audit.length };

  const allOk = Object.values(checks).every((c) => c.ok);
  return { ok: allOk, checks };
}

/**
 * @param {object} [options]
 */
export async function performRestoreRehearsal(options = {}) {
  const work =
    options.tmpRoot ||
    fs.mkdtempSync(path.join(os.tmpdir(), "ecd-d108-"));
  const ownTmp = !options.tmpRoot;

  const sourceDir = path.join(work, "source");
  const backupDir = path.join(work, "backups");
  const restoreRoot = path.join(work, "clean-restore");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });

  const ecdFile = path.join(sourceDir, "db.json");
  const materialsDir = path.join(sourceDir, "materials");
  fs.mkdirSync(materialsDir, { recursive: true });

  const fixture = buildRehearsalFixture();
  fs.writeFileSync(ecdFile, JSON.stringify(fixture.db, null, 2));
  fs.writeFileSync(
    path.join(materialsDir, "passage.txt"),
    fixture.materialText,
    "utf8"
  );

  const key =
    options.key ||
    parseBackupEncryptionKey(options.env || process.env) ||
    crypto.randomBytes(32);

  const backupCreatedAt =
    options.backupCreatedAt ||
    new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(); // "yesterday-ish" within RPO

  const backup = await runFullBackup({
    env: { ECD_BACKUP_RETENTION_DAYS: "14" },
    key,
    backupDir,
    ecdFile,
    materialsDir,
    now: new Date(backupCreatedAt),
    listCollection: async (name) =>
      name === "users"
        ? fixture.users
        : name === "questions"
          ? fixture.questions
          : [],
  });

  if (!backup.ok) {
    if (ownTmp) fs.rmSync(work, { recursive: true, force: true });
    return {
      ok: false,
      error: backup.error || "backup failed",
      statedRpoMs: STATED_RPO_MS,
      statedRtoMs: STATED_RTO_MS,
    };
  }

  const restore = await runRestore({
    key,
    archivePath: backup.path,
    targetRoot: restoreRoot,
  });

  if (!restore.ok) {
    if (ownTmp) fs.rmSync(work, { recursive: true, force: true });
    return {
      ok: false,
      error: restore.error || "restore failed",
      restoreElapsedMs: restore.elapsedMs,
      statedRpoMs: STATED_RPO_MS,
      statedRtoMs: STATED_RTO_MS,
    };
  }

  const restoreNow = options.restoreAtMs || Date.now();
  const backupAgeMs = restoreNow - Date.parse(backupCreatedAt);
  const verification = verifyRestoreFourPoints({
    ecdFile: restore.targets.ecdFile,
    mongoDir: restore.targets.mongoDir,
    materialsDir: restore.targets.materialsDir,
    materialText: fixture.materialText,
    jobId: fixture.jobId,
    parameterSetId: fixture.parameterSetId,
    expectedEstimate: fixture.expectedPosterior.estimate,
  });

  const usersPath = path.join(restore.targets.mongoDir, "users.json");
  const usersRestored = JSON.parse(fs.readFileSync(usersPath, "utf8"));
  const mongoOk = usersRestored?.[0]?.username === "admin1";

  const rpoMet = backupAgeMs <= STATED_RPO_MS;
  const rtoMet = restore.elapsedMs <= STATED_RTO_MS;

  const record = {
    ok: verification.ok && mongoOk && rpoMet && rtoMet,
    unit: "D108",
    performedAt: new Date(restoreNow).toISOString(),
    backupPath: backup.path,
    backupCreatedAt,
    backupAgeMs,
    restoreElapsedMs: restore.elapsedMs,
    statedRpoMs: STATED_RPO_MS,
    statedRtoMs: STATED_RTO_MS,
    rpoMet,
    rtoMet,
    rpoNote:
      "RPO 24h — daily encrypted full backup (ECD_BACKUP_CRON default 20 2 * * * UTC). Rehearsal backup age must be ≤ 24h.",
    rtoNote:
      "RTO 60m — decrypt + write ECD JSON, mongo exports, and materials into a clean tree. Live Mongo import is a follow-on ops step using mongo/users.json.",
    verification,
    mongoUsersRestored: mongoOk,
    filesRestored: restore.filesRestored,
  };

  if (options.recordPath) {
    ensureParentDir(options.recordPath);
    fs.writeFileSync(options.recordPath, JSON.stringify(record, null, 2));
  }

  if (ownTmp && !options.keepWorkDir) {
    fs.rmSync(work, { recursive: true, force: true });
  } else {
    record.workDir = work;
  }

  return record;
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}
