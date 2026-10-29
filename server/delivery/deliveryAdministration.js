// Delivery administration, stamped onto a session at create.
//
// The delivery model stores timeLimitMinutes, attempts, allowedReview, and
// feedbackMode. Those fields are copied here so a later edit of the model
// does not change an open session. Sessions with no stamp keep the previous
// behaviour: no delivery deadline, the historical attempt rule, review not
// gated, and full payloads for every role.
//
// The effective deadline is one formula. R3 passes extra minutes through
// extraTimeMinutes (default 0). This module also multiplies the saved limit
// by the presentation timeMultiplier stamped at create.

import { PRESENTATION_FEEDBACK_TIMING_VALUES } from "../../src/utils/ecdVocabulary.js";

const MINUTE_MS = 60 * 1000;

const FEEDBACK_MODES = PRESENTATION_FEEDBACK_TIMING_VALUES;

const RESPONSE_FEEDBACK_KEYS = [
  "activated",
  "direction",
  "strength",
  "rationale",
  "scoredValue",
  "provisionalActivated",
  "provisionalStrength",
  "automatedPhaseResult",
  "warning",
  "accumulationNote",
  "exposureNote",
];

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Presentation multipliers outside [1, 3] are ignored. 1 is the same
 * fallback presentationChrome uses when the overlay omits the field.
 */
function clampTimeMultiplier(value) {
  if (!finiteNumber(value) || value < 1 || value > 3) return 1;
  return value;
}

function extraMinutes(value) {
  if (!finiteNumber(value) || value <= 0) return 0;
  return value;
}

function pausedMilliseconds(value) {
  if (!finiteNumber(value) || value <= 0) return 0;
  return value;
}

/**
 * Effective deadline for a delivery time limit.
 *
 * durationMs = timeLimitMinutes * timeMultiplier * 60000
 *   + extraTimeMinutes * 60000
 * effectiveDeadline = clockStartedAt + durationMs + pausedMs
 *
 * extraTimeMinutes defaults to 0 so a later accommodation can add minutes
 * without a second formula. timeMultiplier defaults to 1.
 *
 * The presentation factor is timeMultiplier, not extra time. Passing
 * presentationTimeMultiplier(overlay) here applies it once. Passing
 * factor - 1 as extraTimeMinutes as well would count that factor twice.
 * The stored session.endTime is this deadline. The player reads endTime
 * and does not multiply again.
 *
 * durationMs is null when timeLimitMinutes is missing or not positive.
 * effectiveDeadline is null until clockStartedAt is an ISO time.
 */
export function computeEffectiveDeadline({
  clockStartedAt = null,
  timeLimitMinutes = null,
  timeMultiplier = 1,
  extraTimeMinutes = 0,
  pausedMs = 0,
} = {}) {
  if (!finiteNumber(timeLimitMinutes) || timeLimitMinutes <= 0) {
    return { durationMs: null, effectiveDeadline: null };
  }
  const durationMs = Math.round(
    timeLimitMinutes * clampTimeMultiplier(timeMultiplier) * MINUTE_MS +
      extraMinutes(extraTimeMinutes) * MINUTE_MS
  );
  if (typeof clockStartedAt !== "string" || clockStartedAt === "") {
    return { durationMs, effectiveDeadline: null };
  }
  const start = Date.parse(clockStartedAt);
  if (Number.isNaN(start)) return { durationMs, effectiveDeadline: null };
  const deadline = new Date(start + durationMs + pausedMilliseconds(pausedMs));
  return { durationMs, effectiveDeadline: deadline.toISOString() };
}

function refreshEffectiveDeadline(admin) {
  if (!admin || typeof admin !== "object") return null;
  const computed = computeEffectiveDeadline(admin);
  admin.effectiveDeadline = computed.effectiveDeadline;
  return computed;
}

