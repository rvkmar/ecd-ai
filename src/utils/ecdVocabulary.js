// src/utils/ecdVocabulary.js
// ------------------------------------------------------------
// The shared ECD response vocabulary: observable response modes,
// item interaction types, scoring methods, and the compatibility
// relations between them.
//
// WHY THIS FILE EXISTS
//
// These three vocabularies used to live in three places that had to be
// kept in step by hand:
//
//   observable.type        -> ObservableCard.observableTypes  (evidence wizard)
//   interaction.type       -> ResponseComponentEditor.INTERACTION_REGISTRY
//                             + taskModelConstants.INTERACTION_TYPES
//   scoring.method         -> ScoringMethodSelector.deriveAllowedScoringMethods
//                             + taskModelConstants.SCORING_METHODS
//
// They drifted, and the drift was fatal. src/utils/schema.js enforced
//
//     item.interaction.type === observable.type
//
// while the two enums had *no value in common*: observables are authored as
// selected_response / constructed_response / numeric_response / performance /
// artifact / behavior / process_trace, and interactions as
// mcq / multiselect / numeric / constructed / likert. Every item ever
// authored failed with "interaction.type must match observable.type", and
// no choice the author could make in the wizard would ever satisfy it.
//
// The equality rule was the real mistake, not just the drift. An
// observable's `type` is an EVIDENCE-level statement -- what kind of
// performance is being captured. An interaction's `type` is a DELIVERY-level
// statement -- which widget captures it. They sit at different levels of
// abstraction, so the relation between them is one-to-many compatibility,
// never identity: a `selected_response` observable is legitimately elicited
// by an MCQ, a multi-select or a Likert scale.
//
// This module is that relation, in one place, imported by BOTH sides
// (src/utils/* is bundled for the browser by vite and loaded directly by
// node, which is why schema.js already lives here). Nothing mirrors it.
// ------------------------------------------------------------

/* =====================================================
   1. Observable response modes (evidence-model level)
   Keep in step with ObservableCard's picker -- it renders from here.
===================================================== */

export const OBSERVABLE_RESPONSE_MODES = [
  {
    value: "selected_response",
    label: "Selected Response",
    hint: "Examinee chooses from presented options.",
  },
  {
    value: "constructed_response",
    label: "Constructed Response",
    hint: "Examinee authors free text, working or an explanation.",
  },
  {
    value: "numeric_response",
    label: "Numeric Response",
    hint: "Examinee supplies a number or quantity.",
  },
  {
    value: "performance",
    label: "Performance",
    hint: "Observed performance, rated against a rubric by an assessor.",
  },
  {
    value: "artifact",
    label: "Artifact",
    hint: "A produced work product is submitted and rated.",
  },
  {
    value: "behavior",
    label: "Behavior",
    hint: "A discrete observed behaviour is recorded.",
  },
  {
    value: "process_trace",
    label: "Process Trace",
    hint: "The sequence of actions taken is itself the evidence.",
  },
];

export const OBSERVABLE_RESPONSE_MODE_VALUES = OBSERVABLE_RESPONSE_MODES.map(
  (m) => m.value
);

/* =====================================================
   2. Interaction types (item / delivery level)
   Keep in step with ResponseComponentEditor.INTERACTION_REGISTRY --
   that registry supplies the EDITOR for each type; this list is the
   vocabulary. A type present here with no registry entry renders no
   editor, so add both together.
===================================================== */

export const INTERACTION_TYPES = [
  { value: "mcq", label: "Multiple Choice" },
  { value: "multiselect", label: "Multi Select" },
  { value: "numeric", label: "Numeric Input" },
  { value: "constructed", label: "Constructed Response" },
  { value: "likert", label: "Likert Scale" },
];

export const INTERACTION_TYPE_VALUES = INTERACTION_TYPES.map((t) => t.value);

export function interactionLabel(value) {
  return INTERACTION_TYPES.find((t) => t.value === value)?.label || value || "—";
}

/* =====================================================
   3. Compatibility: which interactions may elicit which observable
   -----------------------------------------------------
   An empty list means "no on-screen ItemPresenter widget captures this
   observable." performance / artifact / behavior / process_trace are
   rated or logged, not answered in a response component. That is
   intentional — see WORK_PRODUCT_TYPE_DISPOSITIONS (D125). Do NOT map
   them onto `constructed`: pretending a rated performance is a text box
   would let an author confirm an item that collects the wrong evidence.
   The wizard says so plainly and blocks the binding.
===================================================== */

export const INTERACTION_COMPATIBILITY = {
  selected_response: ["mcq", "multiselect", "likert"],
  constructed_response: ["constructed"],
  numeric_response: ["numeric"],
  performance: [],
  artifact: [],
  behavior: [],
  process_trace: [],
};

