// Task Model → shared wizard-shell mapping (D111 convention B).
// ------------------------------------------------------------
// The shared shell is props-driven. These helpers are the single place
// that turns Task Model context (readiness checks, isEditable, step
// keys) into those props. Tests import the same functions the adapters
// use, so a silent change to rail gating, amber-dot mapping, or the
// named blocking reason fails here rather than only in a screenshot.
// ------------------------------------------------------------

export const TASK_MODEL_STEP_LABELS = {
    identity: "Task Identity",
    evidence: "Evidence Binding",
    observables: "Observable Targeting",
    structure: "Task Structure",
    blueprint: "Blueprint Constraints",
    variables: "Task Model Variables",
    itemMapping: "Item Mapping",
    fairness: "Fairness & Accessibility",
    review: "Review & Lifecycle",
};

// Which readiness checks each step is answerable for. Steps with no
// entry are advisory and never flagged. Keys must match STEPS in
// TaskModelWizardContext.jsx and taskModelReadiness() check keys.
export const TASK_MODEL_STEP_READINESS_KEYS = {
    identity: ["identity"],
    evidence: ["evidence"],
    observables: ["observables", "weights"],
    structure: ["structure"],
    blueprint: ["blueprint"],
};

export function taskModelRailSteps(stepKeys) {
    return (stepKeys || []).map((id) => ({
        id,
        label: TASK_MODEL_STEP_LABELS[id] || id,
    }));
}

// Forward via the rail is never allowed while editing -- only Next.
// A read-only model keeps every step reachable so View mode can walk it.
export function canNavigateTaskModelRail(index, { isEditable, currentStep }) {
    return isEditable ? index < currentStep : true;
}

export function taskModelStepHasOutstandingWork(
    stepKey,
    readiness,
    isEditable
) {
    if (!isEditable) return false;
    const failed = new Set(
        (readiness?.checks || []).filter((c) => !c.valid).map((c) => c.key)
    );
    return (TASK_MODEL_STEP_READINESS_KEYS[stepKey] || []).some((key) =>
        failed.has(key)
    );
}

export function taskModelBlockingReason(readiness) {
    const failed = (readiness?.checks || []).filter((c) => !c.valid);
    if (failed.length === 0) return "Resolve required fields before proceeding.";
    return failed[0].detail;
}

export function taskModelLockedNotice(lifecycleStatus) {
    return `This Task Model is ${lifecycleStatus} and no longer editable. Structural changes require cloning to a new version.`;
}
