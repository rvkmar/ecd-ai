// EvidenceModelCalibration.jsx
// 🧠 Enterprise ECD — Calibration & Operationalization Workspace
// ---------------------------------------------------------------
// This is where an evidence model stops being a design artefact and
// becomes a measuring instrument. Everything that needs REAL numbers
// lives here rather than in the wizard, because a draft evidence model
// is forbidden by schema.js from carrying parameter sets at all:
//
//   Wizard (Step 6)   →  structure: type, subtype, observable mapping
//   Calibration       →  parameters, lifecycle, inference, decisions
//
// Moved in from EvidenceWizard/Step6StatisticalModel:
//   • lifecycle timeline   (now state-aware, was hard-coded to draft)
//   • posterior inference  (PosteriorPanel / PosteriorPanelMulti)
//   • IRT ability estimation (IRTInferencePanel)
//
// Added here:
//   • calibration intake — JSON package, CSV response matrix, manual
//   • append-only parameter set registry with drift comparison
//   • schema-correct decision rule editor
//   • operational readiness gate mirroring the server's own checks
// ---------------------------------------------------------------

import React, { useEffect, useMemo, useState } from "react";
import {
    ArrowLeft,
    CheckCircle2,
    FlaskConical,
    GitBranch,
    Layers,
    Lock,
    Scale,
    Upload,
} from "lucide-react";

import { useEvidenceModel } from "@/api/queries/evidenceModels";
import { useCompetencies } from "@/api/queries/competencies";
import { useTaskModels } from "@/api/queries/taskModels";

import EvidenceModelLifecyclePanel from "./calibration/panels/EvidenceModelLifecyclePanel";
import CalibrationImportPanel from "./calibration/panels/CalibrationImportPanel";
import ParameterSetRegistry from "./calibration/panels/ParameterSetRegistry";
import InferenceSandbox from "./calibration/panels/InferenceSandbox";
import DecisionRulePanel from "./calibration/panels/DecisionRulePanel";
import OperationalActivationPanel from "./calibration/panels/OperationalActivationPanel";

import {
    computeReadiness,
    resolveActiveParameterSet,
    resolveCalibrationWindow,
    resolveLifecycleStage,
} from "./calibration/engines/effectiveModel";

const TABS = [
    { id: "lifecycle", label: "Lifecycle", icon: GitBranch },
    { id: "calibration", label: "Fit parameters", icon: Upload },
    { id: "parameters", label: "Parameter Sets", icon: Layers },
    { id: "inference", label: "Inference", icon: FlaskConical },
    { id: "decision", label: "Decision & Activation", icon: Scale },
];

// Of the six stored statuses, these four have something to show here.
// Archived is included so a retired model stays inspectable (every panel
// renders read-only through resolveCalibrationWindow). Draft and reviewed
// are turned away: both are unlocked, so neither can hold a parameter set
// -- schema.js blocks parameterSets on anything unconfirmed outright.
const CALIBRATABLE_STATUSES = ["confirmed", "operational", "suspended", "archived"];