/**
 * D125 / W25 — dispositions for every work-product (observable response)
 * type. Resolves the conformance-schedule §6 deferred entry that held
 * performance / artifact / behavior / process_trace as "unsupported until
 * 3.4–3.5." Those objects now exist (D121–D124); each type has an
 * explicit status:
 *   supported     — authorable and evaluable on the current path
 *   later         — named prerequisite before support
 *   out_of_scope  — deliberately not this platform, with reason
 *
 * Empty INTERACTION_COMPATIBILITY for the four performance-assessment
 * types is part of the disposition (external / logged capture), not a
 * missing feature to silently fill with `constructed`.
 */
export const WORK_PRODUCT_DISPOSITION_STATUS = Object.freeze({
  SUPPORTED: "supported",
  LATER: "later",
  OUT_OF_SCOPE: "out_of_scope",
});

export const WORK_PRODUCT_TYPE_DISPOSITIONS = Object.freeze({
  selected_response: {
    status: WORK_PRODUCT_DISPOSITION_STATUS.SUPPORTED,
    resolvedAt: "D121",
    capture: "interaction",
    evaluation: ["automated", "human", "hybrid"],
    interactionTypes: ["mcq", "multiselect", "likert"],
    prerequisite: null,
    note: "Captured by ItemPresenter selection widgets; Identification via key/auto/map.",
  },
  constructed_response: {
    status: WORK_PRODUCT_DISPOSITION_STATUS.SUPPORTED,
    resolvedAt: "D121",
    capture: "interaction",
    evaluation: ["automated", "human", "hybrid"],
    interactionTypes: ["constructed"],
    prerequisite: null,
    note: "Captured by constructed text widget; often human/rubric phases.",
  },
  numeric_response: {
    status: WORK_PRODUCT_DISPOSITION_STATUS.SUPPORTED,
    resolvedAt: "D121",
    capture: "interaction",
    evaluation: ["automated", "human", "hybrid"],
    interactionTypes: ["numeric"],
    prerequisite: null,
    note: "Captured by numeric widget; Identification via key/auto.",
  },
  performance: {
    status: WORK_PRODUCT_DISPOSITION_STATUS.SUPPORTED,
    resolvedAt: "D125",
    capture: "external_observation",
    evaluation: ["human", "hybrid"],
    interactionTypes: [],
    prerequisite: null,
    note:
      "Observed performance is a Work Product (D121) rated against a library rubric (D122) through multi-phase evaluation (D123) on the blinded HumanRatingQueue (D124). No on-screen answer widget — assessor observes and rates.",
  },
  artifact: {
    status: WORK_PRODUCT_DISPOSITION_STATUS.SUPPORTED,
    resolvedAt: "D125",
    capture: "external_artifact",
    evaluation: ["human", "hybrid"],
    interactionTypes: [],
    prerequisite: null,
    note:
      "Produced artifacts are Work Products rated via human/hybrid phases and rubrics. Dedicated file-upload ItemPresenter chrome is a later enhancement; type is authorable and rater-evaluable now (payload as work-product content).",
  },
  behavior: {
    status: WORK_PRODUCT_DISPOSITION_STATUS.SUPPORTED,
    resolvedAt: "D125",
    capture: "external_observation",
    evaluation: ["human", "hybrid"],
    interactionTypes: [],
    prerequisite: null,
    note:
      "Discrete observed behaviours are recorded as Work Products and rated on the human-rating path. No examinee-facing interaction widget.",
  },
  process_trace: {
    status: WORK_PRODUCT_DISPOSITION_STATUS.SUPPORTED,
    resolvedAt: "D125",
    capture: "process_log",
    evaluation: ["automated", "human", "hybrid"],
    interactionTypes: [],
    prerequisite: null,
    note:
      "Action sequences are evidence via process_log / auto artifacts (EM-R1) and optional human phases. Capture is instrumentation, not an ItemPresenter interaction.",
  },
});

/** @returns {typeof WORK_PRODUCT_TYPE_DISPOSITIONS[string] | null} */
export function workProductTypeDisposition(type) {
  if (!type) return null;
  return WORK_PRODUCT_TYPE_DISPOSITIONS[type] || null;
}

/** Conformance §6 performance-assessment set (the deferred four). */
export const PERFORMANCE_ASSESSMENT_WORK_PRODUCT_TYPES = Object.freeze([
  "performance",
  "artifact",
  "behavior",
  "process_trace",
]);

export function isPerformanceAssessmentWorkProductType(type) {
  return PERFORMANCE_ASSESSMENT_WORK_PRODUCT_TYPES.includes(type);
}

export function interactionTypesForObservable(observableType) {
  if (!observableType) return [];
  return INTERACTION_COMPATIBILITY[observableType] || [];
}

export function isInteractionCompatible(observableType, interactionType) {
  if (!observableType || !interactionType) return false;
  return interactionTypesForObservable(observableType).includes(interactionType);
}

/* =====================================================
   3b. Work Product types (D121 / W25 G12)
   -----------------------------------------------------
   A Work Product is what the examinee produces; an interaction is how
   it is captured. The type vocabulary is the same evidence-level list
   as observable response modes — one definition, aliased here so
   authoring and Identification never invent a second enum.
===================================================== */

