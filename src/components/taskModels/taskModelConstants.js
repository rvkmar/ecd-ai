// src/components/taskModels/taskModelConstants.js
// ------------------------------------------------------------
// Task Model — shared vocabulary and derivation helpers
// ------------------------------------------------------------
// One place for every enumerated value the Task Model layer uses, and
// for the derivations that were previously copy-pasted (and therefore
// drifted) between TaskModelList, TaskModelTable, TaskModelDashboard,
// the wizard context and the review step.
//
// IMPORTANT: the option values here are contractual. `presentationMode`,
// `responseFormat` and `stimulusPolicy` are the ecdVocabulary.js lists
// re-exported below — schema.js imports those same arrays.
// `allowedInteractionTypes` and `allowedScoringMethods` are the blueprint
// whitelists that src/utils/schema.js enforces against
// `item.interaction.type` and `item.scoring.method`.
// ------------------------------------------------------------

/* ---------------- Task structure ---------------- */

/* PRESENTATION_MODES, RESPONSE_FORMATS and STIMULUS_POLICIES are NOT
 * defined here as of D116. Same move as BLOOM_LEVELS (Day 22): the
 * lists used to be copied into schema.js as bare string arrays, so a
 * `<select>` could offer a level the validator rejected (or the reverse).
 * They live in src/utils/ecdVocabulary.js. Re-exported below. Task
 * Models still store the chosen string on taskStructure; binding those
 * fields to Task Model Variable ids is a later unit. */

export const COMPOSITION_TYPES = [
    { value: "atomic", label: "Atomic", hint: "A single indivisible unit of work." },
    { value: "composite", label: "Composite", hint: "Ordered sub-task models executed as one task." },
];

/* ---------------- Observable student actions ---------------- */

export const ACTION_OPTIONS = [
    { value: "select", label: "Select" },
    { value: "attempt_question", label: "Attempt Question" },
    { value: "construct_response", label: "Construct Response" },
    { value: "interpret", label: "Interpret" },
    { value: "analyze_data", label: "Analyze Data" },
    { value: "perform_experiment", label: "Perform Experiment" },
    { value: "present", label: "Present" },
    { value: "collaborate", label: "Collaborate" },
    { value: "observe", label: "Observe" },
    { value: "record", label: "Record" },
];

/* ---------------- Administration conditions ---------------- */

export const EXECUTION_ENVIRONMENTS = [
    { value: "classroom", label: "Classroom" },
    { value: "laboratory", label: "Laboratory" },
    { value: "library", label: "Library" },
    { value: "field", label: "Field / Outdoor" },
    { value: "online_supervised", label: "Online (Supervised)" },
    { value: "online_unsupervised", label: "Online (Unsupervised)" },
    { value: "other", label: "Other" },
];

export const ASSESSOR_ROLES = [
    { value: "self", label: "Self" },
    { value: "peer", label: "Peer" },
    { value: "teacher", label: "Teacher" },
    { value: "external", label: "External" },
    { value: "automated", label: "Automated System" },
];

export const SUPPORT_LEVELS = [
    { value: "none", label: "None" },
    { value: "limited", label: "Limited" },
    { value: "extended", label: "Extended" },
];

export const LOAD_LEVELS = [
    { value: "low", label: "Low" },
    { value: "moderate", label: "Moderate" },
    { value: "high", label: "High" },
];

/* ---------------- Blueprint vocabulary ---------------- */

/* BLOOM_LEVELS and REASONING_TYPES are NOT defined here as of Day 22.
 *
 * Same story as INTERACTION_TYPES/SCORING_METHODS below: this file used to
 * carry its own copy, itemConstants.js re-exported it, and the two drifted
 * -- an item used to carry its own 4-value REASONING_TYPES while this
 * blueprint declared 7, three of which no item could ever record. Moved to
 * src/utils/ecdVocabulary.js so schema.js can validate against the same
 * values a `<select>` renders, instead of only checking `typeof ===
 * 'string'`. Re-exported rather than just imported so existing call sites
 * (Step5Blueprint, the tests) keep working unchanged. */