export default function EvidenceModelCalibration({
    model: initialModel,
    onBack,
    onUpdateModel,
}) {

    /* =====================================================
       LIVE MODEL
       Every mutation in this workspace invalidates this evidence
       model's query, so subscribing here keeps all five tabs in
       sync without prop threading or manual refetch.
    ===================================================== */

    const { data: liveModel } = useEvidenceModel(initialModel?.id, {
        initialData: initialModel,
    });

    const model = liveModel || initialModel;

    const { data: allCompetencies = [] } = useCompetencies();

    // Needed for the delivery-binding readiness check: an evidence model
    // may not go operational until a confirmed task model delivers its
    // observables. `undefined` while loading is deliberate -- computeReadiness
    // reports the check as pending rather than failed.
    const { data: allTaskModels } = useTaskModels();

    const competency = useMemo(
        () => (allCompetencies || []).find(c => c.id === model?.competencyId) || null,
        [allCompetencies, model?.competencyId]
    );

    /* =====================================================
       STATISTICAL MODEL SELECTION
    ===================================================== */

    const statisticalModels = model?.statisticalModels || [];

    const [selectedModelId, setSelectedModelId] = useState(
        () =>
            statisticalModels.find(m => m.active)?.id ||
            statisticalModels[0]?.id ||
            ""
    );

    useEffect(() => {
        if (!statisticalModels.length) return;
        if (statisticalModels.some(m => m.id === selectedModelId)) return;

        setSelectedModelId(
            statisticalModels.find(m => m.active)?.id || statisticalModels[0].id
        );
    }, [statisticalModels, selectedModelId]);

    const statisticalModel = useMemo(
        () => statisticalModels.find(m => m.id === selectedModelId) || null,
        [statisticalModels, selectedModelId]
    );

    const [tab, setTab] = useState("lifecycle");

    /* =====================================================
       DERIVED GOVERNANCE STATE
    ===================================================== */

    const stage = resolveLifecycleStage(model, allTaskModels ?? null);
    const calibrationWindow = resolveCalibrationWindow(model);
    const readiness = useMemo(
        () => computeReadiness(model, allTaskModels ?? null),
        [model, allTaskModels]
    );
    const activeParameterSet = resolveActiveParameterSet(statisticalModel);

    const observables = model?.observables || [];

    /* =====================================================
       GUARD
    ===================================================== */

    if (!model) {
        return <div className="p-6 text-sm text-slate-500">Loading evidence model…</div>;
    }

    if (!CALIBRATABLE_STATUSES.includes(model.status)) {

        return (

            <div className="mx-auto max-w-3xl space-y-4 p-6">

                <button
                    onClick={onBack}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                    <ArrowLeft size={16} strokeWidth={2.25} />
                    Back
                </button>

                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">
                    <strong className="font-semibold">
                        {model.status === "reviewed"
                            ? "This model is still under review."
                            : "This model is still a draft."}
                    </strong>
                    <p className="mt-1">
                        {resolveCalibrationWindow(model).reason}
                    </p>
                    {resolveCalibrationWindow(model).remedy && (
                        <p className="mt-1 text-xs text-amber-700">
                            {resolveCalibrationWindow(model).remedy}
                        </p>
                    )}
                </div>

            </div>

        );
    }

    /* =====================================================
       UI
    ===================================================== */

    return (

        <div className="mx-auto max-w-7xl space-y-6 p-6">

            {/* =====================================================
                HEADER
            ===================================================== */}

            <div className="flex flex-wrap items-start justify-between gap-4">

                <div className="min-w-0">

                    <div className="flex flex-wrap items-center gap-2">

                        <h2 className="text-2xl font-semibold text-slate-900">
                            Parameters &amp; Activation
                        </h2>

                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${stageBadgeClass(stage)}`}>
                            {stage}
                        </span>

                    </div>

                    <div className="mt-1.5 text-sm text-slate-600">
                        {model.name || "Untitled evidence model"}
                        <span className="text-slate-400"> · v{model.versionNumber || 1}</span>
                        {competency && (
                            <span className="text-slate-400">
                                {" · "}{competency.name} ({competency.variableType || "type unset"})
                            </span>
                        )}
                    </div>

                </div>

                <button
                    onClick={onBack}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                    <ArrowLeft size={16} strokeWidth={2.25} />
                    Back
                </button>

            </div>

            {/* =====================================================
                SUMMARY STRIP
            ===================================================== */}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

                <SummaryCard
                    label="Statistical model"
                    value={
                        statisticalModel
                            ? `${statisticalModel.type}${statisticalModel.subtype ? ` · ${statisticalModel.subtype}` : ""}`.toUpperCase()
                            : "None defined"
                    }
                    tone={statisticalModel ? "default" : "warn"}
                />

                <SummaryCard
                    label="Parameter sets"
                    value={`${statisticalModel?.parameterSets?.length || 0} on file`}
                    tone={statisticalModel?.parameterSets?.length ? "default" : "warn"}
                />

                <SummaryCard
                    label="Active calibration"
                    value={
                        activeParameterSet
                            ? `${activeParameterSet.calibrationMethod || "unspecified"} · n=${activeParameterSet.sampleSize ?? 0}`
                            : "None active"
                    }
                    tone={activeParameterSet ? "ok" : "warn"}
                />

                <SummaryCard
                    label="Operational readiness"
                    value={
                        readiness.ready
                            ? "All checks passed"
                            : `${readiness.checks.filter(c => !c.ok).length} check(s) outstanding`
                    }
                    tone={readiness.ready ? "ok" : "warn"}
                />

            </div>

            {/* =====================================================
                STATISTICAL MODEL SELECTOR
            ===================================================== */}

            {statisticalModels.length > 1 && (

                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">

                    <label className="text-sm font-medium text-slate-700">
                        Calibrating
                    </label>

                    <select
                        value={selectedModelId}
                        onChange={(e) => setSelectedModelId(e.target.value)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    >
                        {statisticalModels.map(m => (
                            <option key={m.id} value={m.id}>
                                {m.type}{m.subtype ? ` (${m.subtype})` : ""}{m.active ? " — active" : ""}
                            </option>
                        ))}
                    </select>

                    {statisticalModel && !statisticalModel.active && (
                        <span className="text-xs text-amber-700">
                            This model is not the active one — calibrating it will not
                            change how sessions are scored.
                        </span>
                    )}

                </div>

            )}

            {!statisticalModels.length && (

                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">
                    This evidence model defines no statistical model, so there is nothing
                    to calibrate. Clone it into a new version and add one in Step 6 of the
                    Evidence Wizard.
                </div>

            )}

            {/* =====================================================
                CALIBRATION WINDOW
                One banner, stated once, so the greyed-out controls
                further down are explained rather than mysterious.
            ===================================================== */}

            {!calibrationWindow.open && (

                <div className="flex items-start gap-3 rounded-lg border border-slate-300 bg-slate-100 px-4 py-3.5 text-sm text-slate-700">

                    <Lock size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-slate-500" />

                    <span>
                        <strong className="font-semibold">Calibration window closed.</strong>{" "}
                        {calibrationWindow.reason}
                        {calibrationWindow.remedy && (
                            <span className="mt-1 block text-xs text-slate-600">
                                {calibrationWindow.remedy}
                            </span>
                        )}
                    </span>

                </div>

            )}

            {/* =====================================================
                TABS
            ===================================================== */}

            <div className="border-b border-slate-200">

                <nav className="-mb-px flex flex-wrap gap-1">

                    {TABS.map(t => {

                        const Icon = t.icon;
                        const selected = tab === t.id;

                        return (

                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setTab(t.id)}
                                className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition ${selected
                                    ? "border-slate-900 text-slate-900"
                                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
                                    }`}
                            >
                                <Icon size={15} strokeWidth={2} />
                                {t.label}
                            </button>

                        );

                    })}

                </nav>

            </div>

            {/* =====================================================
                PANELS
            ===================================================== */}

            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">

                {tab === "lifecycle" && (
                    <EvidenceModelLifecyclePanel
                        evidenceModel={model}
                        activeStatModel={statisticalModel}
                        taskModels={allTaskModels ?? null}
                    />
                )}

                {tab === "calibration" && (
                    <CalibrationImportPanel
                        evidenceModel={model}
                        statisticalModel={statisticalModel}
                        observables={observables}
                        competency={competency}
                        onImported={() => setTab("parameters")}
                    />
                )}

                {tab === "parameters" && (
                    <ParameterSetRegistry
                        evidenceModel={model}
                        statisticalModel={statisticalModel}
                        observables={observables}
                    />
                )}

                {tab === "inference" && (
                    <InferenceSandbox
                        statisticalModel={statisticalModel}
                        observables={observables}
                        competency={competency}
                    />
                )}

                {tab === "decision" && (

                    <div className="space-y-8">

                        <DecisionRulePanel
                            evidenceModel={model}
                            competency={competency}
                            activeStatModel={readiness.activeStatModel}
                        />

                        <div className="border-t border-slate-200 pt-8">
                            <OperationalActivationPanel
                                model={model}
                                taskModels={allTaskModels ?? null}
                                onUpdateModel={onUpdateModel}
                            />
                        </div>

                    </div>

                )}

            </div>

        </div>

    );

}

