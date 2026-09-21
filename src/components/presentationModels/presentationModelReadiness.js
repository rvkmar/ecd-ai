// src/components/presentationModels/presentationModelReadiness.js
// D113: single client mirror of validatePresentationModelLifecycle's
// REVIEWED and CONFIRMED gates. Step5Review and the wizard context must
// both call these — a hand-written duplicate is how D54's debt stayed open.

/**
 * True when the draft satisfies the server's "reviewed" shape checks.
 * Authoritative twin: validatePresentationModelLifecycle for status reviewed+.
 */
export function meetsPresentationReviewedGates(draft) {
  if (!draft || typeof draft !== "object") return false;
  return Boolean(
    draft.name &&
      draft.taskModelId &&
      draft.layout?.itemOrder &&
      draft.layout?.navigation
  );
}

/**
 * True when the draft satisfies reviewed gates plus the confirmation
 * overlay (feedback timing + accessibility profile).
 */
export function meetsPresentationConfirmedGates(draft) {
  return (
    meetsPresentationReviewedGates(draft) &&
    Boolean(draft.conditionalDisplay?.showFeedback) &&
    Boolean(draft.accessibility?.profile)
  );
}
