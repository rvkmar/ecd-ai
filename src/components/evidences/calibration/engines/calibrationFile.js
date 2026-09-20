// calibrationFile.js
// 🧠 Enterprise ECD — Calibration Package Parser + Validator
// ---------------------------------------------------------------
// A "calibration file" is the hand-off artefact between whoever runs
// the estimation (R/mirt, Stan, flexMIRT, a vendor bureau) and this
// platform. Nothing in here talks to the network: it parses, it
// validates against the evidence model's declared observables, and it
// produces the exact `parameters` payload POSTed to
// /api/evidenceModels/:id/recalibrate.
//
// Three shapes are supported:
//   1. kind: "irt-parameters"  — a/b/c per observable (+ SEs, fit)
//   2. kind: "bayesian-cpt"    — prior + P(correct | competency state)
//   3. a raw CSV response matrix (see classicalCalibration.js), which
//      is converted into shape 1 client-side.
//
// PARAMETER PAYLOAD CONVENTION (important, read before changing)
// -------------------------------------------------------------
// `parameterSets[].parameters` is a FLAT map keyed by observable id,
// because IRTInferencePanel reads `parameters[obsId]` directly.
// Package-level metadata therefore lives under reserved keys prefixed
// with "_" so it can never collide with an observable id:
//   _kind   "irt-parameters" | "bayesian-cpt"
//   _scale  { metric, mean, sd, linking }        (IRT)
//   _prior  { <stateValue>: probability }        (Bayesian)
//   _fit    { logLik, AIC, BIC, RMSEA, CFI, ... }
//   _source { fileName, importedAt, fileVersion }
// ---------------------------------------------------------------

export const CALIBRATION_FILE_VERSION = "1.0";

export const CALIBRATION_KINDS = ["irt-parameters", "bayesian-cpt"];

export const RESERVED_PARAM_KEYS = ["_kind", "_scale", "_prior", "_fit", "_source"];

export const isReservedParamKey = (key) =>
    typeof key === "string" && key.startsWith("_");

/* Statistical model types each calibration kind may be applied to. */
export const KIND_MODEL_TYPES = {
    "irt-parameters": ["irt", "rasch"],
    "bayesian-cpt": ["bayesian_network"],
};

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isPlainObject = (v) =>
    !!v && typeof v === "object" && !Array.isArray(v);

const round = (v, dp = 4) =>
    isNum(v) ? Number(v.toFixed(dp)) : v;

/* =====================================================
   RESULT SHAPE
===================================================== */

const emptyResult = () => ({
    ok: false,
    format: null,      // "json" | "csv"
    pkg: null,
    errors: [],
    warnings: [],
});

/* =====================================================
   ENTRY POINT — format detection
===================================================== */

export function detectFormat(fileName = "", text = "") {

    const lower = String(fileName).toLowerCase();

    if (lower.endsWith(".json")) return "json";
    if (lower.endsWith(".csv") || lower.endsWith(".tsv")) return "csv";

    // Fall back to sniffing the payload for files dropped without an
    // extension (drag-and-drop from a mail client, mostly).
    return text.trim().startsWith("{") || text.trim().startsWith("[")
        ? "json"
        : "csv";
}

/* =====================================================
   JSON CALIBRATION PACKAGE
===================================================== */