/**
 * Build the object stored on session.deliveryAdministration.
 * Returns null when the delivery model saved nothing this module enforces
 * and no presentation model tightens review.
 *
 * presentations: { source: "override"|"task", id, timeMultiplier, allowReview }[]
 * An override, when present, is the only presentation input. Otherwise the
 * largest timeMultiplier wins, and allowReview false on any task model wins.
 */
export function stampDeliveryAdministration({
  administration = null,
  presentations = [],
  extraTimeMinutes = 0,
} = {}) {
  const admin = administration && typeof administration === "object" && !Array.isArray(administration)
    ? administration
    : null;
  const overlays = Array.isArray(presentations) ? presentations.filter(Boolean) : [];
  const override = overlays.find((row) => row.source === "override");
  const considered = override ? [override] : overlays.filter((row) => row.source === "task");

  let timeMultiplier = 1;
  let presentationAllowReview = null;
  if (considered.length) {
    timeMultiplier = Math.max(...considered.map((row) => clampTimeMultiplier(row.timeMultiplier)));
    const reviews = considered
      .map((row) => row.allowReview)
      .filter((value) => typeof value === "boolean");
    if (reviews.includes(false)) presentationAllowReview = false;
    else if (reviews.includes(true)) presentationAllowReview = true;
  }

  const deliveryReview = admin && typeof admin.allowedReview === "boolean" ? admin.allowedReview : null;
  const feedbackMode = admin && FEEDBACK_MODES.includes(admin.feedbackMode) ? admin.feedbackMode : null;
  const attempts = admin && Number.isInteger(admin.attempts) && admin.attempts >= 1 ? admin.attempts : null;
  const timeLimitMinutes = admin && finiteNumber(admin.timeLimitMinutes) && admin.timeLimitMinutes > 0
    ? admin.timeLimitMinutes
    : null;

  const reviewConstrained = deliveryReview !== null || presentationAllowReview === false;
  if (!timeLimitMinutes && !attempts && !feedbackMode && !reviewConstrained) return null;

  const stamp = {
    extraTimeMinutes: extraMinutes(extraTimeMinutes),
    pausedMs: 0,
    timeMultiplier,
    presentationModelId: override?.id || null,
    presentationAllowReview,
    clockStartedAt: null,
    pauseStartedAt: null,
    effectiveDeadline: null,
  };
  if (timeLimitMinutes) stamp.timeLimitMinutes = timeLimitMinutes;
  if (attempts) stamp.attempts = attempts;
  if (deliveryReview !== null) stamp.allowedReview = deliveryReview;
  if (feedbackMode) stamp.feedbackMode = feedbackMode;
  if (reviewConstrained) {
    // Stricter flag wins. A missing delivery flag does not loosen a
    // presentation model that set allowReview to false.
    stamp.reviewAllowed = deliveryReview !== false && presentationAllowReview !== false;
  }
  return stamp;
}

export function deliveryClockStarted(session) {
  const admin = session?.deliveryAdministration;
  return Boolean(
    admin &&
      finiteNumber(admin.timeLimitMinutes) &&
      admin.timeLimitMinutes > 0 &&
      typeof admin.clockStartedAt === "string" &&
      admin.clockStartedAt
  );
}

export function ensureClockStarted(session, now = new Date()) {
  const admin = session?.deliveryAdministration;
  if (!admin || !finiteNumber(admin.timeLimitMinutes) || admin.timeLimitMinutes <= 0) return false;
  if (admin.clockStartedAt) return false;
  const instant = now instanceof Date ? now : new Date(now);
  admin.clockStartedAt = instant.toISOString();
  if (!finiteNumber(admin.pausedMs)) admin.pausedMs = 0;
  refreshEffectiveDeadline(admin);
  if (admin.effectiveDeadline) session.endTime = admin.effectiveDeadline;
  return true;
}

export function beginPause(session, now = new Date()) {
  const admin = session?.deliveryAdministration;
  if (!admin || !admin.clockStartedAt || admin.pauseStartedAt) return false;
  const instant = now instanceof Date ? now : new Date(now);
  admin.pauseStartedAt = instant.toISOString();
  return true;
}