export const WORK_PRODUCT_TYPES = OBSERVABLE_RESPONSE_MODES;
export const WORK_PRODUCT_TYPE_VALUES = OBSERVABLE_RESPONSE_MODE_VALUES;

export function workProductTypeLabel(value) {
  return WORK_PRODUCT_TYPES.find((t) => t.value === value)?.label || value || "—";
}

/** Interactions that may capture this work-product type (same map as observables). */
export function interactionTypesForWorkProduct(workProductType) {
  return interactionTypesForObservable(workProductType);
}

/* Human-readable explanation of an incompatibility, used verbatim by both
   the wizard advisory and the server error so the author reads the same
   sentence in both places. */
export function interactionCompatibilityMessage(observableType, interactionType) {
  const allowed = interactionTypesForObservable(observableType);

  if (!observableType) {
    return "No observable is bound, so no interaction type can be checked.";
  }

  if (allowed.length === 0) {
    const disposition = workProductTypeDisposition(observableType);
    if (
      disposition?.status === WORK_PRODUCT_DISPOSITION_STATUS.SUPPORTED &&
      isPerformanceAssessmentWorkProductType(observableType)
    ) {
      return (
        `Observables of type '${observableType}' use ${disposition.capture.replace(/_/g, " ")} ` +
        `capture and ${disposition.evaluation.join("/")} evaluation — not an on-screen answer widget. ` +
        `Author a Work Product of this type and rate it on the human-rating path; ` +
        `do not bind a selected/constructed/numeric ItemPresenter interaction.`
      );
    }
    return `Observables of type '${observableType}' are rated or logged rather than answered on screen, so no interaction type can capture them. Bind an observable with a selected, constructed or numeric response mode.`;
  }

  if (!interactionType) {
    return `Choose an interaction type. '${observableType}' can be elicited by: ${allowed
      .map(interactionLabel)
      .join(", ")}.`;
  }

  return `Interaction '${interactionLabel(
    interactionType
  )}' cannot elicit a '${observableType}' observable. Allowed here: ${allowed
    .map(interactionLabel)
    .join(", ")}.`;
}

/* =====================================================
   4. Scoring methods, derived from the ACTIVE statistical model
   -----------------------------------------------------
   Single definition. ScoringMethodSelector and taskModelConstants both
   import from here; before this they each carried a copy and the comment
   at the top of each told the reader to keep them in step manually.
===================================================== */

export const SCORING_METHODS = [
  { value: "dichotomous", label: "Dichotomous (0 / 1)" },
  { value: "polytomous", label: "Polytomous (Ordered Categories)" },
  { value: "category_map", label: "Category Mapping" },
  { value: "weighted_sum", label: "Weighted Sum" },
  { value: "categorical_activation", label: "Categorical Activation" },
];

export const SCORING_METHOD_VALUES = SCORING_METHODS.map((m) => m.value);

export function scoringLabel(value) {
  return SCORING_METHODS.find((m) => m.value === value)?.label || value || "—";
}

export function deriveAllowedScoringMethods(model) {
  if (!model) return [];

  const { type, subtype } = model;

  switch (type) {
    case "rasch":
      return ["dichotomous"];

    case "irt":
      if (subtype === "graded" || subtype === "grm") return ["polytomous"];
      return ["dichotomous"];

    case "threshold":
      return ["category_map"];

    // Classical Test Theory scores the observable itself, then totals.
    // Which is right depends on the observable, not on the model: a 0/1
    // observable is dichotomous, a weighted contribution is a weighted sum
    // -- so both are offered.
    case "ctt":
      return ["dichotomous", "weighted_sum"];

    case "sum":
      return ["weighted_sum"];

    case "bayesian_network":
      return ["categorical_activation"];

    // DINA/G-DINA classify each response pattern into a discrete attribute-
    // mastery STATE, the same shape of output as a Bayesian network's
    // latent node -- categorical_activation's responsePattern (a `state`
    // key) fits directly, with no dichotomous/polytomous reading available
    // since a single item's response isn't itself "correct" or "banded".
    case "dina":
    case "gdina":
      return ["categorical_activation"];

    default:
      return [];
  }
}

/* =====================================================
   5. Response-pattern shape per scoring method
   -----------------------------------------------------
   `scoring.evidenceActivationMap[].responsePattern` is declared as a bare
   'object' in the schema, which meant the editor could write any shape and
   nothing downstream could read it. These descriptors give the editor its
   fields and give validation something to check.
===================================================== */

