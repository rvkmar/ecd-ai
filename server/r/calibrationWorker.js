// server/r/calibrationWorker.js
// Node-side queue runner. Jobs live in calibrationJobs via loadDB/saveDB
// so they survive a process restart. A job left `running` at boot is
// marked failed with an inspectable reason -- it must not stay running
// forever.

import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { canTransitionCalibrationJob } from "../utils/lifecycleMatrix.js";
import { validateCalibrationJobLifecycle } from "../utils/lifecycleValidation.js";
import { validateCalibrationResponse } from "./calibrationContract.js";
import { postCalibration } from "./rClient.js";

function nowIso() {
  return new Date().toISOString();
}

function findJob(db, id) {
  return (db.calibrationJobs || []).find((j) => j.id === id);
}

export function recoverRunningJobs() {
  const db = loadDB();
  db.calibrationJobs = db.calibrationJobs || [];
  let changed = false;
  for (const job of db.calibrationJobs) {
    if (job.status !== "running") continue;
    if (!canTransitionCalibrationJob(job.status, "failed")) continue;
    job.status = "failed";
    job.finishedAt = nowIso();
    job.updatedAt = job.finishedAt;
    job.error = {
      message:
        "Node process restarted while this job was running. The job was marked failed so it cannot stay running forever.",
      rClass: "RestartRecovery",
      stderr: "",
    };
    const life = validateCalibrationJobLifecycle(job, db);
    if (life.length) {
      job.error.message = `${job.error.message} Lifecycle: ${life.join(" ")}`;
    }
    changed = true;
  }
  if (changed) saveDB(db);
  return db.calibrationJobs.filter((j) => j.error?.rClass === "RestartRecovery");
}

export async function processJobById(jobId, { client = { postCalibration } } = {}) {
  const db = loadDB();
  const job = findJob(db, jobId);
  if (!job) return { ok: false, error: "Calibration job not found." };
  if (job.status !== "queued") {
    return { ok: false, error: `Job is '${job.status}', not queued.` };
  }

  job.status = "running";
  job.startedAt = nowIso();
  job.finishedAt = null;
  job.updatedAt = job.startedAt;
  job.error = null;
  saveDB(db);

  const result = await client.postCalibration(job.kind, job.request);

  const after = loadDB();
  const live = findJob(after, jobId);
  if (!live) return { ok: false, error: "Calibration job disappeared while running." };

  live.finishedAt = nowIso();
  live.updatedAt = live.finishedAt;

  if (!result.ok || result.error) {
    live.status = "failed";
    live.error = result.error || {
      message: result.text || `R returned HTTP ${result.status}`,
      rClass: "HttpError",
      stderr: result.text || "",
    };
    saveDB(after);
    return { ok: false, job: live };
  }

  const body = result.json;
  const responseErrors = validateCalibrationResponse(body);
  if (responseErrors.length > 0) {
    live.status = "failed";
    live.error = {
      message: `R response failed the ADR 0002 contract: ${responseErrors.join("; ")}`,
      rClass: "ContractError",
      stderr: result.text || "",
    };
    live.response = body;
    saveDB(after);
    return { ok: false, job: live };
  }

  live.response = body;
  live.error = body.converged === false ? body.error || null : null;
  live.status = "succeeded";
  saveDB(after);
  return { ok: true, job: live };
}

export async function processQueuedJobs(options = {}) {
  const db = loadDB();
  const queued = (db.calibrationJobs || []).filter((j) => j.status === "queued");
  const processed = [];
  for (const job of queued) {
    processed.push(await processJobById(job.id, options));
  }
  return processed;
}

// Auto-run is opt-in. Tests leave it off and call processJobById (or
// POST /:id/process) so a setImmediate fetch to a missing R service
// cannot race the assertion. Compose sets CALIBRATION_QUEUE_AUTORUN=1.
export function kickQueue(options = {}) {
  if (process.env.CALIBRATION_PROCESS_SYNC === "1") {
    return processQueuedJobs(options);
  }
  if (process.env.CALIBRATION_QUEUE_AUTORUN !== "1") return undefined;
  setImmediate(() => {
    processQueuedJobs(options).catch((err) => {
      console.error("calibration queue kick failed:", err);
    });
  });
  return undefined;
}