export function parseCalibrationJson(text) {

    const result = emptyResult();
    result.format = "json";

    let raw;

    try {
        raw = JSON.parse(text);
    } catch (err) {
        result.errors.push(`File is not valid JSON: ${err.message}`);
        return result;
    }

    // Tolerate a single-element array so the file can be dropped into
    // the bulk-upload folder alongside the other samples.
    if (Array.isArray(raw)) {
        if (raw.length !== 1) {
            result.errors.push(
                "A calibration file must contain one calibration package, not an array of packages."
            );
            return result;
        }
        raw = raw[0];
    }

    if (!isPlainObject(raw)) {
        result.errors.push("Calibration file must be a JSON object.");
        return result;
    }

    /* ---------- envelope ---------- */

    if (!raw.calibrationFileVersion) {
        result.warnings.push(
            `No calibrationFileVersion declared — assuming ${CALIBRATION_FILE_VERSION}.`
        );
    } else if (String(raw.calibrationFileVersion).split(".")[0] !==
        CALIBRATION_FILE_VERSION.split(".")[0]) {
        result.errors.push(
            `Unsupported calibrationFileVersion "${raw.calibrationFileVersion}". This build reads version ${CALIBRATION_FILE_VERSION}.x.`
        );
        return result;
    }

    const kind = raw.kind;

    if (!CALIBRATION_KINDS.includes(kind)) {
        result.errors.push(
            `kind must be one of: ${CALIBRATION_KINDS.join(", ")}.`
        );
        return result;
    }

    /* ---------- provenance (audit requirement) ---------- */

    const provenance = isPlainObject(raw.provenance) ? raw.provenance : {};

    if (!provenance.calibratedBy) {
        result.errors.push("provenance.calibratedBy is required — calibration must be attributable.");
    }

    if (!provenance.calibrationMethod) {
        result.errors.push("provenance.calibrationMethod is required (e.g. 'R mirt 2PL MML-EM').");
    }

    if (!isNum(provenance.sampleSize) || provenance.sampleSize <= 0) {
        result.errors.push("provenance.sampleSize must be a positive number.");
    } else if (provenance.sampleSize < 200) {
        result.warnings.push(
            `Sample size ${provenance.sampleSize} is small for stable item parameter estimation. Treat the resulting parameter set as provisional.`
        );
    }

    // D90: packageVersion on the committed parameter set comes from software
    // (or an explicit packageVersion). Invented "manual-unspecified" is refused
    // server-side — surface the gap at parse time.
    if (!provenance.software && !provenance.packageVersion) {
        result.errors.push(
            "provenance.software (or provenance.packageVersion) is required — the active parameter set must name its estimator."
        );
    }

    /* ---------- kind-specific body ---------- */

    if (kind === "irt-parameters") {
        parseIrtBody(raw, result);
    } else {
        parseBayesianBody(raw, result);
    }

    if (result.errors.length) return result;

    /* ---------- optional decision rule ---------- */

    const decisionRule = isPlainObject(raw.decisionRule)
        ? validateDecisionRule(raw.decisionRule, result)
        : null;

    result.pkg = {
        kind,
        fileVersion: raw.calibrationFileVersion || CALIBRATION_FILE_VERSION,
        target: isPlainObject(raw.target) ? raw.target : {},
        provenance,
        scale: isPlainObject(raw.scale) ? raw.scale : null,
        fit: isPlainObject(raw.fit) ? raw.fit : null,
        decisionRule,
        parameters: result._parameters || {},
        prior: result._prior || null,
    };

    delete result._parameters;
    delete result._prior;

    result.ok = true;
    return result;
}

/* =====================================================
   IRT BODY
===================================================== */

