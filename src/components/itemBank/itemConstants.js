// src/components/itemBank/itemConstants.js
// ------------------------------------------------------------
// Item Bank domain constants and the SINGLE readiness function.
//
// The item analogue of src/components/taskModels/taskModelConstants.js,
// and written for the same reason: before this file there were four
// divergent opinions about whether an item was complete --
// itemValidationHelpers.validateItem(), Step7_TaskAlignment's own
// `diagnostics`, Step9_Review's `hasErrors`, and Step10_Confirm's
// simulation gate -- and they disagreed with each other AND with
// src/utils/schema.js. Everything that answers "is this item ready?"
// now answers from itemReadiness() below.
//
// THREE MIRRORS THAT MUST BE KEPT IN STEP WITH THEIR SOURCES
//
//   1. itemCompatibilityNotes()  <->  the `items` block of
//      src/utils/schema.js. Same rules, evaluated live and
//      non-blocking so the author sees a confirmation failure coming
//      instead of hitting it. A rule added to schema.js and not to
//      this mirror becomes a confirmation failure with no warning.
//   2. ITEM_WIZARD_STEPS[].key  <->  STEP_COMPONENTS in
//      ItemWizard/WizardStepContainer.jsx. A key with no case renders
//      a blank step.
//   3. operationalReadiness()    <->  validateItemLifecycle()'s
//      `operational` block in server/utils/lifecycleValidation.js.
//
// The interaction/observable/scoring vocabularies deliberately are NOT
// mirrored -- they come from src/utils/ecdVocabulary.js, which both the
// client and the server import. See that file's header for why.
// ------------------------------------------------------------

import {
  INTERACTION_TYPES,
  SCORING_METHODS,
  deriveAllowedScoringMethods,
  interactionTypesForObservable,
  isInteractionCompatible,
  interactionCompatibilityMessage,
  interactionLabel,
  scoringLabel,
  responsePatternFields,
  responsePatternIsSpecified,
} from "@/utils/ecdVocabulary";

// D53b: the readiness checklist below must AGREE with schema.js's strict
// validator (the artefact-6 requirement every new surface is held to) --
// so this imports the same usability predicate schema.js and
// sessionRoutes.js use, rather than re-deriving a range check that could
// silently drift from theirs.
import { dinaParametersAreUsable } from "../../../server/delivery/attributeAccumulation.js";
import { intendedDifficultyPlacement } from "@/utils/intendedDifficulty";

export {
  INTERACTION_TYPES,
  SCORING_METHODS,
  deriveAllowedScoringMethods,
  interactionTypesForObservable,
  isInteractionCompatible,
  interactionCompatibilityMessage,
  interactionLabel,
  scoringLabel,
  responsePatternFields,
  responsePatternIsSpecified,
};

/* =====================================================
   Enumerations authored on the item itself
===================================================== */

export const LEARNING_DOMAINS = [
  { value: "cognitive", label: "Cognitive" },
  { value: "affective", label: "Affective" },
  { value: "psychomotor", label: "Psychomotor" },
];

/* Bloom levels, like reasoning types below, come from the module the
   Task Model blueprint step already reads. They happened to agree
   value-for-value here, which is exactly how a duplicated enum stays
   invisible until the day one side gains a value -- as REASONING_TYPES
   already had. */
export { BLOOM_LEVELS } from "../taskModels/taskModelConstants.js";

// The schema field is `cognitiveDemand.soloLevel`. Step6_Metadata used to
// write `depthOfKnowledge`, which is in no schema and which nothing reads
// -- so the DOK chart on the admin dashboard counted a field the wizard
// wrote and the store never declared, while `soloLevel` had no authoring
// path at all. SOLO is what the schema declares, so SOLO is what is
// authored; the dashboard chart reads the same field.
export const SOLO_LEVELS = [
  { value: "prestructural", label: "Prestructural" },
  { value: "unistructural", label: "Unistructural" },
  { value: "multistructural", label: "Multistructural" },
  { value: "relational", label: "Relational" },
  { value: "extended_abstract", label: "Extended Abstract" },
];

/* Reasoning types are NOT declared here.

   This module used to carry its own four-value list -- conceptual,
   procedural, strategic, metacognitive -- while Task Model blueprints
   declare from a six-value list in taskModelConstants that includes
   `deductive`, `algorithmic`, `inductive`, `quantitative` and
   `evaluative`. Three of the blueprint's values could not be recorded on
   an item at all, so blueprint-coverage reporting showed a departure for
   every item authored against a blueprint that used one of them -- a
   permanent false positive with no way to clear it.

   One list, from the module that the blueprint step already reads. */
