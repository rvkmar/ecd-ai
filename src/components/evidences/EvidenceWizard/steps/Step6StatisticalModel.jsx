// Step6StatisticalModel.jsx
// 🧠 Enterprise ECD — Step 6: Statistical Model (Structure Only)
// --------------------------------------------------------
// ✔ Full Evidence Chain Awareness
// ✔ Structural → Statistical Bridge
// ✔ Evidence Integrity Validation
// ✔ Model Configuration + Visualization + Diagnostics
//
// SCOPE BOUNDARY (see EvidenceModelCalibration):
// Step 6 defines model STRUCTURE only -- type, subtype, observable
// mapping, structureConfig. It deliberately renders no lifecycle,
// posterior or IRT inference panel: a draft evidence model has no
// parameter sets (schema.js blocks them outright), so those panels
// could only ever show placeholder priors and b = 0 defaults, and
// the lifecycle stage they displayed never advanced past "draft".
// Lifecycle, posterior inference and IRT ability estimation now live
// in the Calibration & Operationalization workspace, where real
// calibrated parameter sets exist.

import React, { useEffect, useMemo } from "react";
import { Plus, AlertTriangle, CheckCircle2 } from "lucide-react";

import { useEvidenceWizardContext } from "../EvidenceWizardContext";

import Step6WorkspaceLayout
    from "../components/layout/Step6WorkspaceLayout";

import BayesianEvidenceNetwork
    from "../components/visualization/BayesianEvidenceNetwork";

import ModelComparisonPanel
    from "../components/panels/ModelComparisonPanel";

import StatisticalModelCard
    from "../components/modelCards/StatisticalModelCard";

import ModelValidationPanel
    from "../components/validation/ModelValidationPanel";

import ModelFeasibilityPanel
    from "../components/validation/ModelFeasibilityPanel";

import { validateStatisticalModels }
    from "../components/utils/modelValidationEngine";

