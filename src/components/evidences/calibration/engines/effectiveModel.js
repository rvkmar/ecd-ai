// effectiveModel.js
// 🧠 Enterprise ECD — Structure + Active Parameter Set Overlay
// ---------------------------------------------------------------
// The inference panels (PosteriorPanel, PosteriorPanelMulti,
// IRTInferencePanel) were written for the wizard, where a statistical
// model's numbers live in `structureConfig` (authoring defaults: a
// hand-entered CPT, a uniform prior, a nominal N(0,1) norm).
//
// In the calibration workspace those numbers come from the ACTIVE
// parameter set instead -- structureConfig is locked once the evidence
// model is confirmed, and it must stay locked: schema.js version-locks
// structure so historical sessions remain comparable. Recalibration is
// allowed to change parameters precisely because parameters live in an
// append-only parameterSets list, not in structure.
//
// buildEffectiveStatisticalModel() bridges the two: it returns a
// throwaway copy of the statistical model whose structureConfig has
// been overlaid with the active parameter set's values, so the existing
// panels render calibrated numbers without any of them learning about
// parameter sets. Nothing here mutates the stored model.
// ---------------------------------------------------------------

import { observableParameterEntries } from "./calibrationFile.js";

export function resolveActiveParameterSet(statisticalModel) {

    const sets = statisticalModel?.parameterSets || [];

    if (!sets.length) return null;

    return (
        sets.find(
            ps => ps.parameterSetId === statisticalModel.activeParameterSetId
        ) || null
    );
}

export function buildEffectiveStatisticalModel(statisticalModel) {

    if (!statisticalModel) return null;

    const active = resolveActiveParameterSet(statisticalModel);

    const structureConfig = { ...(statisticalModel.structureConfig || {}) };

    if (!active) {
        return {
            ...statisticalModel,
            structureConfig,
            __calibrated: false,
            __activeParameterSet: null,
        };
    }

    const params = active.parameters || {};
    const kind = params._kind;

    /* ---------- Bayesian: CPT + prior come from the parameter set ---------- */

    if (kind === "bayesian-cpt") {

        const cpt = {};

        observableParameterEntries(params).forEach(([obsId, entry]) => {
            if (entry && entry.levels) {
                cpt[obsId] = { levels: entry.levels };
            }
        });

        if (Object.keys(cpt).length) {
            structureConfig.cpt = cpt;
        }

        if (params._prior) {
            structureConfig.prior = params._prior;
        }
    }

    /* ---------- IRT: reporting scale comes from the parameter set ---------- */

    if (kind === "irt-parameters" && params._scale) {

        const existing = structureConfig.norm || {};

        // An empirical/group norm carries a real theta distribution that
        // the calibration file's summary scale must not overwrite.
        const hasEmpiricalNorm =
            Array.isArray(existing.distribution) && existing.distribution.length >= 30;

        if (!hasEmpiricalNorm) {
            structureConfig.norm = {
                ...existing,
                type: existing.type === "group" ? "group" : "normal",
                mean: Number.isFinite(params._scale.mean) ? params._scale.mean : (existing.mean ?? 0),
                sd: Number.isFinite(params._scale.sd) ? params._scale.sd : (existing.sd ?? 1),
            };
        }
    }

    return {
        ...statisticalModel,
        structureConfig,
        __calibrated: true,
        __activeParameterSet: active,
    };
}

/* =====================================================
   READINESS
   Mirrors the server-side gate in
   POST /api/evidenceModels/:id/activate so the UI never
   offers a button the backend will reject.
===================================================== */

/* Mirrors BINDING_TASK_MODEL_STATUSES in server/routes/evidenceModels.js.
   A draft task model does not count: it is still being authored and can
   drop the link or be deleted at any moment. */
export const BINDING_TASK_MODEL_STATUSES = ["confirmed", "operational", "suspended"];

export function linkedTaskModels(evidenceModelId, taskModels = []) {

    return (taskModels || []).filter(
        tm =>
            Array.isArray(tm.evidenceModelIds) &&
            tm.evidenceModelIds.includes(evidenceModelId) &&
            BINDING_TASK_MODEL_STATUSES.includes(tm.status)
    );
}

/**
 * @param evidenceModel
 * @param taskModels  every task model in the system. Pass `null` (the
 *   default) when the list has not loaded yet: the delivery-binding check
 *   then reports as PENDING rather than failing, so a slow query never
 *   makes a perfectly ready model look broken.
 */