// Explicit .js: only vite resolves an extensionless relative specifier,
// and this module is also loaded directly by node in verification runs.
// Same reason taskModelConstants.js imports ecdVocabulary.js by full path.
export { REASONING_TYPES } from "../taskModels/taskModelConstants.js";

export const DIFFICULTY_BANDS = [
  { value: "very_easy", label: "Very easy" },
  { value: "easy", label: "Easy" },
  { value: "moderate", label: "Moderate" },
  { value: "hard", label: "Hard" },
  { value: "very_hard", label: "Very hard" },
];

export const ITEM_SOURCES = [
  { value: "authored", label: "Authored in platform" },
  { value: "adapted", label: "Adapted from existing item" },
  { value: "licensed", label: "Licensed / third party" },
  { value: "generated", label: "Automatically generated" },
];

export const STIMULUS_LAYOUTS = [
  { value: "single", label: "Single block" },
  { value: "composite", label: "Composite" },
  { value: "passage_based", label: "Passage based" },
];

export const CALIBRATION_STATUSES = [
  { value: "uncalibrated", label: "Uncalibrated" },
  { value: "pilot", label: "Pilot" },
  { value: "calibrated", label: "Calibrated" },
];

export function labelFor(options, value, fallback = "—") {
  if (value === undefined || value === null || value === "") return fallback;
  return options.find((o) => o.value === value)?.label ?? String(value);
}

/* =====================================================
   Statuses
===================================================== */

// An item that a Task Model may count as instantiating it, and that a
// session may deliver. Mirrors USABLE_ITEM_STATUSES in taskModelConstants.
export const USABLE_ITEM_STATUSES = ["confirmed", "operational", "suspended"];

// Statuses in which the record is structurally frozen.
export const LOCKED_ITEM_STATUSES = [
  "confirmed",
  "operational",
  "suspended",
  "archived",
];

/* =====================================================
   Draft normalisation
   -----------------------------------------------------
   buildInitialItemDraft() is the ONLY place a stored record becomes
   wizard state. The previous createDefaultItem() dropped
   `equivalenceGroupId`, `metadata`, `cognitiveDemand` and
   `parentItemId` on reload, and -- because the dirty check compared a
   raw record against a normalised draft -- every item opened dirty and
   the wizard auto-saved on the first Next even when nothing was touched.
===================================================== */

export function buildInitialItemDraft(record = null) {
  const r = record || {};

  return {
    ...(r.id ? { id: r.id } : {}),

    /* Structural binding. taskModelId + taskModelVersion is the item's
       single governing link. observationId points INTO that task model's
       expectedObservations. evidenceModelId / evidenceModelVersion are
       DERIVED -- kept on the record so downstream readers (SessionPlayer,
       reports) do not have to re-walk the chain, but never authored and
       never trusted from a payload: the server recomputes them on every
       write. See deriveEvidenceBinding() below. */
    taskModelId: r.taskModelId ?? null,
    taskModelVersion: r.taskModelVersion ?? null,
    observationId: r.observationId ?? null,
    evidenceModelId: r.evidenceModelId ?? null,
    evidenceModelVersion: r.evidenceModelVersion ?? null,

    stimulus: {
      layout: r.stimulus?.layout || "single",
      blocks: Array.isArray(r.stimulus?.blocks) ? r.stimulus.blocks : [],
    },

    interaction: {
      type: r.interaction?.type || "",
      responseComponents: Array.isArray(r.interaction?.responseComponents)
        ? r.interaction.responseComponents
        : [],
      config: r.interaction?.config || {},
    },

    scoring: {
      method: r.scoring?.method || "",
      maxScore:
        typeof r.scoring?.maxScore === "number" ? r.scoring.maxScore : 1,
      evidenceActivationMap: normalizeActivationMap(
        r.scoring?.evidenceActivationMap
      ),
    },

    learningDomain: r.learningDomain || "cognitive",
    cognitiveDemand: r.cognitiveDemand || {},
    metadata: r.metadata || {},

    psychometrics: {
      statisticalModelType: r.psychometrics?.statisticalModelType || "",
      calibrationStatus: r.psychometrics?.calibrationStatus || "uncalibrated",
      irtParams: r.psychometrics?.irtParams || {},
    },

    equivalenceGroupId: r.equivalenceGroupId || "",

    exposureControl: {
      usageCount: r.exposureControl?.usageCount ?? 0,
      maxUsageBeforeRetire: r.exposureControl?.maxUsageBeforeRetire ?? 0,
      reactivationCount: r.exposureControl?.reactivationCount ?? 0,
      maxReactivations: r.exposureControl?.maxReactivations ?? 0,
    },

    status: r.status || "draft",
    locked: r.locked === true,
    versionNumber: r.versionNumber ?? 1,
    parentItemId: r.parentItemId ?? null,

    ...(r.creator ? { creator: r.creator } : {}),
    ...(r.modifier ? { modifier: r.modifier } : {}),
    ...(r.createdAt ? { createdAt: r.createdAt } : {}),
    ...(r.updatedAt ? { updatedAt: r.updatedAt } : {}),
  };
}