export function endPause(session, now = new Date()) {
  const admin = session?.deliveryAdministration;
  if (!admin?.pauseStartedAt) return { extendedMs: 0 };
  const started = Date.parse(admin.pauseStartedAt);
  const instant = now instanceof Date ? now : new Date(now);
  const delta = Number.isNaN(started) ? 0 : Math.max(0, instant.getTime() - started);
  admin.pausedMs = pausedMilliseconds(admin.pausedMs) + delta;
  admin.pauseStartedAt = null;
  refreshEffectiveDeadline(admin);
  if (admin.effectiveDeadline) session.endTime = admin.effectiveDeadline;
  return { extendedMs: delta };
}

function clockInstantMs(admin, now) {
  if (admin?.pauseStartedAt) {
    const pausedAt = Date.parse(admin.pauseStartedAt);
    if (!Number.isNaN(pausedAt)) return pausedAt;
  }
  const instant = now instanceof Date ? now : new Date(now);
  return instant.getTime();
}

function deadlineInstantMs(admin) {
  if (!admin) return null;
  if (typeof admin.effectiveDeadline === "string" && admin.effectiveDeadline) {
    const parsed = Date.parse(admin.effectiveDeadline);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const computed = computeEffectiveDeadline(admin);
  if (!computed.effectiveDeadline) return null;
  return Date.parse(computed.effectiveDeadline);
}

export function isPastDeliveryDeadline(session, now = new Date()) {
  if (!deliveryClockStarted(session)) return false;
  const admin = session.deliveryAdministration;
  const deadline = deadlineInstantMs(admin);
  if (deadline == null || Number.isNaN(deadline)) return false;
  return clockInstantMs(admin, now) >= deadline;
}

function remainingMs(session, now = new Date()) {
  const admin = session?.deliveryAdministration;
  if (!admin || !finiteNumber(admin.timeLimitMinutes) || admin.timeLimitMinutes <= 0) return null;
  const computed = computeEffectiveDeadline(admin);
  if (computed.durationMs == null) return null;
  if (!admin.clockStartedAt) return computed.durationMs;
  const deadline = deadlineInstantMs(admin);
  if (deadline == null || Number.isNaN(deadline)) return computed.durationMs;
  return Math.max(0, deadline - clockInstantMs(admin, now));
}

export function deliveryTimingView(session, now = new Date()) {
  const admin = session?.deliveryAdministration;
  if (!admin || typeof admin !== "object" || Array.isArray(admin)) return null;
  return {
    timeLimitMinutes: finiteNumber(admin.timeLimitMinutes) ? admin.timeLimitMinutes : null,
    timeMultiplier: clampTimeMultiplier(admin.timeMultiplier),
    extraTimeMinutes: extraMinutes(admin.extraTimeMinutes),
    effectiveDeadline: admin.effectiveDeadline || null,
    remainingMs: remainingMs(session, now),
    paused: Boolean(admin.pauseStartedAt) || session.status === "paused",
    reviewAllowed: typeof admin.reviewAllowed === "boolean" ? admin.reviewAllowed : null,
    attempts: Number.isInteger(admin.attempts) ? admin.attempts : null,
    feedbackMode: admin.feedbackMode || null,
  };
}

/**
 * Close a session the same way the auto-finish sweep does.
 * timeLimitReached is set only when a delivery stamp exists.
 */
export function closeSessionAtDeadline(session, now = new Date()) {
  const iso = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  session.status = "submitted";
  session.isCompleted = true;
  session.autoFinished = true;
  session.finishedAt = iso;
  session.updatedAt = iso;
  session.responses = session.responses || [];
  for (const response of session.responses) {
    response.locked = true;
    if (!response.submittedAt) response.submittedAt = iso;
  }
  if (session.deliveryAdministration && typeof session.deliveryAdministration === "object") {
    session.deliveryAdministration.timeLimitReached = true;
  }
  return session;
}

function existingResponse(session, taskId) {
  return (session?.responses || []).find((row) => row && row.taskId === taskId) || null;
}

/**
 * attempts is the maximum number of scored submits for one task.
 * A further submit replaces that task's response rows. One submit can
 * store several rows when one work product yields several observables
 * (R4); they share the attempt number. Accumulation then sees one
 * answer per observable, not per click.
 *
 * reviewAllowed false blocks that replacement. The cap still applies when
 * review is allowed. When review is off, a second submit is refused even
 * if attempts remain: changing an earlier answer is the review rule.
 * No stamp returns action "legacy". The item path keeps its historical
 * 409. The legacy question path still appends.
 */
export function evaluateAttempt(session, taskId) {
  const admin = session?.deliveryAdministration;
  const existing = existingResponse(session, taskId);
  const cap = admin && Number.isInteger(admin.attempts) && admin.attempts >= 1 ? admin.attempts : null;
  const reviewIsSet = admin && typeof admin.reviewAllowed === "boolean";

  if (!existing) {
    return {
      ok: true,
      action: "append",
      nextAttempt: cap != null || reviewIsSet ? 1 : undefined,
    };
  }

  const used = Number.isInteger(existing.attempt) && existing.attempt >= 1 ? existing.attempt : 1;

  if (!cap && !reviewIsSet) {
    return { ok: true, action: "legacy" };
  }

  if (reviewIsSet && admin.reviewAllowed === false) {
    return {
      ok: false,
      status: 409,
      code: "review_not_allowed",
      error: "Review is not allowed; earlier answers cannot be changed.",
    };
  }

  if (cap != null && used >= cap) {
    const noun = cap === 1 ? "attempt" : "attempts";
    return {
      ok: false,
      status: 409,
      code: "attempts_exhausted",
      error: `Task ${taskId} has used all ${cap} ${noun}.`,
    };
  }

  return { ok: true, action: "replace", nextAttempt: used + 1 };
}

export function placeAttempt(session, taskId, response, decision) {
  return placeAttempts(session, taskId, [response], decision);
}

export function placeAttempts(session, taskId, responses, decision) {
  const rows = (responses || []).filter(Boolean);
  for (const response of rows) {
    if (decision?.nextAttempt) response.attempt = decision.nextAttempt;
  }
  if (decision?.action === "replace") {
    session.responses = (session.responses || []).filter((row) => !row || row.taskId !== taskId);
    session.responses.push(...rows);
    return "replace";
  }
  session.responses = session.responses || [];
  session.responses.push(...rows);
  return "append";
}

function sessionClosed(session) {
  if (!session) return false;
  if (session.isCompleted === true || session.autoFinished === true) return true;
  return ["completed", "submitted", "reviewed"].includes(session.status);
}

/**
 * Student payloads only. Staff roles keep scores, correctness, and explanations.
 * none: always hidden. immediate: shown. delayed_end: hidden until the session
 * is closed. No feedbackMode: nothing is hidden.
 */
function feedbackHiddenFromViewer(session, user) {
  const mode = session?.deliveryAdministration?.feedbackMode;
  if (!mode || !FEEDBACK_MODES.includes(mode)) return false;
  if (!user || user.role !== "student") return false;
  if (mode === "immediate") return false;
  if (mode === "none") return true;
  if (mode === "delayed_end") return !sessionClosed(session);
  return false;
}

function redactFeedback(copy) {
  if (Array.isArray(copy.responses)) {
    copy.responses = copy.responses.map((response) => {
      if (!response || typeof response !== "object") return response;
      const next = { ...response };
      for (const key of RESPONSE_FEEDBACK_KEYS) delete next[key];
      return next;
    });
  }
  delete copy.studentModel;
  delete copy.accumulationWarnings;
  delete copy.assemblyProgress;
  if (Array.isArray(copy.pendingHumanRatings)) {
    copy.pendingHumanRatings = copy.pendingHumanRatings.map((row) => {
      if (!row || typeof row !== "object") return row;
      const next = { ...row };
      delete next.activated;
      return next;
    });
  }
  return copy;
}

/**
 * Additive deliveryTiming when a stamp exists. Redacts a copy for a student
 * when feedback is hidden. Returns the same object when neither applies,
 * so an unstamped payload stringifies as before.
 */
export function presentSession(session, user, now = new Date()) {
  if (!session || typeof session !== "object") return session;
  const hide = feedbackHiddenFromViewer(session, user);
  const timing = deliveryTimingView(session, now);
  if (!hide && !timing) return session;
  const copy = hide ? structuredClone(session) : { ...session };
  if (hide) redactFeedback(copy);
  if (timing) copy.deliveryTiming = timing;
  return copy;
}

function isoDate(value, label, errors) {
  if (value == null) return;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    errors.push(`${label} must be an ISO date string when present.`);
  }
}

