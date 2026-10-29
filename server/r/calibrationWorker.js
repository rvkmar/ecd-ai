// server/r/calibrationWorker.js
// Node-side queue runner. Jobs live in calibrationJobs. The JSON harness
// still uses loadDB/saveDB. memory and mongo claim with a compare-and-swap
// on status=queued and write later status as a single-document update, so
// a second worker or a requeue cannot double-claim and a full db.json
// rewrite is not required for each status change.

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
import { runWithAudit } from "../utils/auditContext.js";
import { calibrationJobsUseExternalStore } from "../calibrationJobs/calibrationJobBackend.js";
import {
  claimQueuedCalibrationJob,
  finishRunningCalibrationJob,
  queryCalibrationJobs,
} from "../calibrationJobs/calibrationJobRepository.js";

function nowIso() {
  return new Date().toISOString();
}

function byQueueOrder(a, b) {
  const av = a?.createdAt || a?.requestedAt || "";
  const bv = b?.createdAt || b?.requestedAt || "";
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
}

async function jobsForMetrics(db) {
  if (!calibrationJobsUseExternalStore()) return db?.calibrationJobs || [];
  return queryCalibrationJobs(db, {}, { unscoped: true });
}

export async function getCalibrationQueueMetrics(db = loadDB()) {
  return computeQueueMetrics(await jobsForMetrics(db));
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

function restartFailure(job, db) {
  const finishedAt = nowIso();
  const error = {
    message:
      "Node process restarted while this job was running. The job was marked failed so it cannot stay running forever.",
    rClass: "RestartRecovery",
    stderr: "",
  };
  const draft = {
    ...job,
    status: "failed",
    finishedAt,
    updatedAt: finishedAt,
    error,
  };
  const life = validateCalibrationJobLifecycle(draft, db);
  if (life.length) {
    error.message = `${error.message} Lifecycle: ${life.join(" ")}`;
  }
  return { finishedAt, error };
}

function recoverRunningJobsJson() {
  const db = loadDB();
  db.calibrationJobs = db.calibrationJobs || [];
  let changed = false;
  for (const job of db.calibrationJobs) {
    if (job.status !== "running") continue;
    if (!canTransitionCalibrationJob(job.status, "failed")) continue;
    const { finishedAt, error } = restartFailure(job, db);
    job.status = "failed";
    job.finishedAt = finishedAt;
    job.updatedAt = finishedAt;
    job.error = error;
    changed = true;
  }
  if (changed) saveDB(db);
  return db.calibrationJobs.filter((j) => j.error?.rClass === "RestartRecovery");
}

async function recoverRunningJobsExternal() {
  const db = loadDB();
  const running = await queryCalibrationJobs(db, { status: "running" }, { unscoped: true });
  const recovered = [];
  for (const job of running) {
    if (!canTransitionCalibrationJob(job.status, "failed")) continue;
    const { finishedAt, error } = restartFailure(job, db);
    const updated = await finishRunningCalibrationJob(db, job.id, {
      status: "failed",
      finishedAt,
      updatedAt: finishedAt,
      error,
    });
    if (updated) recovered.push(updated);
  }
  return recovered;
}

export function recoverRunningJobs() {
  if (calibrationJobsUseExternalStore()) return recoverRunningJobsExternal();
  return recoverRunningJobsJson();
}

function outcomePatch(result, finishedAt) {
  const patch = { finishedAt, updatedAt: finishedAt };
  if (!result.ok || result.error) {
    patch.status = "failed";
    patch.error = result.error || {
      message: result.text || `R returned HTTP ${result.status}`,
      rClass: "HttpError",
      stderr: result.text || "",
    };
    return patch;
  }

  const body = result.json;
  const responseErrors = validateCalibrationResponse(body);
  if (responseErrors.length > 0) {
    patch.status = "failed";
    patch.error = {
      message: `R response failed the ADR 0002 contract: ${responseErrors.join("; ")}`,
      rClass: "ContractError",
      stderr: result.text || "",
    };
    patch.response = body;
    return patch;
  }

  if (body.converged === false) {
    patch.status = "not-converged";
    patch.response = body;
    patch.error = body.error || {
      message: "R reported converged: false.",
      rClass: "NotConverged",
      stderr: "",
    };
    if (!patch.error.message) {
      patch.error = { ...patch.error, message: "R reported converged: false." };
    }
    return patch;
  }

  patch.response = body;
  patch.error = null;
  patch.status = "succeeded";
  return patch;
}

export async function processJobById(
  jobId,
  { client = { postCalibration }, timeoutMs, killer } = {}
) {
  const db = loadDB();
  const startedAt = nowIso();
  const claim = await claimQueuedCalibrationJob(db, jobId, {
    startedAt,
    finishedAt: null,
    updatedAt: startedAt,
    error: null,
  });
  if (claim.missing) return { ok: false, error: "Calibration job not found." };
  if (!claim.claimed) {
    return { ok: false, error: `Job is '${claim.job?.status}', not queued.` };
  }
  if (!calibrationJobsUseExternalStore()) saveDB(db);

  const job = claim.job;
  const resolvedTimeoutMs = jobTimeoutMsForKind(job.kind, timeoutMs);
  // D103: restore the enqueue request id so R client headers + logs join.
  const result = await runWithAudit(
    {
      requestId: job.requestId || undefined,
      actor: job.requestedBy
        ? { userId: String(job.requestedBy), role: null }
        : null,
    },
    async () =>
      job.kind === ATTRIBUTE_PROFILE_SUMMARY_KIND
        ? withWallClockTimeout(
            () => runAttributeProfileSummaryJob(job.request),
            resolvedTimeoutMs
          )
        : client.postCalibration(job.kind, job.request, {
            timeoutMs: resolvedTimeoutMs,
            killer,
          })
  );

  const after = calibrationJobsUseExternalStore() ? db : loadDB();
  const patch = outcomePatch(result, nowIso());
  const updated = await finishRunningCalibrationJob(after, jobId, patch);
  if (!updated) return { ok: false, error: "Calibration job disappeared while running." };
  if (!calibrationJobsUseExternalStore()) saveDB(after);
  return { ok: patch.status === "succeeded", job: updated };
}

export async function processQueuedJobs(options = {}) {
  if (dispatcherActive) {
    maybeEmitQueueDepthAlarm(await getCalibrationQueueMetrics());
    return [];
  }
  dispatcherActive = true;
  const processed = [];
  const skipped = new Set();
  try {
    const max = Number.isFinite(options.maxConcurrent)
      ? Math.max(1, Math.floor(options.maxConcurrent))
      : maxConcurrentJobs();

    while (true) {
      const db = loadDB();
      const jobs = await jobsForMetrics(db);
      const metrics = computeQueueMetrics(jobs);
      maybeEmitQueueDepthAlarm(metrics);
      if (metrics.running >= max) break;

      const slots = max - metrics.running;
      const batch = jobs
        .filter((j) => j.status === "queued" && !skipped.has(j.id))
        .sort(byQueueOrder)
        .slice(0, slots);
      if (batch.length === 0) break;

      const runOne = (job) => processJobById(job.id, options);
      const results =
        batch.length === 1 ? [await runOne(batch[0])] : await Promise.all(batch.map(runOne));
      for (let i = 0; i < results.length; i += 1) {
        if (!results[i].job && String(results[i].error || "").includes("not queued")) {
          skipped.add(batch[i].id);
        }
      }
      processed.push(...results);
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