function parseIrtBody(raw, result) {

    const params = raw.parameters;

    if (!isPlainObject(params) || Object.keys(params).length === 0) {
        result.errors.push("irt-parameters files must carry a non-empty `parameters` object keyed by observable id.");
        return;
    }

    const normalized = {};

    Object.entries(params).forEach(([obsId, p]) => {

        if (isReservedParamKey(obsId)) {
            result.errors.push(
                `"${obsId}" is a reserved key and cannot be used as an observable id.`
            );
            return;
        }

        if (!isPlainObject(p)) {
            result.errors.push(`parameters.${obsId} must be an object.`);
            return;
        }

        if (!isNum(p.b)) {
            result.errors.push(`parameters.${obsId}.b (difficulty) must be numeric.`);
            return;
        }

        if (p.a !== undefined && (!isNum(p.a) || p.a <= 0)) {
            result.errors.push(`parameters.${obsId}.a (discrimination) must be a positive number.`);
            return;
        }

        if (p.c !== undefined && (!isNum(p.c) || p.c < 0 || p.c >= 1)) {
            result.errors.push(`parameters.${obsId}.c (guessing) must be between 0 and 1.`);
            return;
        }

        if (Math.abs(p.b) > 6) {
            result.warnings.push(
                `${obsId}: difficulty ${p.b} is outside the usual [-6, 6] logit range — check the scale/linking metadata.`
            );
        }

        if (isNum(p.a) && p.a < 0.3) {
            result.warnings.push(
                `${obsId}: discrimination ${p.a} is very low — this observable contributes almost no information.`
            );
        }

        normalized[obsId] = {
            a: isNum(p.a) ? round(p.a) : 1,
            b: round(p.b),
            c: isNum(p.c) ? round(p.c) : 0,
            ...(isNum(p.se_a) ? { se_a: round(p.se_a) } : {}),
            ...(isNum(p.se_b) ? { se_b: round(p.se_b) } : {}),
            ...(isNum(p.infit) ? { infit: round(p.infit, 3) } : {}),
            ...(isNum(p.outfit) ? { outfit: round(p.outfit, 3) } : {}),
            ...(isNum(p.pValue) ? { pValue: round(p.pValue, 3) } : {}),
            ...(isNum(p.pointBiserial) ? { pointBiserial: round(p.pointBiserial, 3) } : {}),
            ...(isNum(p.n) ? { n: p.n } : {}),
        };

        // Rasch/Infit-outfit convention: 0.7-1.3 is the usual productive band.
        if (isNum(p.infit) && (p.infit < 0.7 || p.infit > 1.3)) {
            result.warnings.push(
                `${obsId}: infit ${p.infit} falls outside the productive 0.70–1.30 band.`
            );
        }
    });

    result._parameters = normalized;
}

/* =====================================================
   BAYESIAN BODY
===================================================== */

function parseBayesianBody(raw, result) {

    const prior = raw.prior;
    const cpt = raw.cpt;

    if (!isPlainObject(prior) || Object.keys(prior).length < 2) {
        result.errors.push("bayesian-cpt files must carry a `prior` over at least two competency states.");
        return;
    }

    const states = Object.keys(prior);
    let priorTotal = 0;

    states.forEach(s => {
        if (!isNum(prior[s]) || prior[s] < 0 || prior[s] > 1) {
            result.errors.push(`prior.${s} must be a probability between 0 and 1.`);
        } else {
            priorTotal += prior[s];
        }
    });

    if (result.errors.length) return;

    if (Math.abs(priorTotal - 1) > 0.01) {
        result.errors.push(
            `prior must sum to 1 across states (currently ${priorTotal.toFixed(3)}).`
        );
        return;
    }

    if (!isPlainObject(cpt) || Object.keys(cpt).length === 0) {
        result.errors.push("bayesian-cpt files must carry a non-empty `cpt` object keyed by observable id.");
        return;
    }

    const normalized = {};

    Object.entries(cpt).forEach(([obsId, entry]) => {

        if (isReservedParamKey(obsId)) {
            result.errors.push(`"${obsId}" is a reserved key and cannot be used as an observable id.`);
            return;
        }

        // Accept both { levels: {...} } and the bare { L1: p } shorthand.
        const levels = isPlainObject(entry?.levels) ? entry.levels : entry;

        if (!isPlainObject(levels)) {
            result.errors.push(`cpt.${obsId} must map each competency state to P(evidence observed | state).`);
            return;
        }

        const missing = states.filter(s => !isNum(levels[s]));

        if (missing.length) {
            result.errors.push(
                `cpt.${obsId} is missing a probability for state(s): ${missing.join(", ")}.`
            );
            return;
        }

        const outOfRange = states.filter(s => levels[s] < 0 || levels[s] > 1);

        if (outOfRange.length) {
            result.errors.push(
                `cpt.${obsId} has probabilities outside [0, 1] for state(s): ${outOfRange.join(", ")}.`
            );
            return;
        }

        // Monotonicity: a higher competency state should not make correct
        // evidence LESS likely. Ordering follows the prior's key order,
        // which the importer aligns to the competency's ordered states.
        for (let i = 1; i < states.length; i++) {
            if (levels[states[i]] < levels[states[i - 1]] - 1e-9) {
                result.warnings.push(
                    `${obsId}: P(observed) drops from ${states[i - 1]} to ${states[i]} — non-monotonic CPTs are usually a state-ordering mistake.`
                );
                break;
            }
        }

        const spread =
            Math.max(...states.map(s => levels[s])) -
            Math.min(...states.map(s => levels[s]));

        if (spread < 0.15) {
            result.warnings.push(
                `${obsId}: only ${spread.toFixed(2)} probability spread across states — this observable barely discriminates.`
            );
        }

        const levelsRounded = {};
        states.forEach(s => { levelsRounded[s] = round(levels[s], 4); });

        normalized[obsId] = {
            levels: levelsRounded,
            ...(isNum(entry?.n) ? { n: entry.n } : {}),
        };
    });

    const priorRounded = {};
    states.forEach(s => { priorRounded[s] = round(prior[s], 4); });

    result._parameters = normalized;
    result._prior = priorRounded;
}

