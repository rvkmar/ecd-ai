// CompetencyWizard/steps/Step1ModelIdentity.jsx
// Step 1 — Model Identity + psychological perspective (TR9 §2.3.1)

import React, { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { useCompetencyWizard } from "../CompetencyWizardContext";
import { PSYCHOLOGICAL_PERSPECTIVES } from "@/utils/ecdVocabulary";

export default function Step1ModelIdentity() {
    const { model, updateModelField } = useCompetencyWizard();

    const [localErrors, setLocalErrors] = useState({});
    const [touched, setTouched] = useState({
        name: false,
        description: false,
        psychologicalPerspective: false,
    });

    function markTouched(field) {
        setTouched((prev) => ({ ...prev, [field]: true }));
    }

    useEffect(() => {
        validate();
    }, [model?.name, model?.description, model?.psychologicalPerspective]);

    function validate() {
        const errors = {};

        if (!model?.name || model.name.trim().length < 5) {
            errors.name = "Model name must be at least 5 characters.";
        }

        if (!model?.description || model.description.trim().length < 10) {
            errors.description =
                "Description should clearly describe the construct (min 10 characters).";
        }

        if (!model?.psychologicalPerspective) {
            errors.psychologicalPerspective =
                "Select the psychological perspective this Student Model claims (TR9).";
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
                    §2.3.1 — what we are measuring). Include the psychological
                    perspective that warrants later Evidence Model choices.
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

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        Psychological Perspective <span className="text-red-500">*</span>
                    </label>
                    <p className="mb-2 text-xs text-slate-500">
                        TR9 grounds the Student Model claim stance (e.g. trait vs
                        information-processing) so Evidence Models stay coherent.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {PSYCHOLOGICAL_PERSPECTIVES.map((p) => {
                            const selected = model?.psychologicalPerspective === p.value;
                            return (
                                <button
                                    key={p.value}
                                    type="button"
                                    disabled={isLocked}
                                    onClick={() => {
                                        markTouched("psychologicalPerspective");
                                        updateModelField("psychologicalPerspective", p.value);
                                    }}
                                    className={`rounded-lg border p-3 text-left text-sm transition ${
                                        selected
                                            ? "border-slate-900 bg-slate-50"
                                            : "border-slate-200 bg-white hover:border-slate-400"
                                    } disabled:cursor-not-allowed disabled:opacity-60`}
                                >
                                    <div className="font-semibold text-slate-800">{p.label}</div>
                                    <div className="mt-1 text-xs text-slate-500">{p.hint}</div>
                                </button>
                            );
                        })}
                    </div>
                    {touched.psychologicalPerspective && localErrors.psychologicalPerspective && (
                        <p className="mt-1.5 text-xs font-medium text-red-600">
                            {localErrors.psychologicalPerspective}
                        </p>
                    )}
                </div>
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
