// server/r/calibrationQueueLimits.js
// D87: concurrency bound + queue-depth metric/alarm.
// R is sequential (workers=1). Node must not dispatch more jobs than
// CALIBRATION_MAX_CONCURRENT (default 1) or concurrent kickQueue calls
// will thrash a single Plumber process.

const DEFAULT_MAX_CONCURRENT = 1;
const DEFAULT_QUEUE_DEPTH_ALARM = 20;

export function maxConcurrentJobs() {
  const n = Number(process.env.CALIBRATION_MAX_CONCURRENT);
  if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  return DEFAULT_MAX_CONCURRENT;
}

function queueDepthAlarmThreshold() {
  const n = Number(process.env.CALIBRATION_QUEUE_DEPTH_ALARM);
  if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  return DEFAULT_QUEUE_DEPTH_ALARM;
}

function expectedRWorkers() {
  const n = Number(process.env.R_WORKERS);
  if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  return 1;
}

/**
 * Snapshot of queue pressure. Pure over the jobs array (or loadDB).
 * @param {{ status?: string }[]} jobs
 */
export function computeQueueMetrics(jobs = []) {
  const list = Array.isArray(jobs) ? jobs : [];
  let queued = 0;
  let running = 0;
  for (const job of list) {
    if (job?.status === "queued") queued += 1;
    else if (job?.status === "running") running += 1;
  }
  const maxConcurrent = maxConcurrentJobs();
  const depthAlarmThreshold = queueDepthAlarmThreshold();
  return {
    queued,
    running,
    maxConcurrent,
    depthAlarmThreshold,
    depthAlarm: queued >= depthAlarmThreshold,
    rWorkersExpected: expectedRWorkers(),
  };
}

let lastDepthAlarmAt = null;

/** Emit at most one warn per crossing (re-arms when depth drops below). */
export function maybeEmitQueueDepthAlarm(metrics, { warn = console.warn } = {}) {
  if (!metrics?.depthAlarm) {
    lastDepthAlarmAt = null;
    return null;
  }
  if (lastDepthAlarmAt) return lastDepthAlarmAt;
  lastDepthAlarmAt = new Date().toISOString();
  warn(
    `[calibrationQueue] depth alarm: queued=${metrics.queued} ` +
      `threshold=${metrics.depthAlarmThreshold} running=${metrics.running} ` +
      `maxConcurrent=${metrics.maxConcurrent} at ${lastDepthAlarmAt}`
  );
  return lastDepthAlarmAt;
}

export const __testing__ = {
  DEFAULT_MAX_CONCURRENT,
  DEFAULT_QUEUE_DEPTH_ALARM,
  queueDepthAlarmThreshold,
  expectedRWorkers,
  resetQueueDepthAlarm() {
    lastDepthAlarmAt = null;
  },
};