// Relative, not the "@/" alias: only vite resolves that, and this module
// is also loaded directly by node in verification scripts. Same reason
// src/utils/schema.js imports lifecycleMatrix.js by relative path.
export {
    INTERACTION_TYPES,
    SCORING_METHODS,
    BLOOM_LEVELS,
    REASONING_TYPES,
    PRESENTATION_MODES,
    RESPONSE_FORMATS,
    STIMULUS_POLICIES,
} from "../../utils/ecdVocabulary.js";

// Blueprint whitelists (`allowedInteractionTypes`, `allowedScoringMethods`)
// are validated against those same values in src/utils/schema.js, so the
// single definition matters on both sides of the wire.

export const COOLDOWN_POLICIES = [
    { value: "none", label: "No cooldown" },
    { value: "session", label: "Once per session" },
    { value: "daily", label: "Once per day" },
    { value: "form", label: "Once per test form" },
];

/* ---------------- Fairness vocabulary ---------------- */

export const FAIRNESS_CATEGORIES = [
    { value: "linguistic", label: "Linguistic load" },
    { value: "cultural", label: "Cultural specificity" },
    { value: "contextual", label: "Context familiarity" },
    { value: "accessibility", label: "Accessibility barrier" },
    { value: "socioeconomic", label: "Resource dependence" },
    { value: "construct_irrelevant", label: "Construct-irrelevant variance" },
];

export const FAIRNESS_SEVERITIES = [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
];

/* ---------------- Weight arithmetic ---------------- */

// Observable weights are a proportional allocation: src/utils/schema.js
// and server/routes/taskModelsRoutes.js both reject a Task Model whose
// expectedObservations weights do not sum to 1 (within tolerance). The
// UI therefore works in fractions, not counts.
export const WEIGHT_TOLERANCE = 0.001;

export function sumWeights(expectedObservations = []) {
    return expectedObservations.reduce(
        (sum, o) => sum + (Number(o.weight) || 0),
        0
    );
}

// Targeted observables carrying no weight. Reported separately from the
// sum rule so the UI can name them.
export function zeroWeightObservations(expectedObservations = []) {
    return (expectedObservations || []).filter(
        (o) => !(Number(o.weight) > 0)
    );
}

export function weightsAreNormalized(expectedObservations = []) {
    if (!expectedObservations.length) return false;
    return Math.abs(sumWeights(expectedObservations) - 1) <= WEIGHT_TOLERANCE;
}

// Rescales existing weights so they sum to exactly 1, preserving their
// relative proportions. Falls back to an even split when the current
// total is zero (or every weight is missing), which is the only sane
// interpretation of "normalize nothing".
export function normalizeWeights(expectedObservations = []) {
    if (!expectedObservations.length) return [];

    const total = sumWeights(expectedObservations);

    if (total <= 0) return distributeWeightsEvenly(expectedObservations);

    const scaled = expectedObservations.map((o) => ({
        ...o,
        weight: round4((Number(o.weight) || 0) / total),
    }));

    return absorbRoundingDrift(scaled);
}

// Weight for a newly targeted observable, with the existing allocation
// rescaled to make room for it.
//
// New selections used to default to weight 0 -- deliberately, so the
// author decided the split rather than silently breaking the sum-to-1
// rule. But the total then stayed at 1.000 the whole time, so the
// "weights normalized" gate passed and Next enabled with observables
// carrying no evidential weight at all and nothing saying so. A targeted
// observable at weight 0 is a contradiction: it is declared as expected
// evidence that contributes nothing.
//
// The new entry takes an equal share (1/n) and the existing entries are
// scaled proportionally into the remainder, so their RELATIVE weighting
// survives -- 0.7/0.3 plus a third becomes 0.4667/0.2/0.3333, not a flat
// third each. The total stays exactly 1.
export function addObservationWeight(existing = [], newEntry = {}) {
    const next = [...existing, newEntry];
    const share = round4(1 / next.length);
    const existingTotal = sumWeights(existing);

    if (existing.length === 0) return absorbRoundingDrift([{ ...newEntry, weight: 1 }]);

    // Nothing to preserve the proportions of -- fall back to an even split.
    if (existingTotal <= 0) return distributeWeightsEvenly(next);

    const scale = (1 - share) / existingTotal;

    const rescaled = existing.map((o) => ({
        ...o,
        weight: round4((Number(o.weight) || 0) * scale),
    }));

    return absorbRoundingDrift([...rescaled, { ...newEntry, weight: share }]);
}

