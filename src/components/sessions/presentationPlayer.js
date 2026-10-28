// src/components/sessions/presentationPlayer.js
//
// R3 player policy. Pure. SessionPlayer and the student wizard read this
// instead of re-deriving layout, review, and feedback in the render.
//
// Precedence when presentation and delivery disagree:
// - Review UI (back navigation and the review screen) is shown only when
//   the presentation model allows it and session.administration.allowedReview
//   is not false. A missing administration object means the server has not
//   set a ceiling. An explicit true does not open review the presentation
//   model closed. Layout navigation "linear" also closes both, because
//   linear is forward only.
// - Feedback timing is the stricter of conditionalDisplay.showFeedback and
//   session.administration.feedbackMode (none, then delayed_end, then
//   immediate). The panel renders only fields already on the response.
// - The countdown is session.endTime (else the latest task endTime). This
//   module does not multiply that clock. R2 stamps the deadline with
//   presentationTimeMultiplier.

import { presentationChrome } from "./presentationChrome.js";

const FEEDBACK_RANK = Object.freeze({
  none: 0,
  delayed_end: 1,
  immediate: 2,
});

export function serverDeliveryCeiling(session) {
  const admin = session?.administration;
  if (!admin || typeof admin !== "object" || Array.isArray(admin)) {
    return { allowedReview: null, feedbackMode: null };
  }
  return {
    allowedReview: typeof admin.allowedReview === "boolean" ? admin.allowedReview : null,
    feedbackMode: Object.prototype.hasOwnProperty.call(FEEDBACK_RANK, admin.feedbackMode)
      ? admin.feedbackMode
      : null,
  };
}

export function effectiveFeedbackTiming(presentationTiming, serverTiming) {
  const presentation = Object.prototype.hasOwnProperty.call(FEEDBACK_RANK, presentationTiming)
    ? presentationTiming
    : "none";
  if (!serverTiming || !Object.prototype.hasOwnProperty.call(FEEDBACK_RANK, serverTiming)) {
    return presentation;
  }
  return FEEDBACK_RANK[serverTiming] < FEEDBACK_RANK[presentation] ? serverTiming : presentation;
}

export function presentationPlayerPolicy(presentation, session) {
  const chrome = presentationChrome(presentation);
  const ceiling = serverDeliveryCeiling(session);
  const serverClosedReview = ceiling.allowedReview === false;
  const allowReview = serverClosedReview ? false : chrome.allowReview;
  const navigation = chrome.navigation;
  const linear = navigation === "linear";
  const blocksBack = !allowReview || linear;

  return {
    chrome,
    itemOrder: chrome.itemOrder || "authored",
    grouping: chrome.grouping,
    navigation,
    allowReview,
    allowItemNavigation: !blocksBack,
    showReviewScreen: !blocksBack,
    feedbackTiming: effectiveFeedbackTiming(chrome.showFeedback, ceiling.feedbackMode),
    timeMultiplier: chrome.timeMultiplier,
    serverReviewDenied: serverClosedReview,
    serverFeedbackMode: ceiling.feedbackMode,
  };
}

function hashSeed(text) {
  let hash = 2166136261;
  const value = String(text || "");
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Authored order is the session taskIds array. Random is a stable shuffle
 * for this session id so the rail does not jump on each render. Adaptive
 * selection stays on /next-task. This only changes the order the examinee
 * sees.
 */
export function orderTaskIds(taskIds, itemOrder, seed) {
  const ids = Array.isArray(taskIds) ? taskIds.filter((id) => id != null) : [];
  if (itemOrder !== "random" || ids.length < 2) return ids.slice();
  const next = ids.slice();
  const random = mulberry32(hashSeed(seed));
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = next[i];
    next[i] = next[j];
    next[j] = swap;
  }
  return next;
}

/**
 * Lines the player may show. Every line is copied from the response the
 * server stored. The item key is not an input.
 */
export function responseFeedbackLines(response) {
  if (!response || typeof response !== "object") return [];
  const lines = [];
  const feedback = response.feedback;
  if (feedback && typeof feedback === "object" && !Array.isArray(feedback)) {
    if (typeof feedback.message === "string" && feedback.message.trim()) {
      lines.push(feedback.message.trim());
    }
    if (feedback.correct === true) lines.push("Correct");
    if (feedback.correct === false) lines.push("Not correct");
  }
  if (typeof response.rationale === "string" && response.rationale.trim()) {
    lines.push(response.rationale.trim());
  }
  if (lines.length === 0 && typeof response.activated === "boolean") {
    lines.push(
      response.activated
        ? "The response counted toward the score."
        : "The response did not count toward the score."
    );
  }
  if (lines.length === 0 && response.scoredValue != null && response.scoredValue !== "") {
    lines.push(`Score: ${response.scoredValue}`);
  }
  return lines;
}

export function feedbackVisibleNow(timing, phase, sessionClosed) {
  if (timing === "immediate") return true;
  if (timing === "delayed_end") {
    return sessionClosed === true || phase === "review" || phase === "completed" || phase === "submitted";
  }
  return false;
}

export function shouldHoldForImmediateFeedback(timing, response) {
  return timing === "immediate" && responseFeedbackLines(response).length > 0;
}
