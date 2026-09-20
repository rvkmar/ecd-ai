/**
 * D105 — the four alerts (not everything).
 *
 * 1. authentication failure rate above baseline
 * 2. sustained calibration queue depth
 * 3. session submit error rate
 * 4. backup age exceeding policy
 */
import { getSubmitStats } from "./submitStats.js";

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Auth failures in the last hour that trip the alert. */
function authFailureThreshold() {
  return envInt("ALERT_AUTH_FAILURES_PER_HOUR", 20);
}

/** Submit error rate (0–1) that trips the alert when sample size is enough. */
function submitErrorRateThreshold() {
  const n = Number(process.env.ALERT_SUBMIT_ERROR_RATE);
  if (Number.isFinite(n) && n > 0 && n <= 1) return n;
  return 0.15;
}

function submitErrorMinSample() {
  return envInt("ALERT_SUBMIT_MIN_SAMPLE", 10);
}

/** Backup older than this many ms trips the alert (default 36h). */
function backupMaxAgeMs() {
  return envInt("ALERT_BACKUP_MAX_AGE_MS", 36 * 60 * 60 * 1000);
}

/**
 * @param {{
 *   queue?: { depthAlarm?: boolean, queued?: number, depthAlarmThreshold?: number },
 *   backup?: { ageMs?: number | null, fileCount?: number },
 * }} status
 * @param {object[]} auditLog
 */
export function evaluateOpsAlerts(status, auditLog = []) {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const authFailures = (auditLog || []).filter(
    (e) =>
      e?.action === "auth.failure" &&
      e?.at &&
      Date.parse(e.at) >= hourAgo
  ).length;
  const authThreshold = authFailureThreshold();
  const authAlert = {
    id: "auth.failure_rate",
    label: "Authentication failure rate above baseline",
    firing: authFailures >= authThreshold,
    value: authFailures,
    threshold: authThreshold,
    unit: "failures/hour",
  };

  const queue = status?.queue || {};
  const queueAlert = {
    id: "calibration.queue_depth",
    label: "Sustained calibration queue depth",
    firing: !!queue.depthAlarm,
    value: queue.queued ?? 0,
    threshold: queue.depthAlarmThreshold ?? null,
    unit: "queued",
  };

  const submit = getSubmitStats();
  const submitThreshold = submitErrorRateThreshold();
  const minSample = submitErrorMinSample();
  const submitFiring =
    submit.total >= minSample && submit.errorRate >= submitThreshold;
  const submitAlert = {
    id: "session.submit_error_rate",
    label: "Session submit error rate",
    firing: submitFiring,
    value: Number(submit.errorRate.toFixed(4)),
    threshold: submitThreshold,
    sample: submit.total,
    minSample,
    unit: "error_rate",
  };

  const ageMs = status?.backup?.ageMs;
  const maxAge = backupMaxAgeMs();
  const backupFiring =
    typeof ageMs === "number" ? ageMs > maxAge : (status?.backup?.fileCount ?? 0) === 0;
  const backupAlert = {
    id: "backup.age",
    label: "Backup age exceeding policy",
    firing: backupFiring,
    value: ageMs,
    threshold: maxAge,
    unit: "age_ms",
    detail:
      typeof ageMs === "number"
        ? null
        : "No backup files found — treat as overdue until a backup exists.",
  };

  const alerts = [authAlert, queueAlert, submitAlert, backupAlert];
  return {
    at: new Date(now).toISOString(),
    firingCount: alerts.filter((a) => a.firing).length,
    alerts,
  };
}