export const RESPONSE_PATTERN_FIELDS = {
  dichotomous: [
    { key: "equalsCorrect", label: "Response is correct", type: "boolean" },
  ],
  polytomous: [
    { key: "categoryValue", label: "Category value", type: "number" },
  ],
  weighted_sum: [
    { key: "minScore", label: "Minimum raw score", type: "number" },
    { key: "maxScore", label: "Maximum raw score", type: "number" },
  ],
  category_map: [
    { key: "categoryLabel", label: "Category label", type: "string" },
  ],
  categorical_activation: [{ key: "state", label: "State", type: "string" }],
};

export function responsePatternFields(method) {
  return RESPONSE_PATTERN_FIELDS[method] || [];
}

/* True when the pattern has at least one of the fields its method
   declares filled in, OR -- Day 27 -- at least one genuinely non-empty
   key/value pair of any name at all.

   The second clause exists because two subsystems built against this same
   field independently settled on different shapes: the Item Wizard's
   EvidenceActivationEditor renders inputs FROM this table (so a
   `dichotomous` rule it authors really does write `{equalsCorrect:
   boolean}`), while server/delivery/evidenceIdentification.js -- the thing
   that actually EVALUATES a responsePattern against a real work product --
   matches raw response-value keys directly (`{selected: "opt_a"}`, the
   shape the repo's own worked example, samples/sample-items.json, uses).
   Before this fix, an item authored with that raw-response shape could
   never be confirmed: this function returned false for it, since
   `equalsCorrect` was absent. An abstract summary key like `equalsCorrect`
   is itself never present on a real work product either, so treating it as
   the ONLY valid shape would have made every dichotomous item
   unconfirmable in practice once evidenceIdentification.js actually needed
   to consume it. Both shapes are accepted here rather than picking one and
   breaking the other's confirmed items retroactively.

   An empty `{}` is not a condition either way -- it matches everything and
   nothing, and used to sail through validation because `{}` is truthy. */
export function responsePatternIsSpecified(method, pattern) {
  if (!pattern || typeof pattern !== "object" || Array.isArray(pattern)) return false;

  const fields = responsePatternFields(method);

  if (fields.some((f) => {
    const v = pattern[f.key];
    if (f.type === "boolean") return typeof v === "boolean";
    if (f.type === "number") return typeof v === "number" && Number.isFinite(v);
    return String(v ?? "").trim().length > 0;
  })) {
    return true;
  }

  return Object.values(pattern).some((v) => {
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== null && String(v).trim().length > 0;
  });
}

/* =====================================================
   6. Student Model Variables (competency-model level)
   -----------------------------------------------------
   A DINA/G-DINA student model IS a vector of binary SMVs, so `binary`
   is a first-class type here alongside the traditional `continuous`
   theta scale -- not a special case bolted on later. `ordinal` and
   `categorical` are declared now (Day 16, Week 4 core schema) even
   though only continuous and binary have a near-term consumer, so the
   type enum doesn't need a breaking change when a polytomous SMV shows
   up.

   Each type only admits certain prior-distribution families -- a
   binary attribute's prior is a probability of mastery (bernoulli/beta),
   not a mean/sd -- so the family is validated against type here, the
   same one-to-many compatibility shape as INTERACTION_COMPATIBILITY
   above, not a flat shared enum.
===================================================== */

export const SM_VARIABLE_TYPES = [
  {
    value: "continuous",
    label: "Continuous",
    hint: "A latent trait on a continuous scale, e.g. IRT theta.",
  },
  {
    value: "binary",
    label: "Binary Attribute",
    hint: "Mastery / non-mastery of a single attribute, as used by DINA/G-DINA.",
  },
  {
    value: "ordinal",
    label: "Ordinal",
    hint: "An ordered set of proficiency levels.",
  },
  {
    value: "categorical",
    label: "Categorical",
    hint: "An unordered set of latent classes.",
  },
];

export const SM_VARIABLE_TYPE_VALUES = SM_VARIABLE_TYPES.map((t) => t.value);

export function smVariableTypeLabel(value) {
  return SM_VARIABLE_TYPES.find((t) => t.value === value)?.label || value || "—";
}

/* Which prior-distribution families are valid for each SMV type. */
export const SM_VARIABLE_PRIOR_FAMILIES = {
  continuous: ["normal", "uniform"],
  binary: ["bernoulli", "beta"],
  ordinal: ["dirichlet"],
  categorical: ["dirichlet"],
};

export function priorFamiliesForSmVariableType(type) {
  if (!type) return [];
  return SM_VARIABLE_PRIOR_FAMILIES[type] || [];
}

export function isPriorFamilyCompatible(type, family) {
  if (!type || !family) return false;
  return priorFamiliesForSmVariableType(type).includes(family);
}

/* Numeric shape each prior family's `params` must satisfy. Mirrors
   RESPONSE_PATTERN_FIELDS above: a descriptor table the validator and
   any future editor both read, instead of two hand-kept copies. */