/* =====================================================
   Evidence activation map
   -----------------------------------------------------
   The stored shape, declared by schema.js, is
     { responsePattern, activatesObservable, strengthOverride, rationale }
   EvidenceActivationEditor used to write
     { id, condition, score, activateObservable, strengthOverride }
   -- three of five keys wrong, including the two the validator requires.
   `rationale` had no field in the UI at all. The result was that any item
   with an activation rule failed schema validation on save, and any item
   without one failed "Explicit evidenceActivationMap is required" -- so
   no item could be persisted past the scoring step in either direction.

   `id` and `score` are kept: `id` is a client key for stable list
   rendering and `score` is the raw points the pattern awards, which
   maxScore is checked against. Both are additive; neither collides with
   a schema field.
===================================================== */

export function newActivationRule(seed = {}) {
  return {
    id:
      seed.id ||
      `ea_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    responsePattern: seed.responsePattern || {},
    score: typeof seed.score === "number" ? seed.score : 0,
    activatesObservable: seed.activatesObservable === true,
    strengthOverride:
      typeof seed.strengthOverride === "number" ? seed.strengthOverride : null,
    rationale: seed.rationale || "",
  };
}

export function normalizeActivationMap(map) {
  if (!Array.isArray(map)) return [];

  return map.map((raw, index) =>
    newActivationRule({
      id: raw?.id || `ea_legacy_${index}`,
      // Records authored before the key names were fixed carry
      // `condition` / `activateObservable`. Read both so an existing
      // draft is upgraded on open rather than silently emptied.
      responsePattern: raw?.responsePattern ?? raw?.condition ?? {},
      score: raw?.score,
      activatesObservable:
        raw?.activatesObservable ?? raw?.activateObservable ?? false,
      strengthOverride: raw?.strengthOverride,
      rationale: raw?.rationale,
    })
  );
}

/* Per-rule problems, in the order an author would fix them. Returned as
   plain strings so the editor can render them under the offending row. */
export function activationRuleIssues(rule, method) {
  const issues = [];

  if (!responsePatternIsSpecified(method, rule?.responsePattern)) {
    const fields = responsePatternFields(method);
    issues.push(
      fields.length
        ? `Define the response pattern (${fields
            .map((f) => f.label.toLowerCase())
            .join(", ")}). An empty pattern matches nothing.`
        : "Define the response pattern."
    );
  }

  if (typeof rule?.activatesObservable !== "boolean") {
    issues.push("State whether this pattern activates the observable.");
  }

  if (!String(rule?.rationale ?? "").trim()) {
    issues.push(
      "Give a rationale. It is what a reviewer reads to judge whether this pattern really is evidence of the observable."
    );
  }

  if (
    rule?.strengthOverride !== null &&
    rule?.strengthOverride !== undefined &&
    (rule.strengthOverride < 1 || rule.strengthOverride > 5)
  ) {
    issues.push("Strength override must be between 1 and 5.");
  }

  return issues;
}

export function activationMapIssues(scoring = {}) {
  const map = scoring.evidenceActivationMap || [];
  const issues = [];

  if (map.length === 0) {
    issues.push(
      "At least one activation rule is required. Without one, nothing a student does can ever count as evidence of the observable."
    );
    return issues;
  }

  if (!map.some((r) => r.activatesObservable === true)) {
    issues.push(
      "No rule activates the observable. At least one response pattern must count as evidence, or the item can never contribute to the inference."
    );
  }

  map.forEach((rule, i) => {
    if (
      rule?.activatesObservable === true &&
      !(typeof rule.score === "number" && rule.score > 0)
    ) {
      issues.push(
        `Rule ${i + 1}: activates the observable but awards no score. An activating rule must award a score greater than 0.`
      );
    }
  });

  map.forEach((rule, i) => {
    activationRuleIssues(rule, scoring.method).forEach((issue) =>
      issues.push(`Rule ${i + 1}: ${issue}`)
    );
  });

  const maxRuleScore = map.reduce(
    (acc, r) => Math.max(acc, typeof r.score === "number" ? r.score : 0),
    0
  );

  if (
    typeof scoring.maxScore === "number" &&
    maxRuleScore > scoring.maxScore
  ) {
    issues.push(
      `A rule awards ${maxRuleScore} but maxScore is ${scoring.maxScore}. Raise maxScore or lower the rule.`
    );
  }

  return issues;
}

/* =====================================================
   Derivation from the bound Task Model
   -----------------------------------------------------
   The item stores five structural pointers, but only two of them are
   authored. Everything else is a function of the Task Model, and this is
   where that function lives -- one implementation, used by the wizard,
   the list, the dashboard and (through the server's own copy of the same
   walk) the routes.
===================================================== */

/* The evidence binding a given (taskModel, observationId) pair implies.
   Returns nulls rather than throwing so a half-built draft can call it. */
export function deriveEvidenceBinding(taskModel, observationId, evidenceModels = []) {
  const declared = (taskModel?.expectedObservations || []).find(
    (eo) => eo.observationId === observationId
  );

  if (!declared) {
    return {
      declaredObservation: null,
      evidenceModelId: null,
      evidenceModelVersion: null,
    };
  }

  const em = evidenceModels.find((e) => e.id === declared.evidenceModelId);

  return {
    declaredObservation: declared,
    evidenceModelId: declared.evidenceModelId ?? null,
    evidenceModelVersion: em?.versionNumber ?? null,
  };
}

/* Everything a step needs to know about the chain behind the item, in one
   object. `evidenceModel` is passed in rather than looked up because the
   wizard already holds it in the react-query cache. */
export function deriveItemContext(item = {}, { taskModel = null, evidenceModel = null } = {}) {
  const declaredObservation =
    (taskModel?.expectedObservations || []).find(
      (eo) => eo.observationId === item.observationId
    ) || null;

  const observable =
    (evidenceModel?.observables || []).find((o) => o.id === item.observationId) ||
    null;

  const warrant =
    (evidenceModel?.warrants || []).find((w) => w.id === observable?.warrantId) ||
    null;

  const activeStatisticalModel =
    (evidenceModel?.statisticalModels || []).find((m) => m.active === true) ||
    null;

  const blueprint = taskModel?.blueprintConstraints || {};

  // The blueprint whitelist NARROWS what the observable already permits;
  // it never widens it. An empty or absent whitelist means "the task model
  // does not constrain this", not "nothing is allowed" -- the old schema
  // check tested `blueprint.allowedInteractionTypes &&` and so treated an
  // empty array as no constraint, while the UI treated it as a hard block.
  const observableInteractions = interactionTypesForObservable(observable?.type);

  const blueprintInteractions = Array.isArray(blueprint.allowedInteractionTypes)
    ? blueprint.allowedInteractionTypes
    : null;

  const allowedInteractionTypes = blueprintInteractions?.length
    ? observableInteractions.filter((t) => blueprintInteractions.includes(t))
    : observableInteractions;

  const modelScoringMethods = deriveAllowedScoringMethods(activeStatisticalModel);

  const blueprintScoring = Array.isArray(blueprint.allowedScoringMethods)
    ? blueprint.allowedScoringMethods
    : null;

  const allowedScoringMethods = blueprintScoring?.length
    ? modelScoringMethods.filter((m) => blueprintScoring.includes(m))
    : modelScoringMethods;

  return {
    taskModel,
    evidenceModel,
    declaredObservation,
    observable,
    warrant,
    activeStatisticalModel,
    blueprint,
    observableInteractions,
    allowedInteractionTypes,
    allowedScoringMethods,
    // The construct this item ultimately measures. Derived, never stored:
    // an item that carried its own competencyId would be a second,
    // unvalidated declaration of the construct, free to contradict the
    // Evidence Model that actually governs the inference -- the same
    // mistake the Task Model rework removed from taskPurpose.
    competencyId: evidenceModel?.competencyId ?? null,
    // Blueprint whitelists are NARROWING and can narrow to nothing. Say so
    // rather than rendering an empty picker.
    interactionBlockedByBlueprint:
      !!blueprintInteractions?.length &&
      observableInteractions.length > 0 &&
      allowedInteractionTypes.length === 0,
    scoringBlockedByBlueprint:
      !!blueprintScoring?.length &&
      modelScoringMethods.length > 0 &&
      allowedScoringMethods.length === 0,
  };
}

/* =====================================================
   READINESS -- the one definition
   -----------------------------------------------------
   Returns an ordered checklist. `ok` on every entry means the item can be
   confirmed. Each entry names the wizard step that fixes it, so a
   disabled Next / Confirm can say WHERE to go, not just that something is
   wrong.
===================================================== */

export function itemReadiness(item = {}, ctx = {}) {
  const {
    declaredObservation,
    observable,
    activeStatisticalModel,
    allowedInteractionTypes = [],
    allowedScoringMethods = [],
    blueprint = {},
  } = ctx;

  const scoring = item.scoring || {};
  const interaction = item.interaction || {};
  const stimulusBlocks = item.stimulus?.blocks || [];

  const checks = [];

  const push = (id, step, label, ok, detail = null) =>
    checks.push({ id, step, label, ok: !!ok, detail });

  /* --- 1. Instantiation --- */
  push(
    "taskModel",
    "instantiation",
    "Bound to a Task Model",
    !!item.taskModelId && !!item.taskModelVersion,
    "An item exists only as an instantiation of a Task Model."
  );

  push(
    "observation",
    "instantiation",
    "Elicits a declared observation",
    !!item.observationId && !!declaredObservation,
    declaredObservation
      ? null
      : "Pick one of the observations the bound Task Model declares in expectedObservations."
  );

  /* --- 2. Evidence chain --- */
  push(
    "observable",
    "instantiation",
    "Observation resolves to an observable",
    !!observable,
    observable
      ? null
      : "The Task Model declares this observation, but the Evidence Model behind it has no observable with that id. The chain is broken upstream — fix it in the Evidence Model."
  );

  /* Can any interaction at all elicit this observation, once the
     observable's response mode AND the Task Model blueprint are both
     applied?

     Without this check the wizard let an author bind an observation,
     invest five steps of stimulus and metadata work, and only discover at
     the interaction step that the combination is undeliverable -- an empty
     dropdown and a disabled Next, with the only remedy being to go back to
     step 1 and throw the work away. The contradiction is knowable the
     moment the observation is chosen, so it is reported there. */
  push(
    "deliverable",
    "instantiation",
    "Observation can be delivered as an item",
    !observable || allowedInteractionTypes.length > 0,
    observable && allowedInteractionTypes.length === 0
      ? ctx.observableInteractions?.length === 0
        ? interactionCompatibilityMessage(observable.type, null)
        : `The Task Model's blueprint permits no interaction that can elicit a '${observable.type}' observation. The blueprint and this observation contradict each other — one of them has to change on the Task Model before any item can instantiate it.`
      : null
  );

  push(
    "statisticalModel",
    "blueprint",
    "Evidence Model has an active statistical model",
    !!activeStatisticalModel,
    activeStatisticalModel
      ? null
      : "Scoring is derived from the active statistical model. Activate one on the Evidence Model."
  );

  /* --- 3. Stimulus --- */
  push(
    "stimulus",
    "stimulus",
    "Stimulus has at least one block",
    stimulusBlocks.length > 0,
    "A confirmed item must present something to the examinee."
  );

  /* --- 4. Interaction --- */
  push(
    "interactionType",
    "interaction",
    "Interaction type declared",
    !!interaction.type,
    null
  );

  push(
    "interactionCompatible",
    "interaction",
    "Interaction can elicit the observable",
    !!interaction.type &&
      !!observable &&
      allowedInteractionTypes.includes(interaction.type),
    interaction.type && observable
      ? allowedInteractionTypes.includes(interaction.type)
        ? null
        : interactionCompatibilityMessage(observable.type, interaction.type)
      : null
  );

  push(
    "responseComponents",
    "interaction",
    "Response capture configured",
    (interaction.responseComponents || []).length > 0,
    "The interaction editor has to produce at least one response component, or there is nothing to score."
  );

  if (interaction.type === "mcq" || interaction.type === "multiselect") {
    const options = interaction.responseComponents || [];
    const blank = options.some((opt) => !String(opt?.label ?? "").trim());
    const marked = options.some((opt) => opt?.isCorrect === true);
    push(
      "choiceOptions",
      "interaction",
      interaction.type === "mcq"
        ? "One option is marked correct, and none are blank"
        : "At least one option is marked correct, and none are blank",
      options.length > 0 && !blank && marked,
      blank
        ? "Every option needs a label. A blank option is what the examinee would see."
        : interaction.type === "mcq"
          ? "A multiple-choice item must mark one option correct."
          : "A multi-select item must mark at least one option correct."
    );
  }

  /* --- 5. Scoring --- */
  push(
    "scoringMethod",
    "scoring",
    "Scoring method declared",
    !!scoring.method && allowedScoringMethods.includes(scoring.method),
    scoring.method && !allowedScoringMethods.includes(scoring.method)
      ? `'${scoringLabel(scoring.method)}' is not permitted by the active statistical model${
          allowedScoringMethods.length
            ? ` — allowed: ${allowedScoringMethods.map(scoringLabel).join(", ")}`
            : ""
        }.`
      : null
  );

  const mapIssues = activationMapIssues(scoring);

  push(
    "activationMap",
    "scoring",
    "Evidence activation map complete",
    mapIssues.length === 0,
    mapIssues.length ? mapIssues.join(" ") : null
  );

  push(
    "maxScore",
    "scoring",
    "Max score is a positive number",
    typeof scoring.maxScore === "number" &&
      Number.isFinite(scoring.maxScore) &&
      scoring.maxScore > 0,
    null
  );

  /* --- 6. Psychometrics --- */
  const declaredType = item.psychometrics?.statisticalModelType;

  push(
    "statisticalModelType",
    "operations",
    "Declared statistical model matches the Evidence Model",
    !!activeStatisticalModel &&
      declaredType === activeStatisticalModel.type,
    activeStatisticalModel && declaredType !== activeStatisticalModel.type
      ? `The Evidence Model runs on '${activeStatisticalModel.type}'. This item declares '${
          declaredType || "nothing"
        }'.`
      : null
  );

  const needsIrt = activeStatisticalModel?.type === "irt";
  const irt = item.psychometrics?.irtParams || {};

  push(
    "irtParams",
    "operations",
    needsIrt
      ? "IRT parameters supplied"
      : "IRT parameters not required",
    needsIrt
      ? typeof irt.a === "number" && typeof irt.b === "number"
      : true,
    needsIrt
      ? "An IRT-scored item must carry at least discrimination (a) and difficulty (b) before it can be confirmed. Pilot values are fine; calibration replaces them."
      : null
  );

  // D53b: the DINA analogue of the IRT readiness row above. Uses
  // dinaParametersAreUsable() rather than a bare typeof check, matching
  // schema.js's strict gate exactly -- a slip/guess pair that is present
  // but out of range (or violates monotonicity) must show NOT READY here
  // exactly when schema.js would refuse to confirm it.
  const needsDina = activeStatisticalModel?.type === "dina";
  const dina = item.psychometrics?.dinaParams || {};

  const difficultyPlacement = intendedDifficultyPlacement(
    item.metadata?.difficulty,
    blueprint.difficultyRange
  );
  push(
    "intendedDifficulty",
    "metadata",
    difficultyPlacement.applicable
      ? "Intended difficulty sits inside the task range"
      : "Intended difficulty follows the task range",
    difficultyPlacement.ok,
    difficultyPlacement.message
  );

  push(
    "dinaParams",
    "operations",
    needsDina
      ? "DINA pilot parameters supplied"
      : "DINA pilot parameters not required",
    needsDina ? dinaParametersAreUsable(dina) : true,
    needsDina
      ? "A DINA-scored item must carry usable pilot slip/guess parameters (slip and guess each in [0,1), with guess < 1 - slip) before it can be confirmed. Pilot values are fine; calibration replaces them."
      : null
  );

  return checks;
}