export default function Step6StatisticalModel({
    onValidityChange,
    locked
}) {

    /* =====================================================
       CONTEXT
    ===================================================== */

    const {

        draftModel,

        addStatisticalModel,
        updateStatisticalModel,
        removeStatisticalModel,

        selectedCompetency,
        competencies,
        competencyModels

    } = useEvidenceWizardContext();


    /* =====================================================
       CORE DATA (STRICT ECD)
    ===================================================== */

    const models = draftModel?.statisticalModels || [];
    const observables = draftModel?.observables || [];
    const warrants = draftModel?.warrants || [];
    const evidenceRules = draftModel?.evidenceRules || [];

    const variableType =
        selectedCompetency?.variableType;

    const competencyName =
        selectedCompetency?.name || "Competency";


    /* =====================================================
       COMPETENCY CONTEXT
    ===================================================== */

    const targetCompetencyId =
        draftModel?.competencyId ||
        draftModel?.claimCompetencyId;

    const activeCompetency = useMemo(() => {

        return competencies?.find(
            c => c.id === targetCompetencyId
        );

    }, [competencies, targetCompetencyId]);


    const activeModel = useMemo(() => {

        if (!activeCompetency) return null;

        return competencyModels?.find(
            m => m.id === activeCompetency.modelId
        );

    }, [activeCompetency, competencyModels]);


    const constructLabel = activeCompetency
        ? `${activeCompetency.domain} → ${activeCompetency.strand} → ${activeCompetency.facet}`
        : "Unassigned Construct";


    /* =====================================================
       EVIDENCE INTEGRITY (NEW — CRITICAL)
    ===================================================== */

    const evidenceHealth = useMemo(() => {

        let missingWarrant = 0;
        let missingRule = 0;

        observables.forEach(o => {

            if (!o.warrantId) missingWarrant++;

            const hasRule = evidenceRules.some(
                r => r.observableId === o.id
            );

            if (!hasRule) missingRule++;

        });

        return {
            total: observables.length,
            missingWarrant,
            missingRule,
            valid:
                observables.length > 0 &&
                missingWarrant === 0 &&
                missingRule === 0
        };

    }, [observables, evidenceRules]);

    /* VALIDATION BRIDGE */

    const bridgeValidation = useMemo(() => {

        const issues = [];

        evidenceRules.forEach(rule => {

            // Weakens + IRT warning
            if (
                rule.direction === "weakens" &&
                models.some(m => m.type === "irt")
            ) {
                issues.push(
                    `Observable ${rule.observableId}: 'weakens' not directly supported in IRT. Consider reverse scoring or recoding.`
                );
            }

            // Neutral + IRT warning
            if (
                rule.direction === "neutral" &&
                models.some(m => m.type === "irt")
            ) {
                issues.push(
                    `Observable ${rule.observableId}: 'neutral' evidence has no effect in IRT.`
                );
            }

            // Strength sanity check
            if (rule.strengthLevel >= 5 && models.length === 0) {
                issues.push(
                    `Observable ${rule.observableId}: high strength defined but no statistical model present.`
                );
            }

        });

        return {
            valid: issues.length === 0,
            issues
        };

    }, [evidenceRules, models]);

    /* =====================================================
       MODEL VALIDATION
    ===================================================== */

    const validation = useMemo(() => {

        return validateStatisticalModels({
            models,
            observables,
            variableType
        });

    }, [models, observables, variableType]);


    /* =====================================================
       STEP VALIDITY
    ===================================================== */

    useEffect(() => {

        if (!onValidityChange) return;

        const finalValid =
            validation.valid &&
            evidenceHealth.valid &&
            bridgeValidation.valid;

        onValidityChange(finalValid);

    }, [validation.valid, evidenceHealth.valid, bridgeValidation.valid]);


    /* =====================================================
       MODEL HANDLERS
    ===================================================== */

    const createModel = () => {

        addStatisticalModel({

            id: `sm_${Date.now()}`,
            type: "",
            subtype: "",
            active: models.length === 0,
            structureConfig: {
                observableIds: [],
                prior: {
                    L1: 0.2,
                    L2: 0.5,
                    L3: 0.3
                },
                norm: {
                    mean: 0,
                    sd: 1,
                    // Was `"normal" | "empirical" | "group"` -- valid JS, but
                    // it is a bitwise OR of three strings, which evaluates
                    // to the number 0, not a union type. Every new model was
                    // created with norm.type === 0.
                    type: "normal", // "normal" | "empirical" | "group"
                    groupKey: "tamilnadu",
                    distribution: [] // θ values
                },
                cpt: {} // initialize
            },
            parameterSets: [],
            activeParameterSetId: null

        });

    };


    const setActiveModel = (targetId) => {

        models.forEach(m => {

            updateStatisticalModel(m.id, {
                ...m,
                active: m.id === targetId
            });

        });

    };


    /* =====================================================
       ACTIVE MODEL
    ===================================================== */

    const activeStatModel =
        models.find(m => m.active);


    /* =====================================================
       UI
    ===================================================== */

    return (

        <div className="space-y-8">

            {/* =====================================================
                HEADER
            ===================================================== */}

            <div>

                <h2 className="text-lg font-semibold text-slate-900">
                    Statistical Model
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                    Configure how observable evidence updates belief
                    in the competency claim using formal statistical models.
                </p>

            </div>


            {/* =====================================================
                COMPETENCY CONTEXT
            ===================================================== */}

            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-3">

                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Target Competency
                </div>

                <div className="text-sm font-semibold text-slate-900">
                    {activeCompetency?.name}
                </div>

                <div className="flex flex-wrap gap-2">

                    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-600">
                        {activeModel?.name}
                    </span>

                    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide bg-blue-100 text-blue-700">
                        {activeCompetency?.variableType}
                    </span>

                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">

                    <div className="text-xs text-slate-500">
                        Claim
                    </div>

                    <div className="text-sm text-slate-800">
                        {draftModel?.claimStatement}
                    </div>

                </div>

                <div className="text-sm text-slate-600">

                    <strong className="text-slate-800">Construct:</strong>
                    <div className="text-slate-900">
                        {constructLabel}
                    </div>

                </div>

                {!locked && (
                    <div className="flex justify-end">

                        <button
                            onClick={createModel}
                            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                        >
                            <Plus size={16} strokeWidth={2.25} />
                            Add Statistical Model
                        </button>

                    </div>
                )}

            </div>


            {/* =====================================================
                EVIDENCE HEALTH PANEL (NEW)
            ===================================================== */}

            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 text-sm space-y-2">

                <div className="text-sm font-semibold text-slate-800">
                    Evidence Integrity Check
                </div>

                <div className="text-slate-600">Total Observables: {evidenceHealth.total}</div>

                {evidenceHealth.missingWarrant > 0 && (
                    <div className="flex items-center gap-1.5 text-red-600">
                        <AlertTriangle size={14} strokeWidth={2.25} />
                        Missing Warrants: {evidenceHealth.missingWarrant}
                    </div>
                )}

                {evidenceHealth.missingRule > 0 && (
                    <div className="flex items-center gap-1.5 text-red-600">
                        <AlertTriangle size={14} strokeWidth={2.25} />
                        Missing Evidence Rules: {evidenceHealth.missingRule}
                    </div>
                )}

                {evidenceHealth.valid && (
                    <div className="flex items-center gap-1.5 text-emerald-700">
                        <CheckCircle2 size={14} strokeWidth={2.25} />
                        Evidence chain complete
                    </div>
                )}

            </div>

            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 text-sm space-y-2">

                <div className="text-sm font-semibold text-slate-800">
                    Evidence → Model Alignment
                </div>

                {bridgeValidation.valid ? (
                    <div className="flex items-center gap-1.5 text-emerald-700">
                        <CheckCircle2 size={14} strokeWidth={2.25} />
                        Evidence rules compatible with selected model
                    </div>
                ) : (
                    bridgeValidation.issues.map((issue, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-red-600">
                            <AlertTriangle size={14} strokeWidth={2.25} className="mt-0.5 shrink-0" />
                            {issue}
                        </div>
                    ))
                )}

            </div>

            {/* =====================================================
                MODEL COMPARISON
            ===================================================== */}

            {models.length > 1 && (

                <ModelComparisonPanel
                    models={models}
                    onSetActive={setActiveModel}
                />

            )}


            {/* =====================================================
                WORKSPACE
            ===================================================== */}

            <Step6WorkspaceLayout

                left={

                    <div className="space-y-6">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-800">Statistical Model List</h3>
                        </div>

                        {models.length === 0 && (

                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">

                                No statistical models defined yet.

                            </div>

                        )}

                        {models.map(model => (

                            <StatisticalModelCard
                                key={model.id}
                                model={model}
                                observables={observables}
                                warrants={warrants}
                                evidenceRules={evidenceRules}
                                selectedCompetency={selectedCompetency}
                                onRemove={removeStatisticalModel}
                                onSetActive={setActiveModel}
                                onUpdateModel={updateStatisticalModel}
                                locked={locked}
                            />

                        ))}

                    </div>

                }

            />

            {/* =====================================================
                INFERENCE PREVIEW — MOVED
                -----------------------------------------------------
                Posterior inference (PosteriorPanel /
                PosteriorPanelMulti) and IRT ability estimation
                (IRTInferencePanel) now live in
                src/components/evidences/calibration/panels/ and are
                rendered by the Parameters & Activation
                workspace against a real active parameter set.
            ===================================================== */}

            {activeStatModel && (

                <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-xs text-slate-600">

                    <CheckCircle2 size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-slate-400" />

                    <span>
                        Posterior / IRT inference previews run against
                        calibrated parameters, which only exist once this
                        evidence model is confirmed. Confirm the model, then
                        open <strong className="font-semibold text-slate-800">Evidence Model parameters</strong> from
                        the evidence model list to estimate parameters and
                        exercise the inference panels.
                    </span>

                </div>

            )}

            {/* =====================================================
                EVIDENCE NETWORK (UPGRADED)
                ===================================================== */}

            {["bayesian_network"].includes(activeStatModel?.type) && (
                <BayesianEvidenceNetwork
                    observables={observables}
                    warrants={warrants}
                    competencyName={competencyName}
                    modelType={activeStatModel?.type}
                />
            )}

            {/* {["bayesian_network"].includes(activeStatModel?.type) ? (
                <BayesianEvidenceNetwork
                    observables={observables}
                    warrants={warrants}
                    competencyName={competencyName}
                    modelType={activeStatModel?.type}
                />

            ) : (

                <div className="border rounded p-4 bg-gray-50 text-sm text-gray-600">
                    Evidence network visualization is available only for Bayesian models.
                </div>

            )} */}

        </div>

    );

}