/* =====================================================
   HELPERS
===================================================== */

function SummaryCard({ label, value, tone = "default" }) {

    const toneClass =
        tone === "ok"
            ? "border-emerald-200 bg-emerald-50"
            : tone === "warn"
                ? "border-amber-200 bg-amber-50"
                : "border-slate-200 bg-white";

    return (

        <div className={`rounded-lg border p-4 shadow-sm ${toneClass}`}>

            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {label}
            </div>

            <div className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-slate-900">
                {tone === "ok" && (
                    <CheckCircle2 size={15} strokeWidth={2.25} className="mt-0.5 shrink-0 text-emerald-600" />
                )}
                <span className="break-words">{value}</span>
            </div>

        </div>

    );

}

function stageBadgeClass(stage) {

    if (stage === "operational") return "bg-emerald-100 text-emerald-700";
    if (stage === "bound") return "bg-indigo-100 text-indigo-700";
    if (stage === "calibrated") return "bg-blue-100 text-blue-700";
    if (stage === "confirmed") return "bg-slate-200 text-slate-700";
    if (stage === "reviewed") return "bg-amber-100 text-amber-700";
    if (stage === "suspended") return "bg-orange-100 text-orange-700";
    if (stage === "archived") return "bg-slate-200 text-slate-500";

    return "bg-slate-100 text-slate-600";
}
