// CompetencyWizard/steps/Step1ModelIdentity.jsx
// Step 1 — Model identity. Perspective is inherited from a Domain Analysis.

import React, { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { useCompetencyWizard } from "../CompetencyWizardContext";
import { useDomainAnalyses } from "@/api/queries/domainAnalyses";
import {
  PSYCHOLOGICAL_PERSPECTIVE_VALUES,
  psychologicalPerspectiveLabel,
} from "@/utils/ecdVocabulary";
import {
  applyDomainAnalysisChoice,
  rebuildPerspective,
} from "@/utils/perspectiveInheritance";

export default function Step1ModelIdentity() {
    const { model, updateModelField } = useCompetencyWizard();
    const { data: domainAnalyses = [], isLoading: analysesLoading } = useDomainAnalyses();
    const baselinePerspective = useRef(undefined);

    useEffect(() => {
        if (baselinePerspective.current !== undefined || !model) return;
        baselinePerspective.current = model.psychologicalPerspective || "";
    }, [model]);

    const [localErrors, setLocalErrors] = useState({});
    const [touched, setTouched] = useState({
        name: false,
        description: false,
        domainAnalysisId: false,
    });

    function markTouched(field) {
        setTouched((prev) => ({ ...prev, [field]: true }));
    }

    useEffect(() => {
        validate();
    }, [model?.name, model?.description, model?.psychologicalPerspective, model?.domainAnalysisId]);

    function validate() {
        const errors = {};

        if (!model?.name || model.name.trim().length < 5) {
            errors.name = "Model name must be at least 5 characters.";
        }

        if (!model?.description || model.description.trim().length < 10) {
            errors.description =
                "Description should clearly describe the construct (min 10 characters).";
        }

        if (!PSYCHOLOGICAL_PERSPECTIVE_VALUES.includes(model?.psychologicalPerspective)) {
            errors.domainAnalysisId =
                "Choose a Domain Analysis to inherit its psychological perspective.";
        }

        setLocalErrors(errors);
    }

    const isLocked = model?.locked;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-slate-900">
                    Step 1 — Model Identity
                </h2>
                <p className="mt-1 text-sm text-slate-500 max-w-3xl">
                    Define the conceptual identity of this Student Model (PADI TR9
                    §2.3.1 — what we are measuring). The psychological perspective
                    is declared on the Domain Analysis and inherited here.
                </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-6">
                <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        Model Name <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={model?.name || ""}
                        onChange={(e) => updateModelField("name", e.target.value)}
                        onBlur={() => markTouched("name")}
                        placeholder="e.g., Grade 8 Mathematics Competency Framework"
                        disabled={isLocked}
                        className={`w-full rounded-md border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${
                            touched.name && localErrors.name
                                ? "border-red-400 focus:ring-red-500/10 focus:border-red-500"
                                : "border-slate-300 focus:ring-slate-900/10 focus:border-slate-400"
                        }`}
                    />
                    {touched.name && localErrors.name && (
                        <p className="mt-1.5 text-xs font-medium text-red-600">
                            {localErrors.name}
                        </p>
                    )}
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                        value={model?.description || ""}
                        onChange={(e) => updateModelField("description", e.target.value)}
                        onBlur={() => markTouched("description")}
                        placeholder="Describe the theoretical basis and scope of this latent proficiency model."
                        rows={5}
                        disabled={isLocked}
                        className={`w-full rounded-md border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition resize-y placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${
                            touched.description && localErrors.description
                                ? "border-red-400 focus:ring-red-500/10 focus:border-red-500"
                                : "border-slate-300 focus:ring-slate-900/10 focus:border-slate-400"
                        }`}
                    />
                    {touched.description && localErrors.description && (
                        <p className="mt-1.5 text-xs font-medium text-red-600">
                            {localErrors.description}
                        </p>
                    )}
                </div>

                <PerspectiveInheritance
                    model={model}
                    analyses={domainAnalyses}
                    analysesLoading={analysesLoading}
                    baselinePerspective={baselinePerspective.current || ""}
                    isLocked={isLocked}
                    error={touched.domainAnalysisId ? localErrors.domainAnalysisId : ""}
                    onTouched={() => markTouched("domainAnalysisId")}
                    onChange={(next) => {
                        updateModelField("domainAnalysisId", next.domainAnalysisId);
                        if (next.psychologicalPerspective !== model?.psychologicalPerspective) {
                            updateModelField("psychologicalPerspective", next.psychologicalPerspective);
                        }
                    }}
                />
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3.5 text-sm text-blue-800">
                <Info size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
                <p>
                    <strong>ECD Principle:</strong> The Student Model defines the
                    latent variables representing student knowledge, skills, and
                    abilities. It must remain free from task or observable detail.
                </p>
            </div>
        </div>
    );
}

