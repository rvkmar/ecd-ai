// Calibration job data access.
//
// JSON harness: the calibrationJobs array on the ECD db object. saveDB
// writes it, and the saveDB diff records create / transition / ingest.
// memory and mongo: one document per job. Claim is a compare-and-swap on
// status=queued. Later worker writes patch that one document and only
// while it is still running.
//
// Production uses mongo. Vitest and `npm run dev` stay on json so existing
// tests keep passing. Unit tests for this seam set CALIBRATION_JOBS_BACKEND=memory.

import { getTenancyContext } from "../utils/tenancyContext.js";
import { filterRows, rowVisible } from "../utils/tenancyScope.js";
import { auditsForCalibrationJobChange } from "../utils/auditLog.js";
import { appendAuditEntries, auditLogUseExternalStore } from "../auditLog/auditRepository.js";
import {
  resolveCalibrationJobsBackend,
  calibrationJobsUseExternalStore,
} from "./calibrationJobBackend.js";
import {
  mongoJobFind,
  mongoJobFindOne,
  mongoJobReplace,
  mongoJobDelete,
  mongoClaimQueuedJob,
  mongoPatchJobIfStatus,
  calibrationJobToPlain,
} from "./mongoCalibrationJobStore.js";

const memoryDocs = new Map();

function clone(value) {
  if (value == null) return value;
  return structuredClone(value);
}

export function resetCalibrationJobStoreForTests() {
  memoryDocs.clear();
}

export { calibrationJobsUseExternalStore, resolveCalibrationJobsBackend };

function jobMatchesFilter(row, filter = {}) {
  if (!row) return false;
  if (filter.id != null && row.id !== filter.id) return false;
  if (filter.status != null && row.status !== filter.status) return false;
  if (filter.kind != null && row.kind !== filter.kind) return false;
  if (filter.evidenceModelId != null && row.evidenceModelId !== filter.evidenceModelId) {
    return false;
  }
  return true;
}

function mongoFilterFrom(filter = {}) {
  const query = {};
  if (filter.id != null) query.id = filter.id;
  if (filter.status != null) query.status = filter.status;
  if (filter.kind != null) query.kind = filter.kind;
  if (filter.evidenceModelId != null) query.evidenceModelId = filter.evidenceModelId;
  return query;
}

function applyTenancy(rows, db, filter) {
  if (filter?.unscoped) return rows;
  return filterRows(
    "calibrationJobs",
    rows,
    getTenancyContext(),
    db || { calibrationJobs: rows }
  );
}

function bindJob(db, job) {
  if (!db || !job) return job;
  db.calibrationJobs = db.calibrationJobs || [];
  const idx = db.calibrationJobs.findIndex((row) => row && row.id === job.id);
  if (idx < 0) db.calibrationJobs.push(job);
  else if (db.calibrationJobs[idx] !== job) db.calibrationJobs[idx] = job;
  return job;
}

async function readStoredJob(id) {
  if (resolveCalibrationJobsBackend() === "mongo") return mongoJobFindOne(id);
  return memoryDocs.has(id) ? clone(memoryDocs.get(id)) : null;
}

async function writeStoredJob(job) {
  const clean = calibrationJobToPlain(clone(job)) || clone(job);
  if (!clean?.id) throw new Error("Calibration job store refused a document with no id.");
  if (resolveCalibrationJobsBackend() === "mongo") {
    await mongoJobReplace(clean);
  }
  memoryDocs.set(clean.id, clone(clean));
  return clone(clean);
}

async function emitJobAudits(before, after) {
  if (!calibrationJobsUseExternalStore()) return;
  const entries = auditsForCalibrationJobChange(before, after);
  if (!entries.length) return;
  if (auditLogUseExternalStore()) {
    await appendAuditEntries(entries);
    return;
  }
  const { recordAuditEvent } = await import("../../src/utils/db-server.js");
  for (const entry of entries) {
    await recordAuditEvent(entry);
  }
}

export async function queryCalibrationJobs(db, filter = {}, options = {}) {
  if (!calibrationJobsUseExternalStore()) {
    const rows = (db?.calibrationJobs || []).filter((row) => jobMatchesFilter(row, filter));
    return rows;
  }
  let rows;
  if (resolveCalibrationJobsBackend() === "mongo") {
    rows = await mongoJobFind(mongoFilterFrom(filter), options);
    rows = rows.filter((row) => jobMatchesFilter(row, filter));
  } else {
    rows = [...memoryDocs.values()]
      .filter((row) => jobMatchesFilter(row, filter))
      .map(clone);
  }
  return applyTenancy(rows, db, filter);
}

export async function getCalibrationJobById(db, id) {
  if (id == null) return null;
  if (!calibrationJobsUseExternalStore()) {
    return (db?.calibrationJobs || []).find((row) => row && row.id === id) || null;
  }
  const row = await readStoredJob(id);
  if (!row) return null;
  const ctx = getTenancyContext();
  const peer = db || { calibrationJobs: [row] };
  if (!rowVisible("calibrationJobs", row, ctx, peer)) return null;
  return row;
}

export async function insertCalibrationJob(db, job) {
  if (!job?.id) throw new Error("Calibration job store refused a document with no id.");
  bindJob(db, job);
  if (!calibrationJobsUseExternalStore()) return job;
  const before = await readStoredJob(job.id);
  const stored = await writeStoredJob(job);
  await emitJobAudits(before, stored);
  return stored;
}