// Weights left behind after an observable is removed, rescaled back up to
// total 1 so the allocation never silently falls short.
export function removeObservationWeight(remaining = []) {
    if (remaining.length === 0) return [];
    return normalizeWeights(remaining);
}

export function distributeWeightsEvenly(expectedObservations = []) {
    if (!expectedObservations.length) return [];

    const share = round4(1 / expectedObservations.length);
    const even = expectedObservations.map((o) => ({ ...o, weight: share }));

    return absorbRoundingDrift(even);
}

// 1/3 + 1/3 + 1/3 rounded to 4dp is 0.9999, which the schema rejects.
// The residual has to land somewhere for the stored array to total
// exactly 1.
//
// It goes on the LARGEST entry, not the last one. Putting it on the last
// meant the most recently added observable absorbed the correction, so
// adding a third to an even pair produced 0.3334 / 0.3334 / 0.3332 --
// the new one silently the smallest, for no reason a reader could see.
// Ties resolve to the last of them, so an even split still reads
// 0.3333 / 0.3333 / 0.3334. Correcting the largest also keeps the
// adjustment proportionally smallest.
function absorbRoundingDrift(entries) {
    if (!entries.length) return entries;

    const drift = round4(1 - sumWeights(entries));
    if (drift === 0) return entries;

    let targetIndex = 0;
    entries.forEach((entry, i) => {
        if ((Number(entry.weight) || 0) >= (Number(entries[targetIndex].weight) || 0)) {
            targetIndex = i;
        }
    });

    const next = [...entries];
    next[targetIndex] = {
        ...next[targetIndex],
        weight: round4((Number(next[targetIndex].weight) || 0) + drift),
    };

    return next;
}

export function round4(value) {
    return Math.round((Number(value) || 0) * 10000) / 10000;
}

// Weights are stored at 4dp because that is what it takes for an even
// split of 3 to total exactly 1 (0.3333 / 0.3333 / 0.3334). Rendering
// them at 3dp showed 0.333 three times -- a reviewer reads 0.999 under a
// heading that says the total is 1.000, and the remainder-carrying entry
// silently lies about its own value. Show the stored number, trimmed:
// 0.5 stays "0.5", 0.3334 stays "0.3334".
export function formatWeight(value) {
    const n = Number(value) || 0;
    return String(round4(n));
}

/* ---------------- Structural derivations ---------------- */