export const PRIOR_DISTRIBUTION_PARAM_SPECS = {
  normal: [
    { key: "mean", label: "Mean" },
    { key: "sd", label: "Standard deviation", positive: true },
  ],
  uniform: [
    { key: "min", label: "Minimum" },
    { key: "max", label: "Maximum" },
  ],
  bernoulli: [{ key: "p", label: "Probability of mastery", min: 0, max: 1 }],
  beta: [
    { key: "alpha", label: "Alpha", positive: true },
    { key: "beta", label: "Beta", positive: true },
  ],
  dirichlet: [{ key: "alpha", label: "Concentration vector", isArray: true }],
};

/* True only when every declared param is present, numeric (or a numeric
   array for dirichlet) and satisfies its own bound. A missing or
   zero-length `params` object is not "unspecified yet" here the way an
   empty response pattern is -- unlike interaction scoring, a prior
   distribution is either fully specified or it cannot be sampled from,
   so there is no lenient/draft reading of this rule. */
export function priorDistributionParamsAreValid(family, params) {
  const spec = PRIOR_DISTRIBUTION_PARAM_SPECS[family];
  if (!spec) return false;
  if (!params || typeof params !== "object") return false;

  return spec.every((field) => {
    const v = params[field.key];
    if (field.isArray) {
      return (
        Array.isArray(v) &&
        v.length > 0 &&
        v.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)
      );
    }
    if (typeof v !== "number" || !Number.isFinite(v)) return false;
    if (field.positive && v <= 0) return false;
    if (field.min !== undefined && v < field.min) return false;
    if (field.max !== undefined && v > field.max) return false;
    if (field.key === "min" && typeof params.max === "number" && v >= params.max) {
      return false;
    }
    return true;
  });
}

/**
 * Structural completeness for one SMV prior (TR9 claim distribution).
 * Dirichlet α must match the authored state count when states are known.
 */
export function isSmVariablePriorComplete(smv) {
  if (!smv?.type) return false;
  const prior = smv.priorDistribution;
  if (!prior?.family) return false;
  if (!isPriorFamilyCompatible(smv.type, prior.family)) return false;
  if (!priorDistributionParamsAreValid(prior.family, prior.params)) return false;

  if (
    prior.family === "dirichlet" &&
    (smv.type === "ordinal" || smv.type === "categorical" || smv.type === "binary")
  ) {
    const n = Array.isArray(smv.scale?.states) ? smv.scale.states.length : 0;
    if (n < 2) return false;
    const alpha = prior.params?.alpha;
    if (!Array.isArray(alpha) || alpha.length !== n) return false;
  }
  return true;
}

/* =====================================================
   7. Declared psychological perspective (Competency Model level)
   -----------------------------------------------------
   Mislevy & Riconscente (2005) §2.1: the psychological perspective a
   Competency Model is authored against "cannot be emphasized too
   strongly", since a mismatch against the measurement model chosen
   downstream produces a substantially less informative assessment (e.g.
   a trait-perspective model scored with a diagnostic classification
   model).    Declared once on the Domain Analysis. A Student Model inherits it
   when the model cites that analysis. A perspective already stored on
   the Student Model stays until the model is rebuilt.
===================================================== */

export const PSYCHOLOGICAL_PERSPECTIVES = [
  {
    value: "trait",
    label: "Trait",
    hint: "A stable, continuous latent trait -- the classical IRT/CTT view.",
  },
  {
    value: "information_processing",
    label: "Information Processing",
    hint: "Cognitive processes and strategies, often decomposed into discrete attributes -- the usual fit for DINA/G-DINA.",
  },
  {
    value: "sociocultural",
    label: "Sociocultural",
    hint: "Competence as situated in social/cultural practice rather than a purely individual trait.",
  },
  {
    value: "developmental",
    label: "Developmental",
    hint: "Competence as a progression through ordered developmental stages.",
  },
];

export const PSYCHOLOGICAL_PERSPECTIVE_VALUES = PSYCHOLOGICAL_PERSPECTIVES.map(
  (p) => p.value
);

export function psychologicalPerspectiveLabel(value) {
  return (
    PSYCHOLOGICAL_PERSPECTIVES.find((p) => p.value === value)?.label ||
    value ||
    "—"
  );
}

/* =====================================================
   9. Cognitive-demand vocabulary: Bloom levels and reasoning types
   -----------------------------------------------------
   Day 22 (Week 5, vocabulary consolidation). Previously canonically
   defined in src/components/taskModels/taskModelConstants.js and
   re-exported from src/components/itemBank/itemConstants.js -- the same
   "one definition, re-exported for existing call sites" arrangement this
   file's header already documents for INTERACTION_TYPES/SCORING_METHODS,
   and for the same reason: an item used to carry its own 4-value
   REASONING_TYPES while the Task Model blueprint declared 7, three of
   which no item could ever record -- a permanent false positive in
   blueprint-coverage reporting. Moved here so schema.js (loaded directly
   by node, not just bundled by vite) can validate against the same
   values a `<select>` renders, instead of only checking `typeof ===
   'string'` as it did before Day 22.
===================================================== */