export function itemIsReady(item, ctx) {
  return itemReadiness(item, ctx).every((c) => c.ok);
}

export function failingChecks(item, ctx) {
  return itemReadiness(item, ctx).filter((c) => !c.ok);
}

/* =====================================================
   OPERATIONAL READINESS
   -----------------------------------------------------
   Separate from confirmation readiness, and deliberately so: these are
   deployment facts, not structural ones. Mirrors the `operational` block
   of validateItemLifecycle().
===================================================== */

export function operationalReadiness(item = {}, ctx = {}) {
  const checks = [];
  const push = (id, label, ok, detail = null) =>
    checks.push({ id, label, ok: !!ok, detail });

  push(
    "equivalenceGroup",
    "Equivalence group declared",
    !!String(item.equivalenceGroupId || "").trim(),
    "Operational items need an equivalence group so a replacement of equal difficulty can be swapped in when this one is retired or over-exposed."
  );

  push(
    "exposureCeiling",
    "Exposure ceiling declared",
    (item.exposureControl?.maxUsageBeforeRetire || 0) > 0,
    "Without a ceiling the item is delivered indefinitely and never retires."
  );

  const em = ctx.evidenceModel;

  push(
    "evidenceLive",
    "Evidence Model is operational",
    em?.status === "operational",
    em
      ? `Responses to this item are scored by '${
          em.name || em.id
        }', which is ${em.status}. Activate it first, or the item collects responses nothing can score.`
      : "No Evidence Model resolved."
  );

  return checks;
}