export function deliveryAdministrationErrors(admin) {
  const errors = [];
  if (admin == null) return errors;
  if (typeof admin !== "object" || Array.isArray(admin)) {
    errors.push("deliveryAdministration must be an object.");
    return errors;
  }
  if (admin.timeLimitMinutes != null && (!finiteNumber(admin.timeLimitMinutes) || admin.timeLimitMinutes <= 0)) {
    errors.push("deliveryAdministration.timeLimitMinutes must be a positive number when present.");
  }
  if (admin.attempts != null && (!Number.isInteger(admin.attempts) || admin.attempts < 1)) {
    errors.push("deliveryAdministration.attempts must be an integer of at least 1 when present.");
  }
  if (admin.allowedReview != null && typeof admin.allowedReview !== "boolean") {
    errors.push("deliveryAdministration.allowedReview must be a boolean when present.");
  }
  if (admin.feedbackMode != null && !FEEDBACK_MODES.includes(admin.feedbackMode)) {
    errors.push(
      `Invalid deliveryAdministration.feedbackMode '${admin.feedbackMode}'. Must be one of: ${FEEDBACK_MODES.join(", ")}.`
    );
  }
  if (admin.timeMultiplier != null && (!finiteNumber(admin.timeMultiplier) || admin.timeMultiplier < 1 || admin.timeMultiplier > 3)) {
    errors.push("deliveryAdministration.timeMultiplier must be a number in [1, 3] when present.");
  }
  if (admin.presentationAllowReview != null && typeof admin.presentationAllowReview !== "boolean") {
    errors.push("deliveryAdministration.presentationAllowReview must be a boolean when present.");
  }
  if (admin.reviewAllowed != null && typeof admin.reviewAllowed !== "boolean") {
    errors.push("deliveryAdministration.reviewAllowed must be a boolean when present.");
  }
  if (admin.extraTimeMinutes != null && (!finiteNumber(admin.extraTimeMinutes) || admin.extraTimeMinutes < 0)) {
    errors.push("deliveryAdministration.extraTimeMinutes must be a non-negative number when present.");
  }
  if (admin.pausedMs != null && (!finiteNumber(admin.pausedMs) || admin.pausedMs < 0)) {
    errors.push("deliveryAdministration.pausedMs must be a non-negative number when present.");
  }
  if (admin.presentationModelId != null && typeof admin.presentationModelId !== "string") {
    errors.push("deliveryAdministration.presentationModelId must be a string when present.");
  }
  if (admin.timeLimitReached != null && typeof admin.timeLimitReached !== "boolean") {
    errors.push("deliveryAdministration.timeLimitReached must be a boolean when present.");
  }
  isoDate(admin.clockStartedAt, "deliveryAdministration.clockStartedAt", errors);
  isoDate(admin.pauseStartedAt, "deliveryAdministration.pauseStartedAt", errors);
  isoDate(admin.effectiveDeadline, "deliveryAdministration.effectiveDeadline", errors);
  return errors;
}
