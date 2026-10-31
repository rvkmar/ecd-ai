// TU10 / T19. Shared task time-limit and attempt-cap rules.
//
// The effective time limit is deliveryAdministration.taskTimeLimits[taskId]
// when that key is a positive number. Those seconds already include the
// student accommodation factor (TU7 applyAccommodationTiming). This module
// does not scale them again. A missing key uses
// taskStructure.timingConstraint.timeLimitSeconds. Absent, zero, or any
// non-positive value means no task limit, which is today's behaviour.
//
// maxAttempts is taskStructure.resourceConstraints.maxAttempts. Only an
// integer of at least 1 is a cap. Anything else is unlimited.

export const TASK_TIMEOUT_POLICY = "record-current-work";

function nonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function taskModelAttemptCap(taskModel) {
  const value = taskModel?.taskStructure?.resourceConstraints?.maxAttempts;
  return Number.isInteger(value) && value >= 1 ? value : null;
}

/**
 * Positive limit for one task, or null when the task is untimed.
 * source "taskTimeLimits" is the accommodated stamp. source
 * "timingConstraint" is the raw task model value.
 */
export function effectiveTaskTimeLimit(session, taskId, taskModel) {
  const stamped = session?.deliveryAdministration?.taskTimeLimits;
  if (
    stamped &&
    typeof stamped === "object" &&
    !Array.isArray(stamped) &&
    Object.prototype.hasOwnProperty.call(stamped, taskId)
  ) {
    const seconds = stamped[taskId];
    if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
      return {
        seconds,
        limitMs: Math.round(seconds * 1000),
        source: "taskTimeLimits",
      };
    }
  }
  const raw = taskModel?.taskStructure?.timingConstraint?.timeLimitSeconds;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  return {
    seconds: raw,
    limitMs: Math.round(raw * 1000),
    source: "timingConstraint",
  };
}

export function storedTaskTimeMs(session, taskId) {
  let max = 0;
  let found = false;
  for (const row of session?.responses || []) {
    if (!row || row.taskId !== taskId) continue;
    const time = nonNegative(row.timeOnItemMs);
    if (time == null) continue;
    found = true;
    if (time > max) max = time;
  }
  return found ? max : 0;
}

/**
 * Time already stored on the response, unless the open visit started
 * before that answer. That visit's own elapsed time is the stored time,
 * so adding both would count it twice while the player still holds the
 * old present clock.
 */
export function storedMsForOpenVisit(session, taskId, openPresentedAt) {
  const stored = storedTaskTimeMs(session, taskId);
  if (!stored || typeof openPresentedAt !== "string" || openPresentedAt === "") return stored;
  const opened = Date.parse(openPresentedAt);
  let answeredAt = NaN;
  for (const row of session?.responses || []) {
    if (!row || row.taskId !== taskId || typeof row.timestamp !== "string") continue;
    const parsed = Date.parse(row.timestamp);
    if (!Number.isNaN(parsed)) answeredAt = parsed;
  }
  if (Number.isNaN(opened) || Number.isNaN(answeredAt)) return stored;
  if (opened + 50 < answeredAt) return 0;
  return stored;
}

export function taskLimitElapsedMs({ accruedMs = 0, openElapsedMs = null, storedMs = 0 } = {}) {
  const accrued = nonNegative(accruedMs) ?? 0;
  const open = nonNegative(openElapsedMs) ?? 0;
  const stored = nonNegative(storedMs) ?? 0;
  return Math.round(stored + accrued + open);
}

export function taskRemainingMs({
  limitMs,
  openPresentedAt,
  accruedMs = 0,
  storedMs = 0,
  now = Date.now(),
} = {}) {
  if (typeof limitMs !== "number" || !Number.isFinite(limitMs) || limitMs <= 0) return null;
  if (typeof openPresentedAt !== "string" || openPresentedAt === "") return null;
  const start = Date.parse(openPresentedAt);
  if (Number.isNaN(start)) return null;
  const open = Math.max(0, now - start);
  const elapsed = taskLimitElapsedMs({ accruedMs, openElapsedMs: open, storedMs });
  return Math.max(0, Math.round(limitMs - elapsed));
}

export function attemptsUsedForTask(session, taskId) {
  const row = (session?.responses || []).find((entry) => entry && entry.taskId === taskId);
  if (!row) return 0;
  return Number.isInteger(row.attempt) && row.attempt >= 1 ? row.attempt : 1;
}

/**
 * Whether the student can still change this task's answer.
 * A timed-out row is closed. A task cap that is not used up stays open,
 * including when delivery review is off. The delivery attempt cap still
 * closes it. With no task cap, only an explicit review allowance opens
 * another try. Otherwise a recorded answer stays locked.
 */
export function taskRevisionOpen(session, taskId, taskModel) {
  const used = attemptsUsedForTask(session, taskId);
  if (used === 0) return true;
  const timedOut = (session?.responses || []).some(
    (row) => row && row.taskId === taskId && row.timedOut === true
  );
  if (timedOut) return false;
  const taskCap = taskModelAttemptCap(taskModel);
  const admin = session?.deliveryAdministration;
  const deliveryCap =
    admin && Number.isInteger(admin.attempts) && admin.attempts >= 1 ? admin.attempts : null;
  const reviewIsSet = admin && typeof admin.reviewAllowed === "boolean";
  if (taskCap != null && used >= taskCap) return false;
  if (deliveryCap != null && used >= deliveryCap) return false;
  if (taskCap != null && used < taskCap) return true;
  if (reviewIsSet && admin.reviewAllowed === false) return false;
  if (deliveryCap != null && reviewIsSet && admin.reviewAllowed === true && used < deliveryCap) {
    return true;
  }
  return false;
}