export const BLOOM_LEVELS = [
  { value: "remember", label: "Remember" },
  { value: "understand", label: "Understand" },
  { value: "apply", label: "Apply" },
  { value: "analyze", label: "Analyze" },
  { value: "evaluate", label: "Evaluate" },
  { value: "create", label: "Create" },
];

export const BLOOM_LEVEL_VALUES = BLOOM_LEVELS.map((b) => b.value);

export function bloomLevelLabel(value) {
  return BLOOM_LEVELS.find((b) => b.value === value)?.label || value || "—";
}

export const REASONING_TYPES = [
  { value: "recall", label: "Recall" },
  { value: "procedural", label: "Procedural" },
  { value: "algorithmic", label: "Algorithm Execution" },
  { value: "deductive", label: "Deductive Inference" },
  { value: "inductive", label: "Inductive Inference" },
  { value: "quantitative", label: "Quantitative Reasoning" },
  { value: "evaluative", label: "Evaluative Judgement" },
];

export const REASONING_TYPE_VALUES = REASONING_TYPES.map((r) => r.value);

export function reasoningTypeLabel(value) {
  return REASONING_TYPES.find((r) => r.value === value)?.label || value || "—";
}

/* =====================================================
   8. Calibration file kinds (Day 19, Week 4 core schema)
   -----------------------------------------------------
   NOT YET unified with the pre-existing, purely client-side
   `CALIBRATION_KINDS`/`KIND_MODEL_TYPES` in
   src/components/evidences/calibration/engines/calibrationFile.js (which
   also declares `irt-parameters` and a `bayesian-cpt` kind this list
   doesn't cover, and is wired into the live recalibration-import UI).
   Reconciling the two is deliberately left for later: that file backs a
   currently-shipped import flow, and this week's collections are schema-
   only, so touching it now risks the one thing this pass isn't supposed
   to risk -- a working feature. This is the authoritative declaration
   `validateEntity`'s provenance checks are written against; the UI's
   list is a separate, pre-existing concern until they're consolidated.
===================================================== */

export const CALIBRATION_FILE_KINDS = [
  { value: "ctt-statistics", label: "CTT Statistics", statisticalModelTypes: ["ctt"] },
  { value: "irt-parameters", label: "IRT Parameters", statisticalModelTypes: ["irt", "rasch"] },
  { value: "dina-parameters", label: "DINA/G-DINA Parameters", statisticalModelTypes: ["dina", "gdina"] },
];

export const CALIBRATION_FILE_KIND_VALUES = CALIBRATION_FILE_KINDS.map((k) => k.value);

export function statisticalModelTypesForCalibrationKind(kind) {
  return CALIBRATION_FILE_KINDS.find((k) => k.value === kind)?.statisticalModelTypes || [];
}

/* A supports evidence rule says that activation of the observable is
   positive evidence for the claim. The complementary value of a
   dichotomous observable (the keyed wrong answer, score 0, no strength
   of its own) is an observed 0, not evidence against the claim.
   Counter-evidence is a non-activation that still carries points or
   strength, or a non-activation on a method that is not dichotomous.
   Those still have to be written as a weakens observable. */
export function nonActivationIsCounterEvidence(rule, scoringMethod) {
  if (!rule || rule.activatesObservable !== false) return false;
  if (scoringMethod === "dichotomous") {
    const score = rule.score;
    const awardsPoints = typeof score === "number" && Number.isFinite(score) && score !== 0;
    const carriesStrength =
      typeof rule.strengthOverride === "number" && Number.isFinite(rule.strengthOverride);
    return awardsPoints || carriesStrength;
  }
  return true;
}

export const SUPPORTS_COUNTER_EVIDENCE_MESSAGE =
  "This observable's evidence rule is directional ('supports'), but the scoring map contains a rule that explicitly does not activate it and still carries a score or a strength. That reads as counter-evidence the rule does not permit. A dichotomous score of 0, with no strength override, is the observed wrong answer and is allowed.";

/* =====================================================
   8b. Calibration job kinds (D62, W13)
   -----------------------------------------------------
   The three D19 file kinds write parameterSets[]. Analysis kinds write
   the top-level analysisArtefacts collection (D76 / W16) — they inform;
   they do not authorise a lifecycle transition. Single definition:
   routes, schema, the R client / Node worker, and the readiness mirror
   all import from here. attribute-profile-summary is Node-only (D79).
===================================================== */