function PerspectiveInheritance({
    model,
    analyses,
    analysesLoading,
    baselinePerspective,
    isLocked,
    error,
    onTouched,
    onChange,
}) {
    const inheritable = analyses.filter((row) =>
        PSYCHOLOGICAL_PERSPECTIVE_VALUES.includes(row.psychologicalPerspective)
    );
    const selected = inheritable.find((row) => row.id === model?.domainAnalysisId);
    const stored = PSYCHOLOGICAL_PERSPECTIVE_VALUES.includes(model?.psychologicalPerspective)
        ? model.psychologicalPerspective
        : "";
    const declared = selected?.psychologicalPerspective || "";
    const awaitingRebuild = Boolean(stored && declared && stored !== declared);

    function choose(id) {
        onTouched();
        onChange(
            applyDomainAnalysisChoice({
                model,
                domainAnalysisId: id,
                analyses: inheritable,
                baselinePerspective,
            })
        );
    }

    return (
        <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="domain-analysis">
                Domain Analysis
            </label>
            <p className="mb-2 text-xs text-slate-500">
                The psychological perspective is declared on the Domain Analysis.
                This Student Model inherits it.
            </p>
            <select
                id="domain-analysis"
                value={model?.domainAnalysisId || ""}
                disabled={isLocked || analysesLoading}
                onBlur={onTouched}
                onChange={(event) => choose(event.target.value)}
                className={`w-full rounded-md border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-400 ${
                    error
                        ? "border-red-400 focus:ring-red-500/10 focus:border-red-500"
                        : "border-slate-300 focus:ring-slate-900/10 focus:border-slate-400"
                }`}
            >
                <option value="">
                    {stored ? "Keep the perspective stored on this model" : "Choose a Domain Analysis"}
                </option>
                {inheritable.map((row) => (
                    <option key={row.id} value={row.id}>
                        {row.name} — {psychologicalPerspectiveLabel(row.psychologicalPerspective)}
                    </option>
                ))}
            </select>
            {analysesLoading && (
                <p className="mt-1.5 text-xs text-slate-500">Loading domain analyses…</p>
            )}
            {!analysesLoading && inheritable.length === 0 && (
                <p className="mt-1.5 text-xs text-slate-500">
                    No Domain Analysis has a perspective yet. Declare one under Models → Domain Analysis.
                </p>
            )}
            {stored && (
                <p className="mt-2 text-sm text-slate-700">
                    Perspective: {psychologicalPerspectiveLabel(stored)}
                    {selected && !awaitingRebuild ? ` Inherited from ${selected.name}.` : ""}
                    {awaitingRebuild
                        ? " Stored on this model until you rebuild it from the Domain Analysis."
                        : ""}
                    {!selected && baselinePerspective ? " Stored on this model until you rebuild it from a Domain Analysis." : ""}
                </p>
            )}
            {awaitingRebuild && !isLocked && (
                <button
                    type="button"
                    className="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800 hover:border-slate-400"
                    onClick={() => onChange(rebuildPerspective(model, inheritable))}
                >
                    Rebuild from Domain Analysis
                </button>
            )}
            {error && (
                <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
            )}
        </div>
    );
}