export async function saveCalibrationJob(db, job) {
  if (!job?.id) throw new Error("Calibration job store refused a document with no id.");
  bindJob(db, job);
  if (!calibrationJobsUseExternalStore()) return job;
  const before = await readStoredJob(job.id);
  const stored = await writeStoredJob(job);
  await emitJobAudits(before, stored);
  return stored;
}

export async function deleteCalibrationJob(db, id) {
  if (!id) return null;
  if (!calibrationJobsUseExternalStore()) {
    if (!db) return null;
    const idx = (db.calibrationJobs || []).findIndex((row) => row && row.id === id);
    if (idx < 0) return null;
    return db.calibrationJobs.splice(idx, 1)[0];
  }
  const before = await readStoredJob(id);
  if (!before) return null;
  if (resolveCalibrationJobsBackend() === "mongo") await mongoJobDelete(id);
  memoryDocs.delete(id);
  if (db && Array.isArray(db.calibrationJobs)) {
    const idx = db.calibrationJobs.findIndex((row) => row && row.id === id);
    if (idx >= 0) db.calibrationJobs.splice(idx, 1);
  }
  return before;
}

// Synchronous compare-and-swap. No await before the status flip, so two
// memory claims started together cannot both observe queued.
function claimMemory(id, fields) {
  const current = memoryDocs.get(id);
  if (!current) return { missing: true, claimed: false, job: null, before: null };
  if (current.status !== "queued") {
    return { missing: false, claimed: false, job: clone(current), before: null };
  }
  const before = clone(current);
  const next = { ...before, ...fields, status: "running" };
  memoryDocs.set(id, next);
  return { missing: false, claimed: true, job: clone(next), before };
}

function patchMemory(id, expectedStatus, patch) {
  const current = memoryDocs.get(id);
  if (!current || current.status !== expectedStatus) return null;
  const before = clone(current);
  const next = { ...before, ...patch };
  memoryDocs.set(id, next);
  return { before, job: clone(next) };
}

export async function claimQueuedCalibrationJob(db, id, fields = {}) {
  if (!calibrationJobsUseExternalStore()) {
    const job = (db?.calibrationJobs || []).find((row) => row && row.id === id);
    if (!job) return { missing: true, claimed: false, job: null };
    if (job.status !== "queued") return { missing: false, claimed: false, job };
    Object.assign(job, fields, { status: "running" });
    return { missing: false, claimed: true, job };
  }
  if (resolveCalibrationJobsBackend() === "memory") {
    const result = claimMemory(id, fields);
    if (result.claimed) await emitJobAudits(result.before, result.job);
    return result;
  }
  const before = await mongoJobFindOne(id);
  const next = await mongoClaimQueuedJob(id, fields);
  if (!next) {
    const current = await mongoJobFindOne(id);
    return { missing: !current, claimed: false, job: current };
  }
  memoryDocs.set(next.id, clone(next));
  await emitJobAudits(before, next);
  return { missing: false, claimed: true, job: next };
}

export async function finishRunningCalibrationJob(db, id, patch) {
  if (!calibrationJobsUseExternalStore()) {
    const job = (db?.calibrationJobs || []).find((row) => row && row.id === id);
    if (!job || job.status !== "running") return null;
    Object.assign(job, patch);
    return job;
  }
  if (resolveCalibrationJobsBackend() === "memory") {
    const result = patchMemory(id, "running", patch);
    if (!result) return null;
    await emitJobAudits(result.before, result.job);
    return result.job;
  }
  const before = await mongoJobFindOne(id);
  const next = await mongoPatchJobIfStatus(id, "running", patch);
  if (!next) return null;
  memoryDocs.set(next.id, clone(next));
  await emitJobAudits(before && before.status === "running" ? before : null, next);
  return next;
}

export function appendQueuedCalibrationJob(db, job) {
  if (!db) return job;
  db.calibrationJobs = db.calibrationJobs || [];
  db.calibrationJobs.push(job);
  return job;
}

export async function persistAppendedCalibrationJobs(db) {
  if (!calibrationJobsUseExternalStore()) return [];
  const saved = [];
  for (const job of db?.calibrationJobs || []) {
    if (!job?.id) continue;
    saved.push(await insertCalibrationJob(db, job));
  }
  return saved;
}

export async function exportAllCalibrationJobs() {
  if (!calibrationJobsUseExternalStore()) return null;
  if (resolveCalibrationJobsBackend() === "mongo") return mongoJobFind({});
  return [...memoryDocs.values()].map(clone);
}

export async function upsertCalibrationJobs(docs) {
  const ids = [];
  for (const doc of docs || []) {
    if (!doc?.id) throw new Error("Calibration job migration refused a document with no id.");
    ids.push(doc.id);
    if (resolveCalibrationJobsBackend() === "mongo") await mongoJobReplace(doc);
    if (resolveCalibrationJobsBackend() !== "json") {
      const clean = calibrationJobToPlain(clone(doc)) || clone(doc);
      memoryDocs.set(clean.id, clean);
    }
  }
  return ids;
}

export async function loadStoredCalibrationJobs(ids) {
  const want = new Set(ids || []);
  if (resolveCalibrationJobsBackend() === "mongo") {
    const rows = await mongoJobFind({ id: { $in: [...want] } });
    return rows.filter((row) => want.has(row.id));
  }
  const out = [];
  for (const id of want) {
    if (memoryDocs.has(id)) out.push(clone(memoryDocs.get(id)));
  }
  return out;
}
