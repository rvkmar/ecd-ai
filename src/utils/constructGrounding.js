// A Student Model cites a curricular policy from the Policies menu.
// The ungrounded waiver is the confirmation path only when that menu
// is empty. Domain Analysis content standards are not edited here.

export function constructFrameworkGrounded(framework = {}, policies) {
  const reason = framework.ungroundedReason;
  const waived =
    framework.ungroundedWaiver === true &&
    typeof reason === "string" &&
    reason.trim().length >= 10;
  const codes = Array.isArray(framework.curricularGoalCodes)
    ? framework.curricularGoalCodes
    : [];
  const cited =
    Boolean(framework.policyId) &&
    codes.length > 0 &&
    (policies == null ||
      policies.some((policy) => policy.id === framework.policyId));

  if (Array.isArray(policies)) {
    return policies.length > 0 ? cited : waived;
  }
  return cited || waived;
}

export function constructGroundingMessage(policies) {
  if (Array.isArray(policies) && policies.length > 0) {
    return "A curricular policy exists. Cite one from Home → Curricular policies and choose at least one goal. An ungrounded waiver is only available when no curricular policy exists.";
  }
  if (Array.isArray(policies)) {
    return "No curricular policy exists yet. Set ungroundedWaiver with ungroundedReason (≥10 characters).";
  }
  return "Construct framework must cite a curricular policy with ≥1 goal, or set ungroundedWaiver with ungroundedReason (≥10 chars).";
}
