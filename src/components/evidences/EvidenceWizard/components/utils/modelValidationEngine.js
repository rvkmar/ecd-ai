// modelValidationEngine.js
// 🧠 Enterprise ECD — Statistical Model Validation Engine
// -------------------------------------------------------
// Performs structural validation of statistical models
// used in Evidence Model Step6.

import { getModelGuidance } from "./modelGuidanceLibrary";

/* =========================================================
   Validation Result Factory
========================================================= */

function createResult() {

    return {
        valid: true,
        errors: [],
        warnings: [],
        success: []
    };

}

/* =========================================================
   Model Presence Validation
========================================================= */

function validateModelPresence(models, result) {

    if (!models || models.length === 0) {

        result.errors.push(
            "At least one statistical model must be defined."
        );

        result.valid = false;

        return;
    }

    result.success.push(
        "Statistical model defined."
    );

}

/* =========================================================
   Active Model Validation
========================================================= */

function validateActiveModel(models, result) {

    const activeModels = models.filter(m => m.active);

    if (activeModels.length !== 1) {

        result.errors.push(
            "Exactly one statistical model must be active."
        );

        result.valid = false;

        return;
    }

    result.success.push(
        "Active statistical model selected."
    );

}

/* =========================================================
   Variable Type Compatibility
========================================================= */

function validateVariableCompatibility(
    models,
    variableType,
    result
) {

    models.forEach(model => {

        const meta = getModelGuidance(model.type);

        if (!meta) return;

        if (!meta.allowedVariableTypes.includes(variableType)) {

            result.errors.push(
                `Model "${model.type}" is not compatible with variable type "${variableType}".`
            );

            result.valid = false;

        }

    });

}

/* =========================================================
   Structure Configuration
========================================================= */

function validateStructureConfig(models, result) {

    models.forEach(model => {

        if (!model.structureConfig ||
            Object.keys(model.structureConfig).length === 0) {

            result.warnings.push(
                `Model ${model.id} has no structure configuration defined.`
            );

        }

    });

}

/* =========================================================
   Observable Coverage
========================================================= */

function validateObservables(observables, result) {

    if (!observables || observables.length === 0) {

        result.warnings.push(
            "No observables defined for statistical inference."
        );

    } else {

        result.success.push(
            `${observables.length} observables available.`
        );

    }

}

/* =========================================================
   Threshold Model Validation
========================================================= */

function validateThresholdModel(models, result) {

    models.forEach(model => {

        if (model.type !== "threshold") return;

        const config = model.structureConfig || {};

        if (!config.threshold) {

            result.errors.push(
                "Threshold model requires a mastery threshold."
            );

            result.valid = false;

        }

        if (!config.observableIds || config.observableIds.length === 0) {

            result.errors.push(
                "Threshold model requires observable evidence mapping."
            );

            result.valid = false;

        }

    });

}

/* =========================================================
   IRT / Rasch Validation
========================================================= */

function validateIRTModel(models, result) {

    models.forEach(model => {

        if (!["rasch", "irt"].includes(model.type)) return;

        const config = model.structureConfig || {};

        if (!config.observableIds || config.observableIds.length === 0) {

            result.warnings.push(
                `IRT model ${model.id} has no observables mapped.`
            );

        }

        if (config.dimensions && config.dimensions > 1) {

            result.warnings.push(
                "Multidimensional IRT models are not currently supported."
            );

        }

    });

}

/* =========================================================
   Classical Test Theory Validation
========================================================= */

function validateCTTModel(models, result) {

    models.forEach(model => {

        if (model.type !== "ctt") return;

        const config = model.structureConfig || {};
        const ids = config.observableIds || [];

        if (ids.length === 0) {

            result.errors.push(
                "Classical Test Theory model requires at least one scored observable."
            );

            result.valid = false;

            return;
        }

        // Every weight must be a usable number, and they cannot all be zero:
        // a total with no weight is not a score.
        const weights = ids.map(id => Number(config.weights?.[id] ?? 1));

        if (weights.some(w => !Number.isFinite(w) || w < 0)) {

            result.errors.push(
                "Classical Test Theory weights must be non-negative numbers."
            );

            result.valid = false;
        }

        else if (weights.reduce((a, b) => a + b, 0) === 0) {

            result.errors.push(
                "Classical Test Theory model has a total weight of zero — no observable contributes to the score."
            );

            result.valid = false;
        }

        // Cronbach's alpha is undefined below two components.
        if (ids.length < 3) {

            result.warnings.push(
                `Classical Test Theory model scores only ${ids.length} observable(s); internal-consistency reliability cannot be estimated meaningfully below three.`
            );
        }

        if (config.scoreScale === "standardized") {

            if (typeof config.normSD !== "number" || config.normSD <= 0) {

                result.errors.push(
                    "Standardized scoring requires a norm standard deviation greater than zero."
                );

                result.valid = false;
            }
        }

        if (
            typeof config.reliabilityTarget === "number" &&
            (config.reliabilityTarget < 0 || config.reliabilityTarget > 1)
        ) {

            result.errors.push(
                "Reliability target must be between 0 and 1."
            );

            result.valid = false;
        }

    });

}

/* =========================================================
   Bayesian Network Validation
========================================================= */

function validateBayesianModel(models, result) {

    models.forEach(model => {

        if (model.type !== "bayesian_network") return;

        const config = model.structureConfig || {};

        if (!config.observableIds || config.observableIds.length === 0) {

            result.warnings.push(
                "Bayesian network model requires observable evidence nodes."
            );

        }

        if (config.latentNodes && config.latentNodes.length > 1) {

            result.warnings.push(
                "Multiple latent nodes: delivery scores a tree (each node has at most one parent). A cycle or two parents is refused at save."
            );

        }

    });

}

/* =========================================================
   Main Validation Function
========================================================= */

export function validateStatisticalModels({

    models = [],
    observables = [],
    variableType = null

}) {

    const result = createResult();

    validateModelPresence(models, result);

    validateActiveModel(models, result);

    validateObservables(observables, result);

    if (variableType) {

        validateVariableCompatibility(
            models,
            variableType,
            result
        );

    }

    validateStructureConfig(models, result);

    validateThresholdModel(models, result);

    validateIRTModel(models, result);

    validateCTTModel(models, result);

    validateBayesianModel(models, result);

    return result;

}