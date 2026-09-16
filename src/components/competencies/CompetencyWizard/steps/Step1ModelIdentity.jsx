// CompetencyWizard/steps/Step1ModelIdentity.jsx
// 🟢 Step 1 — Model Identity (Full Tailwind Refactor)
// Clean layout, improved validation feedback, locked-state UX alignment

import React, { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { useCompetencyWizard } from "../CompetencyWizardContext";

export default function Step1ModelIdentity() {
    const { model, updateModelField } = useCompetencyWizard();

    const [localErrors, setLocalErrors] = useState({});
    // Track which fields the user has actually interacted with, so errors
    // for an untouched, empty field aren't shown the instant Step 1 mounts
    // (previously "Model name must be at least 5 characters" appeared
    // immediately on a blank new model, before the user had typed or
    // blurred anything).
    const [touched, setTouched] = useState({ name: false, description: false });

    function markTouched(field) {
        setTouched((prev) => ({ ...prev, [field]: true }));
    }

    /* =====================================================
       🔹 VALIDATION
    ===================================================== */
    useEffect(() => {
        validate();
    }, [model?.name, model?.description]);

    function validate() {
        const errors = {};

        if (!model?.name || model.name.trim().length < 5) {
            errors.name = "Model name must be at least 5 characters.";
        }

        if (!model?.description || model.description.trim().length < 10) {
            errors.description =
                "Description should clearly describe the construct (min 10 characters).";
        }

        setLocalErrors(errors);
    }

    const isLocked = model?.locked;

    /* =====================================================
       🔹 COMPONENT LAYOUT
    ===================================================== */
    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-lg font-semibold text-slate-900">
                    Step 1 — Model Identity
                </h2>
                <p className="mt-1 text-sm text-slate-500 max-w-3xl">
                    Define the conceptual identity of this Student Model. This
                    represents the latent proficiency structure that will anchor all
                    downstream Evidence Models.
                </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-6">
                {/* Model Name */}
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
                        className={`w-full rounded-md border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${touched.name && localErrors.name
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

                {/* Model Description */}
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
                        className={`w-full rounded-md border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition resize-y placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${touched.description && localErrors.description
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
            </div>

            {/* Informational Panel */}
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