/* =====================================================
   COMPATIBILITY NOTES (live, non-blocking)
   -----------------------------------------------------
   MIRROR of the strict rules in src/utils/schema.js's `items` block.
   Those rules run at the promotion gate, where a coherence judgement
   about a finished design belongs -- but deferring them alone would just
   move the surprise to the last step. These are the same rules,
   evaluated live and marked `blocking` (will fail confirmation) or
   `pending` (incomplete but still being authored).

   A RULE ADDED TO schema.js AND NOT TO THIS MIRROR BECOMES A
   CONFIRMATION FAILURE THE AUTHOR HAD NO WARNING OF.
===================================================== */

export function itemCompatibilityNotes(item = {}, ctx = {}) {
  const notes = [];
  const {
    observable,
    activeStatisticalModel,
    allowedInteractionTypes = [],
    allowedScoringMethods = [],
    blueprint = {},
    interactionBlockedByBlueprint,
    scoringBlockedByBlueprint,
  } = ctx;

  const push = (severity, message) => notes.push({ severity, message });

  /* interaction.type must be able to elicit observable.type */
  if (observable && item.interaction?.type) {
    if (!allowedInteractionTypes.includes(item.interaction.type)) {
      push(
        "blocking",
        interactionCompatibilityMessage(observable.type, item.interaction.type)
      );
    }
  } else if (observable && !item.interaction?.type) {
    push("pending", interactionCompatibilityMessage(observable.type, null));
  }

  if (interactionBlockedByBlueprint) {
    push(
      "blocking",
      `The Task Model blueprint permits ${(blueprint.allowedInteractionTypes || [])
        .map(interactionLabel)
        .join(", ")}, none of which can elicit a '${
        observable?.type
      }' observable. The blueprint and the observation disagree — one of them has to change on the Task Model.`
    );
  }

  /* scoring.method must be derivable from the active statistical model */
  if (activeStatisticalModel && item.scoring?.method) {
    if (!allowedScoringMethods.includes(item.scoring.method)) {
      push(
        "blocking",
        `'${scoringLabel(item.scoring.method)}' is not a scoring method for a '${
          activeStatisticalModel.type
        }' model.`
      );
    }
  }

  if (scoringBlockedByBlueprint) {
    push(
      "blocking",
      `The Task Model blueprint permits ${(blueprint.allowedScoringMethods || [])
        .map(scoringLabel)
        .join(", ")}, none of which a '${
        activeStatisticalModel?.type
      }' model supports.`
    );
  }

  /* An observable whose evidence rule only ever SUPPORTS the claim cannot
     have a rule that counts a response as counter-evidence. */
  if (observable?.evidenceRule?.direction === "supports") {
    const negative = (item.scoring?.evidenceActivationMap || []).some(
      (r) => r.activatesObservable === false
    );
    if (negative) {
      push(
        "blocking",
        "This observable's evidence rule is directional ('supports'), but the scoring map contains a rule that explicitly does not activate it. A non-activating rule reads as counter-evidence, which the rule does not permit. Remove it or change the direction on the Evidence Model."
      );
    }
  }

  /* IRT parameters on a non-IRT model are rejected outright by schema.js. */
  const irt = item.psychometrics?.irtParams || {};
  const hasIrt = typeof irt.a === "number" || typeof irt.b === "number";

  if (hasIrt && activeStatisticalModel && activeStatisticalModel.type !== "irt") {
    push(
      "blocking",
      `IRT parameters are present but the Evidence Model runs on '${activeStatisticalModel.type}'. Clear them.`
    );
  }

  /* DINA pilot parameters on a non-DINA model are rejected outright by
     schema.js -- the D53b analogue of the IRT check above. */
  const dinaBlocking = item.psychometrics?.dinaParams || {};
  const hasDina = typeof dinaBlocking.slip === "number" || typeof dinaBlocking.guess === "number";

  if (hasDina && activeStatisticalModel && activeStatisticalModel.type !== "dina") {
    push(
      "blocking",
      `DINA pilot parameters are present but the Evidence Model runs on '${activeStatisticalModel.type}'. Clear them.`
    );
  }

  if (
    activeStatisticalModel &&
    item.psychometrics?.statisticalModelType &&
    item.psychometrics.statisticalModelType !== activeStatisticalModel.type
  ) {
    push(
      "blocking",
      `Declared statistical model '${item.psychometrics.statisticalModelType}' disagrees with the Evidence Model's active model '${activeStatisticalModel.type}'.`
    );
  }

  const difficultyPlacement = intendedDifficultyPlacement(
    item.metadata?.difficulty,
    blueprint.difficultyRange
  );
  if (difficultyPlacement.applicable && !difficultyPlacement.ok) {
    push("blocking", difficultyPlacement.message);
  }

  return notes;
}

