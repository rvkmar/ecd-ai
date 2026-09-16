// modelGuidanceLibrary.js
// 🧠 Enterprise ECD — Statistical Model Guidance Library
// ------------------------------------------------------
// Central registry describing supported statistical
// models and their psychometric properties.

export const MODEL_GUIDANCE_LIBRARY = {

    /* =====================================================
       Classical Test Theory
       -----------------------------------------------------
       The observed-score model. Competency standing is a weighted
       total over the observables, interpreted against a cut score or
       a norm, with reliability (and the standard error of measurement
       it implies) as the quality claim rather than item parameters.

       Distinct from the Sum Score model below, which is the same
       arithmetic with no measurement claim attached: `sum` is a
       deterministic aggregation rule, `ctt` carries a score scale, a
       reliability target and an SEM, and is calibrated against a
       response matrix.
    ===================================================== */

    ctt: {

        type: "ctt",

        label: "Classical Test Theory",

        family: "Classical",

        description:
            "Scores the competency as a weighted total over the observables, judged against a cut score or norm, with reliability and standard error of measurement as the quality claim.",

        complexity: "low",

        calibrationSample: "≈ 100+ responses for a stable reliability estimate",

        adaptiveCompatible: false,

        supportsCalibration: true,

        // Every ordered outcome. A total score presupposes that "more"
        // means "further along the construct", which holds for a
        // binary, ordinal or continuous competency and does not hold
        // for a categorical one -- unordered categories cannot be
        // summed into a standing.
        allowedVariableTypes: [
            "binary",
            "ordinal",
            "continuous"
        ],

        visualization: null,

        configPanel: "CTTConfigPanel"

    },

    /* =====================================================
       Rasch Model
    ===================================================== */

    rasch: {

        type: "rasch",

        label: "Rasch Model",

        family: "IRT",

        description:
            "Estimates learner ability using a unidimensional latent trait model assuming equal item discrimination.",

        complexity: "low",

        calibrationSample: "≈ 200+ responses recommended",

        adaptiveCompatible: true,

        supportsCalibration: true,

        allowedVariableTypes: [
            "binary",
            "ordinal",
            "continuous"
        ],

        visualization: "latentStructure",

        configPanel: "IRTConfigPanel"

    },

    /* =====================================================
       IRT Model
    ===================================================== */

    irt: {

        type: "irt",

        label: "Item Response Theory",

        family: "IRT",

        description:
            "Models probability of observable outcomes as a function of learner ability and item parameters.",

        complexity: "medium",

        calibrationSample: "≈ 500+ responses recommended",

        adaptiveCompatible: true,

        supportsCalibration: true,

        allowedVariableTypes: [
            "binary",
            "ordinal",
            "continuous"
        ],

        visualization: "latentStructure",

        configPanel: "IRTConfigPanel"

    },

    /* =====================================================
       Bayesian Network
    ===================================================== */

    bayesian_network: {

        type: "bayesian_network",

        label: "Bayesian Network",

        family: "Diagnostic",

        description:
            "Represents probabilistic dependencies between competencies and observable evidence variables.",

        complexity: "high",

        calibrationSample:
            "Depends on conditional probability table size",

        adaptiveCompatible: true,

        supportsCalibration: true,

        // Ordinal belongs here. A discrete Bayesian network is the classic
        // ECD measurement model for an ordered set of mastery levels -- the
        // latent node simply takes the competency's own states as its
        // values, exactly as it does for a categorical competency, and the
        // CPT editor already builds a row per state.
        //
        // Omitting it meant getModelsForVariableType("ordinal") returned
        // only the IRT-family and threshold models, so the Bayesian Network
        // card was absent from Step 6 for every ordinal competency -- which
        // is most of them in this app. Authors reported the model as
        // "missing" because for their competency it genuinely never
        // rendered.
        //
        // Continuous stays out: a discrete CPT cannot represent a
        // continuous latent variable without a discretisation step this
        // architecture does not have.
        allowedVariableTypes: [
            "binary",
            "ordinal",
            "categorical"
        ],

        visualization: "bayesianGraph",

        configPanel: "BNConfigPanel"

    },

    /* =====================================================
       Sum Score Model
    ===================================================== */

    sum: {

        type: "sum",

        label: "Sum Score Model",

        family: "Deterministic",

        description:
            "Aggregates observable evidence using weighted scoring rules without estimating latent ability.",

        complexity: "low",

        calibrationSample: "No calibration required",

        adaptiveCompatible: false,

        supportsCalibration: false,

        allowedVariableTypes: [
            "binary"
        ],

        visualization: null,

        configPanel: "SumConfigPanel"

    },

    /* =====================================================
       Threshold Model
    ===================================================== */

    threshold: {

        type: "threshold",

        label: "Threshold Rule",

        family: "Deterministic",

        description:
            "Classifies learner mastery based on minimum observable evidence thresholds.",

        complexity: "low",

        calibrationSample: "No calibration required",

        adaptiveCompatible: false,

        supportsCalibration: false,

        allowedVariableTypes: [
            "ordinal"
        ],

        visualization: null,

        configPanel: "ThresholdConfigPanel"

    },

    /* =====================================================
       DINA -- Deterministic Inputs, Noisy "And" gate
       -----------------------------------------------------
       A latent-CLASS model, not a latent-trait one. Where IRT places a
       learner on a continuum, DINA classifies them into a discrete
       mastery profile over the attributes a Q-matrix declares: for each
       item, either they have every attribute it requires or they do not,
       softened by two parameters -- `slip` (a master answers wrongly)
       and `guess` (a non-master answers rightly).

       `allowedVariableTypes` is BINARY ONLY, and that is not a
       simplification. schema.js:1386 lists dina/gdina among the models a
       binary competency permits and omits them from every other variable
       type's list, so offering the family for an ordinal or continuous
       competency would put a card on the page that confirmation then
       rejects -- the exact "offered then rejected" defect the comment
       above the CTT entry warns about, and which this library exists to
       prevent.

       Note the layer distinction the panel has to keep straight: the gate
       here is the COMPETENCY's `variableType`, while the Q-matrix's
       columns are the Student Model's binary `smVariables`. Two
       different binaries, one per layer.
    ===================================================== */

    dina: {

        type: "dina",

        label: "DINA",

        family: "Diagnostic",

        description:
            "Classifies the learner into a discrete mastery profile over the attributes a Q-matrix declares. An item is answered correctly when every attribute it requires is mastered, softened by a slip and a guess parameter.",

        complexity: "high",

        calibrationSample: "≈ 500+ responses per item for stable slip/guess estimates",

        // A diagnostic profile is exactly what adaptive selection wants to
        // narrow, but selection against an attribute profile is D56's work,
        // not something this family can claim yet.
        adaptiveCompatible: false,

        supportsCalibration: true,

        allowedVariableTypes: [
            "binary"
        ],

        visualization: null,

        configPanel: "DINAConfigPanel"

    },

    /* =====================================================
       G-DINA -- the saturated generalisation
       -----------------------------------------------------
       DINA's conjunctive "all required attributes or nothing" is one
       point in a family. G-DINA estimates a success probability for
       EVERY sub-pattern of an item's required attributes, so partial
       mastery can carry partial credit and compensatory or disjunctive
       item behaviour is representable rather than assumed away.

       The cost is parameters: an item requiring k attributes needs 2^k
       probabilities instead of 2, which is why the calibration sample
       below is stated per required attribute rather than per item.
    ===================================================== */

    gdina: {

        type: "gdina",

        label: "G-DINA",

        family: "Diagnostic",

        description:
            "The saturated diagnostic model: a success probability for every sub-pattern of the attributes an item requires, so partial mastery and compensatory items are representable rather than assumed away.",

        complexity: "high",

        calibrationSample: "Grows as 2^k in an item's required-attribute count k; ≈ 1000+ responses is a realistic floor",

        adaptiveCompatible: false,

        supportsCalibration: true,

        allowedVariableTypes: [
            "binary"
        ],

        visualization: null,

        configPanel: "DINAConfigPanel"

    }

};