// The single definition of "is this Task Model structurally sound?".
// Previously duplicated -- with three different sets of rules -- across
// TaskModelList, TaskModelTable, TaskModelDashboard, the wizard context
// and StepReuseAndReview, so the review checklist could show a red cross
// while the Confirm button was enabled.
export function taskModelReadiness(model = {}) {
    const expectedObservations = model.expectedObservations || [];
    const evidenceModelIds = model.evidenceModelIds || [];
    const structure = model.taskStructure || {};
    const blueprint = model.blueprintConstraints || {};
    const isComposite = model.taskCompositionType === "composite";

    const checks = [
        {
            key: "identity",
            label: "Identity complete",
            detail: "Name and description are both present.",
            valid: Boolean(
                (model.name || "").trim() && (model.description || "").trim()
            ),
        },
        {
            key: "evidence",
            label: "Evidence models bound",
            detail: "At least one linkable Evidence Model, with one nominated primary.",
            valid:
                evidenceModelIds.length > 0 &&
                Boolean(model.primaryEvidenceModelId) &&
                evidenceModelIds.includes(model.primaryEvidenceModelId),
        },
        {
            key: "observables",
            label: "Observables targeted",
            detail: "At least one observable, at least one marked required.",
            valid:
                expectedObservations.length > 0 &&
                expectedObservations.some((o) => o.required === true),
        },
        {
            key: "weights",
            label: "Observable weights normalized",
            detail:
                "Weights allocate exactly 1.0 across the targeted observables, and none sits at zero.",
            // A total of 1.0 is not sufficient on its own: three observables
            // at 1 / 0 / 0 total 1.0 while two of them carry no evidential
            // weight. Targeting an observable and then weighting it zero is
            // a contradiction, so it fails this check rather than passing
            // quietly.
            valid:
                weightsAreNormalized(expectedObservations) &&
                zeroWeightObservations(expectedObservations).length === 0,
        },
        {
            key: "structure",
            label: "Task structure declared",
            detail: "Presentation, response and stimulus policy, plus at least one student action.",
            valid: Boolean(
                structure.presentationMode &&
                structure.responseFormat &&
                structure.stimulusPolicy &&
                (model.actions || []).length > 0 &&
                model.taskCompositionType &&
                (!isComposite || (model.subTaskIds || []).length > 0)
            ),
        },
        {
            key: "blueprint",
            label: "Blueprint constraints valid",
            detail: "Difficulty range is a proper interval.",
            valid:
                typeof blueprint.difficultyRange?.min === "number" &&
                typeof blueprint.difficultyRange?.max === "number" &&
                blueprint.difficultyRange.min < blueprint.difficultyRange.max,
        },
    ];

    return {
        checks,
        isComplete: checks.every((c) => c.valid),
    };
}

// Coarse three-state label used by the list, table and dashboard.
export function computeValidity(model = {}) {
    const { checks } = taskModelReadiness(model);
    const byKey = Object.fromEntries(checks.map((c) => [c.key, c.valid]));

    if (!byKey.identity || !byKey.evidence) return "invalid";
    if (!byKey.observables || !byKey.weights || !byKey.structure || !byKey.blueprint) {
        return "incomplete";
    }
    return "valid";
}

// Items that instantiate this exact version of the Task Model.
//
// Version-matched because item.taskModelVersion is validated against
// taskModel.versionNumber -- a cloned v2 starts with none of v1's items,
// and nothing can deliver it until migrated items exist.
export function itemsInstantiating(model = {}, items = []) {
    return (items || []).filter(
        (item) =>
            item.taskModelId === model.id &&
            item.taskModelVersion === model.versionNumber
    );
}

export const USABLE_ITEM_STATUSES = ["confirmed", "operational", "suspended"];

// Operational readiness is a superset of structural readiness: these are
// what server/utils/lifecycleValidation.js requires before a Task Model
// may be activated. Kept in step with that file — a rule enforced there
// and missing here is an activation refused with no prior warning.
// The reasons a Task Model cannot be activated right now, or an empty
// array when it can. Thin wrapper over operationalReadiness() so the
// Activate button, its tooltip and the wizard's prerequisite panel all
// read the same list -- a disabled button whose explanation disagrees
// with the checklist two screens away is worse than no explanation.
export function activationBlockers(model = {}, items = [], evidenceModels = []) {
    return operationalReadiness(model, items, evidenceModels).filter((c) => !c.valid);
}