export function computeReadiness(evidenceModel, taskModels = null) {

    const activeStatModel =
        evidenceModel?.statisticalModels?.find(sm => sm.active) || null;

    const taskModelsKnown = Array.isArray(taskModels);

    const bound = taskModelsKnown
        ? linkedTaskModels(evidenceModel?.id, taskModels)
        : [];

    const referencing = taskModelsKnown
        ? (taskModels || []).filter(
            tm =>
                Array.isArray(tm.evidenceModelIds) &&
                tm.evidenceModelIds.includes(evidenceModel?.id)
        )
        : [];

    const dr = evidenceModel?.decisionRule;

    const hasDecisionRule =
        !!dr &&
        typeof dr === "object" &&
        !!dr.type &&
        typeof dr.threshold === "number" &&
        ["above", "below", "within"].includes(dr.direction) &&
        typeof dr.justification === "string" &&
        dr.justification.length >= 10;

    const checks = [
        {
            id: "activeStatModel",
            label: "Active statistical model selected",
            ok: !!activeStatModel,
            remedy: "Mark one statistical model active in the evidence model wizard.",
        },
        {
            id: "parameterSets",
            label: "At least one calibrated parameter set",
            ok: !!activeStatModel?.parameterSets?.length,
            remedy: "Import a calibration file or a response matrix in the Calibration tab.",
        },
        {
            id: "activeParameterSet",
            label: "Active parameter set designated",
            ok: !!activeStatModel?.activeParameterSetId,
            remedy:
                "Activate one parameter set. Scoring and adaptive selection read the active set. A confirmed model may hold candidates until then.",
        },
        {
            id: "decisionRule",
            label: "Complete decision rule (type, threshold, direction, justification)",
            ok: hasDecisionRule,
            remedy: "Complete every field in the Decision Rule tab.",
        },
        {
            id: "taskModelBinding",
            label: "Bound to a confirmed task model",
            ok: taskModelsKnown ? bound.length > 0 : false,
            pending: !taskModelsKnown,
            detail: taskModelsKnown && bound.length
                ? bound.map(tm => tm.name || tm.id).join(", ")
                : null,
            remedy: !taskModelsKnown
                ? "Checking task models…"
                : referencing.length > 0 && bound.length === 0
                    ? `${referencing.length} task model(s) reference this evidence model but none is confirmed. Confirm one in the Task Model builder.`
                    : "Create a task model that uses this evidence model and confirm it. An evidence model observes nothing on its own — a task model is what puts its observables in front of a learner.",
        },
    ];

    return {
        activeStatModel,
        checks,
        boundTaskModels: bound,
        // A pending check is not a pass. Activation stays disabled until the
        // task model list actually arrives.
        ready: checks.every(c => c.ok),
    };
}

/* =====================================================
   CALIBRATION WINDOW (client mirror of the server gate)
   -----------------------------------------------------
   Mirrors calibrationGate() in server/routes/evidenceModels.js. The
   point of having it here is that the UI must not OFFER an action the
   server will refuse: the previous build left Import and Save Decision
   Rule enabled on an operational model, so the operator pressed them
   and got "Recalibration allowed only after confirmation" back -- a
   message that is both alarming and, on a model that is well past
   confirmation, actively misleading.
===================================================== */

export const CALIBRATION_STATUSES = ["confirmed", "suspended"];

export function resolveCalibrationWindow(evidenceModel) {

    const status = evidenceModel?.status || "draft";

    if (status === "reviewed") {
        return {
            open: false,
            status,
            reason: "This model is under structural review and is not confirmed yet. Review is deliberately an unlocked state — the structure can still change in response to the reviewer, which is exactly why parameters estimated against it would not mean anything.",
            remedy: "Complete the review and confirm the model, then calibration opens.",
        };
    }

    if (!evidenceModel?.locked || status === "draft") {
        return {
            open: false,
            status,
            reason: "The evidence model is still a draft. Confirm it in the Evidence Wizard first — a draft cannot hold parameters, because its structure can still change.",
            remedy: null,
        };
    }

    if (status === "operational") {
        return {
            open: false,
            status,
            reason: "This model is live. Parameters and the decision rule are frozen while it is scoring sessions.",
            remedy: "Deactivate it (Decision & Activation → Deactivate) to reopen the calibration window, then reactivate when the change is verified.",
        };
    }

    if (status === "archived") {
        return {
            open: false,
            status,
            reason: "This model is archived. Archived models are read-only.",
            remedy: "Clone it into a new version to continue working.",
        };
    }

    if (!CALIBRATION_STATUSES.includes(status)) {
        return {
            open: false,
            status,
            reason: `Calibration is not available for a model with status '${status}'.`,
            remedy: null,
        };
    }

    return { open: true, status, reason: null, remedy: null };
}

/* =====================================================
   LIFECYCLE STAGE RESOLUTION
===================================================== */

/* The six stored statuses (draft, reviewed, confirmed, operational,
   suspended, archived) plus two DERIVED stages that subdivide "confirmed".
   Both answer a question `status` alone cannot:
     calibrated -- does it have an active parameter set?
     bound      -- does a confirmed task model deliver its observables?
   Those are the two remaining gates between confirmation and going live,
   so a flat "confirmed" hides exactly the thing the operator needs to know
   next. */
export const LIFECYCLE_STAGES = [
    "draft",
    "reviewed",
    "confirmed",
    "calibrated",
    "bound",
    "operational",
    "suspended",
    "archived",
];

/**
 * @param evidenceModel
 * @param taskModels  every task model, or `null` when not loaded. With
 *   `null` the binding gate cannot be evaluated, so a calibrated model
 *   resolves no further than "calibrated" -- never optimistically "bound".
 */
export function resolveLifecycleStage(evidenceModel, taskModels = null) {

    const status = evidenceModel?.status;

    if (status === "archived") return "archived";
    if (status === "suspended") return "suspended";
    if (status === "operational") return "operational";
    if (status === "reviewed") return "reviewed";

    if (status === "confirmed") {

        const activeStatModel =
            evidenceModel?.statisticalModels?.find(sm => sm.active);

        if (!activeStatModel?.activeParameterSetId) return "confirmed";

        if (!Array.isArray(taskModels)) return "calibrated";

        return linkedTaskModels(evidenceModel?.id, taskModels).length > 0
            ? "bound"
            : "calibrated";
    }

    return "draft";
}