export const CALIBRATION_JOB_KINDS = [
  { value: "irt-parameters", label: "IRT Parameters", package: "mirt", ingests: "parameterSets", statisticalModelTypes: ["irt", "rasch"] },
  { value: "dina-parameters", label: "DINA/G-DINA Parameters", package: "GDINA", ingests: "parameterSets", statisticalModelTypes: ["dina", "gdina"] },
  { value: "ctt-statistics", label: "CTT Statistics", package: "TAM", ingests: "parameterSets", statisticalModelTypes: ["ctt"] },
  { value: "dif-analysis", label: "DIF Analysis", package: "difR", ingests: "analysisArtefact", statisticalModelTypes: ["irt", "rasch"] },
  { value: "equating", label: "Equating", package: "plink", ingests: "analysisArtefact", statisticalModelTypes: ["irt", "rasch"] },
  { value: "item-analysis", label: "Item Analysis", package: "TAM", ingests: "analysisArtefact", statisticalModelTypes: ["ctt", "irt", "rasch"] },
  { value: "test-information", label: "Test Information", package: "mirt", ingests: "analysisArtefact", statisticalModelTypes: ["irt", "rasch"] },
  {
    value: "attribute-profile-summary",
    label: "Attribute-Profile Cohort Summary",
    package: "ecd-node",
    ingests: "analysisArtefact",
    statisticalModelTypes: ["dina", "gdina"],
  },
];

export const CALIBRATION_JOB_KIND_VALUES = CALIBRATION_JOB_KINDS.map((k) => k.value);

export const ANALYSIS_ARTEFACT_KIND_VALUES = CALIBRATION_JOB_KINDS.filter(
  (k) => k.ingests === "analysisArtefact"
).map((k) => k.value);

function calibrationJobKind(kind) {
  return CALIBRATION_JOB_KINDS.find((k) => k.value === kind) || null;
}

export function statisticalModelTypesForJobKind(kind) {
  return calibrationJobKind(kind)?.statisticalModelTypes || [];
}

export function jobKindIngestsParameterSets(kind) {
  return calibrationJobKind(kind)?.ingests === "parameterSets";
}

export function jobKindIngestsAnalysisArtefact(kind) {
  return calibrationJobKind(kind)?.ingests === "analysisArtefact";
}

/* =====================================================
   10. Presentation Model vocabulary (D113 / W23 G8)
   -----------------------------------------------------
   PADI TR9 Fig. 7 "Materials & Presentation" is the CAF object for how
   a task is shown. ItemPresenter already names the three concerns this
   collection owns: ordering, conditional display, accessibility
   profile. Item-level stimulus/interaction stays on items and still
   bakes per ADR 0003; this overlay is the authored Presentation Model.
   SessionPlayer does not consume it yet (later W23 unit).
===================================================== */

export const PRESENTATION_ITEM_ORDERS = [
  {
    value: "authored",
    label: "Authored order",
    hint: "Items appear in the order the Task Model / item bank declares.",
  },
  {
    value: "random",
    label: "Randomised",
    hint: "Shuffle item order at session start. Adaptive reordering is out of this field.",
  },
];

export const PRESENTATION_GROUPINGS = [
  {
    value: "single_item",
    label: "One item at a time",
    hint: "Each item is its own screen.",
  },
  {
    value: "shared_stimulus",
    label: "Shared stimulus",
    hint: "A parent stimulus stays visible across a group of items.",
  },
  {
    value: "section",
    label: "Section",
    hint: "Items grouped into named sections the examinee pages through.",
  },
];

export const PRESENTATION_NAVIGATIONS = [
  {
    value: "linear",
    label: "Linear",
    hint: "Forward only; no return to a previous item.",
  },
  {
    value: "reviewable",
    label: "Reviewable",
    hint: "Forward with a review pass before submit.",
  },
  {
    value: "free",
    label: "Free",
    hint: "Examinee may move to any presented item.",
  },
];

export const PRESENTATION_FEEDBACK_TIMINGS = [
  {
    value: "none",
    label: "No item feedback",
    hint: "Score is accumulated; nothing is shown per item.",
  },
  {
    value: "immediate",
    label: "Immediate",
    hint: "Feedback after each response. Identification still runs server-side.",
  },
  {
    value: "delayed_end",
    label: "End of session",
    hint: "Feedback withheld until the session stops.",
  },
];

export const PRESENTATION_ACCESSIBILITY_PROFILES = [
  {
    value: "default",
    label: "Default",
    hint: "Standard delivery chrome.",
  },
  {
    value: "large_text",
    label: "Large text",
    hint: "Larger type; pairs with fontScale.",
  },
  {
    value: "high_contrast",
    label: "High contrast",
    hint: "High-contrast palette.",
  },
  {
    value: "screen_reader",
    label: "Screen reader",
    hint: "Prefer text equivalents and announced controls.",
  },
];

export const PRESENTATION_ITEM_ORDER_VALUES = PRESENTATION_ITEM_ORDERS.map((x) => x.value);
export const PRESENTATION_GROUPING_VALUES = PRESENTATION_GROUPINGS.map((x) => x.value);
export const PRESENTATION_NAVIGATION_VALUES = PRESENTATION_NAVIGATIONS.map((x) => x.value);
export const PRESENTATION_FEEDBACK_TIMING_VALUES = PRESENTATION_FEEDBACK_TIMINGS.map(
  (x) => x.value
);
export const PRESENTATION_ACCESSIBILITY_PROFILE_VALUES =
  PRESENTATION_ACCESSIBILITY_PROFILES.map((x) => x.value);