/* =====================================================
   DECISION RULE (optional block inside the file)
===================================================== */

const DECISION_RULE_TYPES = [
    "mastery",
    "classification",
    "score_band",
    "posterior_threshold",
];

export function validateDecisionRule(dr, result) {

    if (!DECISION_RULE_TYPES.includes(dr.type)) {
        result.warnings.push(
            `decisionRule.type "${dr.type}" is not one of ${DECISION_RULE_TYPES.join(", ")} — the block was ignored.`
        );
        return null;
    }

    if (!isNum(dr.threshold)) {
        result.warnings.push("decisionRule.threshold must be numeric — the block was ignored.");
        return null;
    }

    if (!["above", "below", "within"].includes(dr.direction)) {
        result.warnings.push("decisionRule.direction must be above, below or within — the block was ignored.");
        return null;
    }

    if (!dr.justification || String(dr.justification).length < 10) {
        result.warnings.push("decisionRule.justification is too short to satisfy schema validation — the block was ignored.");
        return null;
    }

    return {
        type: dr.type,
        threshold: dr.threshold,
        direction: dr.direction,
        justification: String(dr.justification),
    };
}

/* =====================================================
   VALIDATION AGAINST THE TARGET EVIDENCE MODEL
===================================================== */

export function validateAgainstModel({
    pkg,
    statisticalModel,
    observables = [],
    competency = null,
}) {

    const errors = [];
    const warnings = [];

    if (!pkg) return { errors: ["No calibration package loaded."], warnings, coverage: null };

    if (!statisticalModel) {
        return { errors: ["Select a statistical model before importing."], warnings, coverage: null };
    }

    /* ---------- kind ↔ model type ---------- */

    const allowedTypes = KIND_MODEL_TYPES[pkg.kind] || [];

    if (!allowedTypes.includes(statisticalModel.type)) {
        errors.push(
            `This file calibrates a ${allowedTypes.join("/")} model, but the selected statistical model is "${statisticalModel.type}".`
        );
    }

    /* ---------- observable coverage ---------- */

    const declared = statisticalModel.structureConfig?.observableIds || [];

    const scopedIds = declared.length
        ? declared
        : observables.map(o => o.id);

    const fileIds = Object.keys(pkg.parameters || {});

    const unknown = fileIds.filter(id => !observables.some(o => o.id === id));
    const outOfScope = fileIds.filter(
        id => !unknown.includes(id) && !scopedIds.includes(id)
    );
    const missing = scopedIds.filter(id => !fileIds.includes(id));

    if (unknown.length) {
        errors.push(
            `Calibration file references observables that do not exist on this evidence model: ${unknown.join(", ")}.`
        );
    }

    if (outOfScope.length) {
        warnings.push(
            `Parameters supplied for observables outside this statistical model's mapping (ignored by inference): ${outOfScope.join(", ")}.`
        );
    }

    if (missing.length) {
        errors.push(
            `No parameters supplied for mapped observable(s): ${missing.join(", ")}. Every mapped observable must be calibrated.`
        );
    }

    /* ---------- bayesian: states must match the competency ---------- */

    if (pkg.kind === "bayesian-cpt") {

        const competencyStates = (competency?.states || [])
            .slice()
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map(s => s.value);

        const fileStates = Object.keys(pkg.prior || {});

        if (competencyStates.length) {

            const unknownStates = fileStates.filter(s => !competencyStates.includes(s));
            const missingStates = competencyStates.filter(s => !fileStates.includes(s));

            if (unknownStates.length) {
                errors.push(
                    `Calibration file uses competency states that do not exist: ${unknownStates.join(", ")}. Expected: ${competencyStates.join(", ")}.`
                );
            }

            if (missingStates.length) {
                errors.push(
                    `Calibration file is missing competency state(s): ${missingStates.join(", ")}.`
                );
            }

            if (!unknownStates.length && !missingStates.length &&
                fileStates.join("|") !== competencyStates.join("|")) {
                warnings.push(
                    "State order in the file differs from the competency's declared order; monotonicity checks used the file's order."
                );
            }

        } else {
            warnings.push(
                "Target competency declares no states — CPT states could not be verified against the student model."
            );
        }
    }

    /* ---------- irt: subtype expectations ---------- */

    if (pkg.kind === "irt-parameters") {

        const subtype = (statisticalModel.subtype || "").toLowerCase();

        const anyNonUnitA = Object.values(pkg.parameters).some(
            p => isNum(p.a) && Math.abs(p.a - 1) > 0.01
        );

        const anyNonZeroC = Object.values(pkg.parameters).some(
            p => isNum(p.c) && p.c > 0
        );

        if ((subtype === "rasch" || subtype === "1pl") && anyNonUnitA) {
            warnings.push(
                `Model subtype is ${subtype.toUpperCase()}, which fixes discrimination at 1.0 — the a values in this file will be ignored at inference time.`
            );
        }

        if (subtype !== "3pl" && anyNonZeroC) {
            warnings.push(
                `Model subtype is ${subtype ? subtype.toUpperCase() : "unset"} — guessing (c) parameters in this file will be ignored at inference time.`
            );
        }

        if (subtype === "3pl" && !anyNonZeroC) {
            warnings.push(
                "Model subtype is 3PL but no guessing parameters were supplied; inference will fall back to c = 0.20."
            );
        }
    }

    return {
        errors,
        warnings,
        coverage: {
            scoped: scopedIds.length,
            supplied: fileIds.filter(id => scopedIds.includes(id)).length,
            missing,
            unknown,
            outOfScope,
        },
    };
}