export function blockingNotes(item, ctx) {
  return itemCompatibilityNotes(item, ctx).filter((n) => n.severity === "blocking");
}

/* =====================================================
   WIZARD STEPS
   -----------------------------------------------------
   MIRROR: every `key` here needs a case in ItemWizard/WizardStepContainer.jsx.

   Ten steps became eight. Removed: the standalone "Task Alignment" step
   (step 7), which recomputed a subset of the readiness checks and
   reported them a second time; and the split of Review / Confirm across
   steps 9 and 10, which offered two different confirmation gates -- step
   9 confirmed with no simulation and no acknowledgement, step 10 required
   both, and the nav bar offered a third path that required neither. Three
   gates on one transition is three chances to disagree.
===================================================== */

export const ITEM_WIZARD_STEPS = [
  {
    key: "instantiation",
    label: "Instantiation",
    blurb: "Which Task Model this item instantiates, and which declared observation it elicits.",
  },
  {
    key: "blueprint",
    label: "Blueprint & Alignment",
    blurb: "The interpretive chain behind the observation, and the contract the Task Model's blueprint imposes.",
  },
  {
    key: "stimulus",
    label: "Stimulus",
    blurb: "What the examinee is presented with.",
  },
  {
    key: "interaction",
    label: "Interaction",
    blurb: "How the response is captured.",
  },
  {
    key: "scoring",
    label: "Scoring & Activation",
    blurb: "Which response patterns count as evidence of the observable.",
  },
  {
    key: "metadata",
    label: "Domain & Metadata",
    blurb: "Cognitive demand, curricular placement and provenance.",
  },
  {
    key: "operations",
    label: "Psychometrics & Exposure",
    blurb: "Calibration, equivalence group and exposure ceiling.",
  },
  {
    key: "review",
    label: "Review & Confirm",
    blurb: "Readiness, coherence and the single confirmation gate.",
  },
];

