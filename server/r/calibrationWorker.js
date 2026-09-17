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
import { jobTimeoutMsForKind } from "./jobTimeouts.js";
import {
  computeQueueMetrics,
  maxConcurrentJobs,
  maybeEmitQueueDepthAlarm,
} from "./calibrationQueueLimits.js";
import {
  ATTRIBUTE_PROFILE_SUMMARY_KIND,
  runAttributeProfileSummaryJob,
} from "../delivery/attributeProfileCohortSummary.js";

function nowIso() {
  return new Date().toISOString();
}

function findJob(db, id) {
  return (db.calibrationJobs || []).find((j) => j.id === id);
}

export function getCalibrationQueueMetrics(db = loadDB()) {
  return computeQueueMetrics(db.calibrationJobs || []);
}

/** Single dispatcher — concurrent kickQueue must not double-dispatch. */
let dispatcherActive = false;

/** Wall-clock wrap for Node-only jobs (no R process to kill). */
function withWallClockTimeout(work, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({
        ok: false,
        status: 0,
        json: null,
        text: "",
        error: {
          message: `Job timed out after ${timeoutMs}ms (Node-only; no R process to kill)`,
          rClass: "Timeout",
          stderr: "",
          rKilled: false,
          killMethod: "n/a",
        },
      });
    }, timeoutMs);
    Promise.resolve()
      .then(work)
      .then((result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          ok: false,
          status: 0,
          json: null,
          text: "",
          error: {
            message: err?.message || "Job failed",
            rClass: err?.name || "Error",
            stderr: err?.stack || "",
          },
        });
      });
  });
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

export async function processJobById(
  jobId,
  { client = { postCalibration }, timeoutMs, killer } = {}
) {
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

  const resolvedTimeoutMs = jobTimeoutMsForKind(job.kind, timeoutMs);
  const result =
    job.kind === ATTRIBUTE_PROFILE_SUMMARY_KIND
      ? await withWallClockTimeout(
          () => runAttributeProfileSummaryJob(job.request),
          resolvedTimeoutMs
        )
      : await client.postCalibration(job.kind, job.request, {
          timeoutMs: resolvedTimeoutMs,
          killer,
        });

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
  if (dispatcherActive) {
    maybeEmitQueueDepthAlarm(getCalibrationQueueMetrics());
    return [];
  }
  dispatcherActive = true;
  const processed = [];
  try {
    const max = Number.isFinite(options.maxConcurrent)
      ? Math.max(1, Math.floor(options.maxConcurrent))
      : maxConcurrentJobs();

    while (true) {
      const db = loadDB();
      const metrics = computeQueueMetrics(db.calibrationJobs || []);
      maybeEmitQueueDepthAlarm(metrics);
      if (metrics.running >= max) break;

      const slots = max - metrics.running;
      const batch = (db.calibrationJobs || [])
        .filter((j) => j.status === "queued")
        .slice(0, slots);
      if (batch.length === 0) break;

      if (batch.length === 1) {
        processed.push(await processJobById(batch[0].id, options));
      } else {
        const results = await Promise.all(
          batch.map((job) => processJobById(job.id, options))
        );
        processed.push(...results);
      }
    }

    return processed;
  } finally {
    dispatcherActive = false;
  }
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

export const __testing__ = {
  resetDispatcher() {
    dispatcherActive = false;
  },
};