/* =====================================================
   → RECALIBRATION PAYLOAD
===================================================== */

export function buildRecalibrationPayload({
    pkg,
    statisticalModelId,
    fileName = null,
}) {

    const parameters = { ...(pkg.parameters || {}) };

    parameters._kind = pkg.kind;

    if (pkg.kind === "irt-parameters" && pkg.scale) {
        parameters._scale = pkg.scale;
    }

    if (pkg.kind === "bayesian-cpt" && pkg.prior) {
        parameters._prior = pkg.prior;
    }

    if (pkg.fit) {
        parameters._fit = pkg.fit;
    }

    parameters._source = {
        fileName,
        fileVersion: pkg.fileVersion,
        importedAt: new Date().toISOString(),
    };

    return {
        statisticalModelId,
        parameters,
        calibratedBy: pkg.provenance?.calibratedBy || "unknown",
        calibrationMethod: pkg.provenance?.calibrationMethod || "calibration-file-import",
        sampleSize: Number(pkg.provenance?.sampleSize) || 0,
        packageVersion:
            (typeof pkg.provenance?.packageVersion === "string" && pkg.provenance.packageVersion.trim()) ||
            (typeof pkg.provenance?.software === "string" && pkg.provenance.software.trim()) ||
            "",
        // File import is only offered after parse validation; state success
        // explicitly so the server never invents converged:true from omission.
        converged: true,
        notes: [
            pkg.provenance?.notes,
            pkg.provenance?.population ? `Population: ${pkg.provenance.population}` : null,
            pkg.provenance?.software ? `Software: ${pkg.provenance.software}` : null,
            fileName ? `Source file: ${fileName}` : null,
        ]
            .filter(Boolean)
            .join(" | "),
    };
}

/* =====================================================
   DISPLAY HELPERS
===================================================== */

export function observableParameterEntries(parameters = {}) {
    return Object.entries(parameters).filter(([k]) => !isReservedParamKey(k));
}

export function parameterSetKind(parameterSet) {
    return parameterSet?.parameters?._kind || null;
}