export function operationalReadiness(model = {}, items = [], evidenceModels = []) {
    const instantiating = itemsInstantiating(model, items);
    const usable = instantiating.filter((i) =>
        USABLE_ITEM_STATUSES.includes(i.status)
    );

    // Everything this task produces is scored against its bound Evidence
    // Models, and those are only live once operational. A `confirmed` model
    // is frozen but not activated; a `suspended` one has been deliberately
    // pulled, usually over its calibration.
    const boundIds = model.evidenceModelIds || [];
    const notLive = boundIds
        .map((id) => ({
            id,
            em: (evidenceModels || []).find((e) => e.id === id),
        }))
        .filter(({ em }) => !em || em.status !== "operational");

    return [
        {
            key: "evidenceLive",
            label: "Every bound Evidence Model is operational",
            detail:
                boundIds.length === 0
                    ? "No Evidence Model bound."
                    : notLive.length === 0
                        ? `${boundIds.length} bound model(s) live.`
                        : `Not live: ${notLive
                            .map(({ id, em }) => `${em?.name || id} (${em?.status || "not found"})`)
                            .join(", ")}. Activate the Evidence Model first.`,
            valid: boundIds.length > 0 && notLive.length === 0,
        },
        {
            key: "accessibility",
            label: "Accessibility assumptions documented",
            detail:
                "Step 7 of the wizard — at least one accessibility field must be filled in.",
            valid: Object.values(model.accessibilityAssumptions || {}).some(
                (v) => String(v || "").trim().length > 0
            ),
        },
        {
            key: "equivalence",
            label: "Equivalence group assigned",
            detail: "Step 8 of the wizard — the group this task may be substituted within.",
            valid: Boolean((model.equivalenceGroupId || "").trim()),
        },
        {
            key: "items",
            label: "At least one confirmed Item instantiates this version",
            detail:
                instantiating.length === 0
                    ? `No Item references version ${model.versionNumber ?? 1} of this Task Model. A blueprint nothing can deliver cannot go live.`
                    : usable.length === 0
                        ? `${instantiating.length} Item(s) reference this version, but none is confirmed yet.`
                        : `${usable.length} of ${instantiating.length} referencing Item(s) confirmed.`,
            valid: usable.length > 0,
        },
    ];
}

/* ---------------- Fairness risk normalization ---------------- */

// Fairness risks used to be a bare string[]. They are objects now, but
// records authored before that change are still in the database, so every
// read path funnels through this.
export function normalizeFairnessRisk(risk, index = 0) {
    if (risk && typeof risk === "object") {
        return {
            id: risk.id || `risk-${index}`,
            category: risk.category || "construct_irrelevant",
            description: risk.description || "",
            severity: risk.severity || "medium",
            mitigation: risk.mitigation || "",
        };
    }

    return {
        id: `risk-${index}`,
        category: "construct_irrelevant",
        description: String(risk || ""),
        severity: "medium",
        mitigation: "",
    };
}

export function normalizeFairnessRisks(risks = []) {
    return (risks || []).map(normalizeFairnessRisk);
}

export function labelFor(options, value, fallback = "—") {
    return options.find((o) => o.value === value)?.label || value || fallback;
}

/* ---------------- Evidence ↔ task-form compatibility ---------------- */