function vocabLabel(list, value) {
  return list.find((x) => x.value === value)?.label || value || "—";
}

export function presentationItemOrderLabel(value) {
  return vocabLabel(PRESENTATION_ITEM_ORDERS, value);
}
export function presentationGroupingLabel(value) {
  return vocabLabel(PRESENTATION_GROUPINGS, value);
}
export function presentationNavigationLabel(value) {
  return vocabLabel(PRESENTATION_NAVIGATIONS, value);
}
export function presentationFeedbackTimingLabel(value) {
  return vocabLabel(PRESENTATION_FEEDBACK_TIMINGS, value);
}
export function presentationAccessibilityProfileLabel(value) {
  return vocabLabel(PRESENTATION_ACCESSIBILITY_PROFILES, value);
}

/* =====================================================
   11. Task Model Variables (D116 / W24 G13)
   -----------------------------------------------------
   A Task Model Variable is a reusable design feature: one record,
   many Task Models. It is not a Student Model Variable (those stay
   on competencyModels.smVariables) and it is not a CAF model.

   Types live here. When a variable's legal levels ARE an existing
   vocabulary (Bloom, reasoning, or the task-structure design
   features below), the record names that valueSet and does not copy
   the list. schema.js and the readiness mirror both resolve levels
   through TMV_VALUE_SET_SOURCES, so a forked Bloom array cannot
   sneak in as "possible values".

   PRESENTATION_MODES / RESPONSE_FORMATS / STIMULUS_POLICIES moved
   here from taskModelConstants.js (same Day-22 move as Bloom).
   Task Models still store the chosen string on taskStructure;
   re-pointing those fields at TMV ids is a later unit (D119), alone.
===================================================== */

export const PRESENTATION_MODES = [
  { value: "interactive", label: "Interactive", hint: "Examinee works through a responsive on-screen task." },
  { value: "simulation", label: "Simulation", hint: "Task is embedded in a modelled environment or scenario." },
  { value: "performance", label: "Performance", hint: "Observed performance, rated by an assessor." },
  { value: "constructed", label: "Constructed", hint: "Static prompt eliciting an authored response." },
];

export const RESPONSE_FORMATS = [
  { value: "selected", label: "Selected Response", hint: "Examinee chooses from supplied options." },
  { value: "constructed", label: "Constructed Response", hint: "Examinee produces the response." },
  { value: "hybrid", label: "Hybrid", hint: "Both selection and production within one task." },
];

export const STIMULUS_POLICIES = [
  { value: "static", label: "Static", hint: "One fixed stimulus for every administration." },
  { value: "parameterized", label: "Parameterized", hint: "Stimulus varies over a declared parameter space." },
  { value: "generative", label: "Generative", hint: "Stimulus is generated per administration under constraints." },
];

export const PRESENTATION_MODE_VALUES = PRESENTATION_MODES.map((m) => m.value);
export const RESPONSE_FORMAT_VALUES = RESPONSE_FORMATS.map((m) => m.value);
export const STIMULUS_POLICY_VALUES = STIMULUS_POLICIES.map((m) => m.value);

export const TMV_TYPES = [
  {
    value: "categorical",
    label: "Categorical",
    hint: "Unordered design feature. Possible values are the legal levels.",
  },
  {
    value: "ordinal",
    label: "Ordinal",
    hint: "Ordered design feature. Possible values are ranked levels.",
  },
  {
    value: "numeric",
    label: "Numeric",
    hint: "A number inside a declared range.",
  },
  {
    value: "boolean",
    label: "Boolean",
    hint: "Present or absent. Levels are true and false.",
  },
];

export const TMV_TYPE_VALUES = TMV_TYPES.map((t) => t.value);

export function tmvTypeLabel(value) {
  return TMV_TYPES.find((t) => t.value === value)?.label || value || "—";
}

/* Keys whose levels are an existing vocabulary array, not an author list. */
export const TMV_VALUE_SET_SOURCES = Object.freeze({
  bloomLevel: BLOOM_LEVELS,
  reasoningType: REASONING_TYPES,
  presentationMode: PRESENTATION_MODES,
  responseFormat: RESPONSE_FORMATS,
  stimulusPolicy: STIMULUS_POLICIES,
});

export const TMV_VALUE_SET_KEYS = Object.freeze(Object.keys(TMV_VALUE_SET_SOURCES));

export function taskModelVariableValueIds(variable) {
  if (!variable || typeof variable !== "object") return [];
  const source = variable.valueSet ? TMV_VALUE_SET_SOURCES[variable.valueSet] : null;
  if (source) return source.map((entry) => entry.value);
  if (variable.type === "boolean") return ["true", "false"];
  if (!Array.isArray(variable.possibleValues)) return [];
  return variable.possibleValues
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry.value === "string") return entry.value;
      return "";
    })
    .filter((value) => value !== "");
}
