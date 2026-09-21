// Item → shared wizard-shell mapping (D112 convention C).
// ------------------------------------------------------------
// The shared shell is props-driven. These helpers are the single place
// that turns Item context (stepCompletion, isLocked, stepBlockers,
// lifecycle status) into those props. Tests import the same functions
// the adapters use, so a silent change to Next gating, named blocker
// copy, real completion ticks, or rail reachability fails here rather
// than only in a screenshot.
//
// Convention C reuses B's `canNavigateTo` (with Item's inclusive
// current-step rule) and does NOT use B's amber outstanding-work dots
// or toastOnBlock. Ticks are `isStepComplete`; blockers are a banner.
// ------------------------------------------------------------

import { ITEM_WIZARD_STEPS } from "../itemConstants";

export function itemWizardRailSteps(steps = ITEM_WIZARD_STEPS) {
    return (steps || []).map((s) => ({
        id: s.key,
        key: s.key,
        label: s.label,
        blurb: s.blurb,
    }));
}

// Backwards and re-entry are always allowed; forward jumps are earned.
// A locked item is being read, so every step is reachable. The current
// step stays clickable (unlike Task Model convention B, which disables
// it while editing).
export function canNavigateItemRail(index, { isLocked, currentStep }) {
    return Boolean(isLocked) || index <= currentStep;
}

// Real completion, not cursor position. `index < currentStep` is what
// this wizard used to do, and walking back to step 1 un-ticked steps
// 2 and 3 even though nothing about them had changed.
export function itemStepIsComplete(stepKey, stepCompletion) {
    return stepCompletion?.[stepKey] === true;
}

export function itemStepBlockersCopy(stepBlockers) {
    if (!stepBlockers?.length) return "";
    const labels = stepBlockers.map((b) => b.label).join(" · ");
    const detail = stepBlockers[0]?.detail;
    return detail ? `${labels} — ${detail}` : labels;
}

export function itemLockedNotice(status) {
    return `This item is ${status} and locked. Structural changes require cloning.`;
}

export function itemStatusLabel(status, versionNumber) {
    return versionNumber ? `${status} · v${versionNumber}` : status;
}
