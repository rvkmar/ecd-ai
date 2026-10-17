// Design Pattern → shared wizard-shell mapping (off-calendar, convention C).
// ------------------------------------------------------------
// Not D146. The shared shell is props-driven. These helpers are the
// single place that turns a design-pattern form into rail steps, real
// completion ticks, and the confirm-blocker banner. Tests import the
// same functions the screen uses.
//
// Convention C here differs from Item in one place the shell already
// allows: the rail does not gate. `canNavigateDesignPatternRail` is
// true for every in-range index, so an author can open any step.
// Ticks still come from `isStepComplete`, not from cursor position.
// Confirm blockers keep the readiness sentences; they do not rename
// Save for Review / Lock & Confirm — those stay hidden.
// ------------------------------------------------------------

export const DESIGN_PATTERN_WIZARD_STEPS = Object.freeze([
  { id: "identity", label: "Identity", blurb: "Title and summary." },
  { id: "rationale", label: "Rationale", blurb: "Why these KSAs are worth assessing." },
  { id: "focalKsas", label: "Focal KSAs", blurb: "The construct this pattern centres." },
  { id: "additionalKsas", label: "Additional KSAs", blurb: "Construct-irrelevant demands." },
  {
    id: "observations",
    label: "Potential observations",
    blurb: "Kinds of evidence this pattern could produce.",
  },
  {
    id: "workProducts",
    label: "Work products & rubrics",
    blurb: "Objects a task might produce, and how they could be scored.",
  },
  {
    id: "features",
    label: "Characteristic & variable features",
    blurb: "What stays fixed, and what may vary.",
  },
  {
    id: "relations",
    label: "Relations (kind-of) & references",
    blurb: "Links to other patterns, and external references.",
  },
  {
    id: "review",
    label: "Review & confirm",
    blurb: "Templates, seeding, and seeded models.",
  },
]);

export const DESIGN_PATTERN_WIZARD_STEP_IDS = DESIGN_PATTERN_WIZARD_STEPS.map(
  (step) => step.id
);

// Free navigation. Out-of-range indexes are refused; every real step is
// reachable from every other step. There is no current-step parameter
// because cursor position does not gate the rail.
export function canNavigateDesignPatternRail(
  index,
  total = DESIGN_PATTERN_WIZARD_STEPS.length
) {
  return Number.isInteger(index) && index >= 0 && index < total;
}

function filledLabel(entries) {
  return (entries || []).some((entry) => String(entry?.label || "").trim());
}

function filledKey(entries, key) {
  return (entries || []).some((entry) => String(entry?.[key] || "").trim());
}

/**
 * Real completion for one rail step. Optional menus tick when they hold
 * a value, not because the author walked past them. Review ticks only
 * when confirm-time readiness already passed.
 *
 * @param {string} stepId
 * @param {object} form
 * @param {{ confirmReady?: boolean }} [options]
 */
export function designPatternStepComplete(stepId, form = {}, options = {}) {
  switch (stepId) {
    case "identity":
      return Boolean(String(form.name || "").trim() && String(form.summary || "").trim());
    case "rationale":
      return Boolean(String(form.rationale || "").trim());
    case "focalKsas":
      return filledLabel(form.focalKsas);
    case "additionalKsas":
      return filledLabel(form.additionalKsas);
    case "observations":
      return filledLabel(form.potentialObservations);
    case "workProducts":
      return (
        filledKey(form.potentialWorkProducts, "workProductId") ||
        filledKey(form.potentialRubrics, "rubricId")
      );
    case "features":
      return (
        filledLabel(form.characteristicFeatures) ||
        filledKey(form.variableFeatures, "taskModelVariableId")
      );
    case "relations":
      return (
        (form.relationships || []).some((entry) =>
          String(entry?.targetPatternId || "").trim()
        ) || (form.references || []).some((entry) => String(entry?.label || "").trim())
      );
    case "review":
      return options.confirmReady === true;
    default:
      return false;
  }
}

/** Confirm-blocker banner. Sentences stay the readiness wording. */
export function designPatternBlockersCopy(errors) {
  if (!errors || errors.length === 0) return "";
  return errors.join(" ");
}
