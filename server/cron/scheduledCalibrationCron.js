// server/cron/scheduledCalibrationCron.js
//
// D80: periodic tick that calls runScheduledCalibrationEnqueue.
// Enqueues only — never ingests. Opt-in via SCHEDULED_CALIBRATION_ENABLED=1.

import cron from "node-cron";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { kickQueue } from "../r/calibrationWorker.js";
import { runScheduledCalibrationEnqueue } from "../r/scheduledCalibrationEnqueue.js";

/**
 * @param {{ schedule?: string, run?: Function }} [options]
 */
export default function startScheduledCalibrationCron(options = {}) {
  const schedule =
    options.schedule || process.env.SCHEDULED_CALIBRATION_CRON || "15 3 * * *";
  const run = options.run || runScheduledTick;

  if (!cron.validate(schedule)) {
    console.error(
      `[scheduledCalibrationCron] invalid schedule '${schedule}'; cron not started`
    );
    return null;
  }

  return cron.schedule(
    schedule,
    () => {
      try {
        run();
      } catch (err) {
        console.error("[scheduledCalibrationCron] error:", err);
      }
    },
    { timezone: "UTC" }
  );
}

function runScheduledTick() {
  const db = loadDB();
  const beforeActive = snapshotActiveParameterSetIds(db);
  const result = runScheduledCalibrationEnqueue(db);
  const afterActive = snapshotActiveParameterSetIds(db);

  if (JSON.stringify(beforeActive) !== JSON.stringify(afterActive)) {
    // Defence in depth: this module must never mutate active sets. If it
    // ever does, fail loud rather than silently scoring a live cohort
    // against swapped parameters.
    throw new Error(
      "scheduledCalibrationCron mutated activeParameterSetId — enqueue-only invariant broken"
    );
  }

  if (result.enqueued.length > 0 || result.errors.length > 0) {
    saveDB(db);
  }

  if (result.enqueued.length > 0) {
    console.log(
      `[scheduledCalibrationCron] enqueued ${result.enqueued.length} job(s): ${result.enqueued
        .map((e) => e.jobId)
        .join(", ")}`
    );
    kickQueue();
  }
  if (result.skipped.length > 0) {
    console.log(
      `[scheduledCalibrationCron] skipped ${result.skipped.length}: ${result.skipped
        .map((s) => s.reason)
        .join("; ")}`
    );
  }
  if (result.errors.length > 0) {
    console.error(
      `[scheduledCalibrationCron] ${result.errors.length} error(s):`,
      result.errors.map((e) => e.error)
    );
  }

  return result;
}

function snapshotActiveParameterSetIds(db) {
  const out = {};
  for (const em of db?.evidenceModels || []) {
    for (const sm of em.statisticalModels || []) {
      out[`${em.id}/${sm.id}`] = sm.activeParameterSetId ?? null;
    }
  }
  return out;
}