// Mirrors the "adaptive readiness coherence layer" in src/utils/schema.js.
//
// Those rules are cross-model compatibility checks -- does this task's
// FORM suit the statistical model the bound evidence runs on? -- and they
// only fire at confirmation, because every one of them reads a field
// authored in Step 3, 4 or 5. Running them on the wizard's draft autosave
// produced a circular deadlock (see that block's header comment).
//
// Deferring them to confirmation is correct, but it would leave the
// author to discover at the very last step that the task form they picked
// three steps back is incompatible with their evidence. So the same rules
// are evaluated here, live and non-blocking, and rendered as advisories in
// Step 4 and again in the Step 8 summary.
//
// KEEP THIS IN STEP WITH src/utils/schema.js. If a rule is added there and
// not here, the author meets it for the first time as a confirmation
// failure.
export function evidenceCompatibilityNotes(model = {}, evidenceModels = []) {
    const notes = [];

    const bound = (model.evidenceModelIds || [])
        .map((id) => (evidenceModels || []).find((em) => em.id === id))
        .filter(Boolean);

    const structure = model.taskStructure || {};
    const observations = model.expectedObservations || [];

    for (const em of bound) {
        const active = (em.statisticalModels || []).find((sm) => sm.active);
        if (!active) continue;

        const label = em.name || em.id;
        const add = (severity, message) =>
            notes.push({ id: `${em.id}-${notes.length}`, severity, model: label, message });

        switch (active.type) {
            case "irt":
            case "rasch": {
                if (
                    structure.responseFormat &&
                    !["selected", "hybrid"].includes(structure.responseFormat)
                ) {
                    add(
                        "blocking",
                        `${active.type.toUpperCase()} evidence needs a selected or hybrid response format. Confirmation will be refused with "${structure.responseFormat}".`
                    );
                } else if (!structure.responseFormat) {
                    add(
                        "pending",
                        `${active.type.toUpperCase()} evidence requires a selected or hybrid response format.`
                    );
                }

                if (structure.stimulusPolicy === "static") {
                    add(
                        "blocking",
                        "IRT-based adaptive tasks should not use a fully static stimulus policy."
                    );
                }
                break;
            }

            case "bayesian_network": {
                if (observations.length > 0 && observations.length < 2) {
                    add(
                        "blocking",
                        "Bayesian network evidence requires at least two targeted observables."
                    );
                } else if (observations.length === 0) {
                    add("pending", "Bayesian network evidence requires at least two targeted observables.");
                }
                break;
            }

            case "ctt": {
                if (observations.length > 0 && observations.length < 2) {
                    add(
                        "blocking",
                        "Classical Test Theory evidence requires at least two observables — reliability cannot be estimated from one."
                    );
                } else if (observations.length === 0) {
                    add("pending", "Classical Test Theory evidence requires at least two targeted observables.");
                }
                break;
            }

            case "threshold": {
                const weights = observations.map((o) => o.weight);
                if (weights.length >= 2 && new Set(weights).size < 2) {
                    add("blocking", "Threshold model requires observables with differing weights.");
                } else if (weights.length < 2) {
                    add("pending", "Threshold model requires at least two observables with differing weights.");
                }
                break;
            }

            case "sum": {
                const weights = observations.map((o) => o.weight);
                if (weights.length >= 2 && new Set(weights).size > 1) {
                    add("blocking", "Sum model requires uniform observable weights.");
                }
                break;
            }

            default:
                break;
        }
    }

    return notes;
}

/* ---------------- Difficulty scale ---------------- */

// The difficulty range is expressed on the scale of whatever statistical
// model the bound evidence runs on, and those scales are not
// interchangeable: IRT and Rasch difficulty is in logits, roughly -3 to 3;
// CTT difficulty is a proportion correct, 0 to 1.
//
// The wizard used to prefill 0-1 unconditionally, so an IRT-backed task
// got a CTT range on a logit field -- a silently wrong default that
// validates (min < max) and stores fine.
export const DIFFICULTY_SCALES = {
    irt: { label: "logits", min: -3, max: 3 },
    rasch: { label: "logits", min: -3, max: 3 },
    ctt: { label: "proportion correct", min: 0, max: 1 },
    sum: { label: "proportion of maximum score", min: 0, max: 1 },
    threshold: { label: "latent scale", min: -3, max: 3 },
    bayesian_network: { label: "posterior probability", min: 0, max: 1 },
};

// The scale implied by the PRIMARY evidence model's active statistical
// model. Null when nothing is bound yet or no model is active, in which
// case the wizard asks rather than guessing.
export function difficultyScaleFor(model = {}, evidenceModels = []) {
    const primary = (evidenceModels || []).find(
        (em) => em.id === model.primaryEvidenceModelId
    );
    if (!primary) return null;

    const active = (primary.statisticalModels || []).find((sm) => sm.active);
    if (!active) return null;

    const scale = DIFFICULTY_SCALES[active.type];
    if (!scale) return null;

    return { ...scale, statisticalModel: active.type, evidenceModel: primary.name || primary.id };
}
