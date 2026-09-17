// src/components/assemblyModels/assemblyModelReadiness.js
// D54 / D90: single client mirror of validateAssemblyModelLifecycle's
// REVIEWED and CONFIRMED gates (server/utils/lifecycleValidation.js).
// Step5Review and AssemblyModelWizardContext must both call these —
// a hand-written duplicate in either place is how the debt stayed open.

/**
 * True when the draft satisfies the server's "reviewed" shape checks.
 * Authoritative twin: validateAssemblyModelLifecycle for status reviewed+.
 */
export function meetsAssemblyReviewedGates(draft) {
  if (!draft || typeof draft !== "object") return false;
  return Boolean(
    draft.name &&
      draft.competencyModelId &&
      Array.isArray(draft.targetsBySMV) &&
      draft.targetsBySMV.length > 0 &&
      draft.selectionAlgorithm?.policyId
  );
}

/**
 * True when at least one stopping rule is actually set.
 * Require at least one of maxItems / minItems / targetsMet.
 * Matches validateAssemblyModelLifecycle confirmed gate and schema.js.
 */
export function hasAssemblyStoppingRule(draft) {
  const sr = draft?.stoppingRules || {};
  return (
    sr.maxItems !== undefined ||
    sr.minItems !== undefined ||
    sr.targetsMet !== undefined
  );
}

/**
 * True when the draft satisfies reviewed gates plus a real stopping rule
 * (server confirmed+ additionally requires stoppingRules present; schema
 * requires at least one of max/min/targetsMet when the key is present).
 */
export function meetsAssemblyConfirmedGates(draft) {
  return meetsAssemblyReviewedGates(draft) && hasAssemblyStoppingRule(draft);
}