export const ITEM_WIZARD_STEP_KEYS = ITEM_WIZARD_STEPS.map((s) => s.key);

/* Per-step gating.
   -----------------------------------------------------
   The previous wizard gated Next on the WHOLE item validating -- and
   since validateItem() was called with no context it always reported
   "Observable not found" and "Active statistical model not found", Next
   was disabled on every step of every item, forever. Even had it worked,
   a global gate is the wrong shape: it blocks step 1 on an error whose
   only fix lives on step 5, which is unreachable from step 1.

   So: a step blocks only on the checks IT owns, and only on the ones
   that are genuinely prerequisites for the steps after it. Everything
   else is advisory and surfaces on Review. */

const STEP_BLOCKING_CHECKS = {
  // Nothing downstream means anything without the binding -- and
  // `deliverable` belongs here rather than on the interaction step
  // because it is knowable at binding time and unfixable anywhere else.
  instantiation: ["taskModel", "observation", "observable", "deliverable"],
  // Read-only orientation; the statistical model gate belongs to scoring,
  // not here -- blocking here would strand the author on a step with no
  // control that could fix it.
  blueprint: [],
  stimulus: [],
  // The scoring step derives its whole vocabulary from the interaction,
  // so an incompatible interaction has to be resolved before it.
  interaction: ["interactionCompatible"],
  scoring: [],
  metadata: [],
  operations: [],
  review: [],
};

export function stepBlockingChecks(stepKey, item, ctx) {
  const owned = STEP_BLOCKING_CHECKS[stepKey] || [];
  if (owned.length === 0) return [];

  return itemReadiness(item, ctx).filter(
    (c) => owned.includes(c.id) && !c.ok
  );
}

export function stepIsPassable(stepKey, item, ctx) {
  return stepBlockingChecks(stepKey, item, ctx).length === 0;
}

/* =====================================================
   Display helpers
===================================================== */

/* Task Model version, item version and evidence version are all plain
   integers; render them one way everywhere. */
export function versionLabel(n) {
  return typeof n === "number" ? `v${n}` : "v—";
}

export function exposureRatio(item = {}) {
  const used = item.exposureControl?.usageCount || 0;
  const ceiling = item.exposureControl?.maxUsageBeforeRetire || 0;
  if (!ceiling) return null;
  return used / ceiling;
}

export function exposureBand(item = {}) {
  const ratio = exposureRatio(item);
  if (ratio === null) return "unbounded";
  if (ratio >= 1) return "exhausted";
  if (ratio >= 0.8) return "nearing";
  return "healthy";
}