/* =========================================================
   Helper Functions
========================================================= */

/* Get model metadata */

export function getModelGuidance(type) {

    return MODEL_GUIDANCE_LIBRARY[type] || null;

}


/* Get all models */

export function getAllModels() {

    return Object.values(MODEL_GUIDANCE_LIBRARY);

}


/* Filter models by competency variable type */

export function getModelsForVariableType(variableType) {

    return getAllModels().filter(model =>
        model.allowedVariableTypes.includes(variableType)
    );

}


/* Every model, each annotated with whether this competency's variable type
   permits it and why not.

   Step 6 used to render only `getModelsForVariableType(...)`, so a model that
   did not fit the competency simply was not on the page -- and neither was
   any statement that it had been excluded or why. A categorical competency
   showed a single Bayesian Network card with IRT nowhere to be seen, which
   reads as a broken screen rather than as a measurement constraint. An
   unknown or missing variableType returned an EMPTY list, i.e. a blank grid
   with no models and no explanation at all.

   Returning the full set with a reason lets the selector show what exists,
   what is available here, and what would have to change about the competency
   to make the rest available. */

export function getModelAvailability(variableType) {

    return getAllModels().map(model => {

        if (!variableType) {
            return {
                ...model,
                compatible: false,
                reason:
                    "The target competency has no variable type set. Set it in the Student Model before choosing a statistical model."
            };
        }

        const compatible =
            model.allowedVariableTypes.includes(variableType);

        return {
            ...model,
            compatible,
            reason: compatible
                ? null
                : `Not available for a ${variableType} competency. Supports: ${model.allowedVariableTypes.join(", ")}.`
        };

    });

}


/* Check adaptive compatibility */

export function supportsAdaptiveTesting(type) {

    const model = getModelGuidance(type);

    return model?.adaptiveCompatible || false;

}


/* Check calibration requirement */

export function requiresCalibration(type) {

    const model = getModelGuidance(type);

    return model?.supportsCalibration || false;

}