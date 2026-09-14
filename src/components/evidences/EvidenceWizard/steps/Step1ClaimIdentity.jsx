// Step1ClaimIdentity.jsx
// 🧠 Extreme Strict ECD — Step 1: Structural Claim Identity
// -----------------------------------------------------------
// ✔ Single competency binding
// ✔ Auto competencyModelVersion binding
// ✔ Hard reset of downstream layers
// ✔ Unidimensional enforcement
// ✔ No claim articulation here
// ✔ No inferential validation here
// ✔ Pure structural alignment with schema

import { useEffect, useMemo, useState } from "react";
import { useEvidenceWizardContext } from "../EvidenceWizardContext";
import CompetencyStructuralPanel from "../components/CompetencyStructuralPanel";
import {
    isLinkableCompetencyModel,
    LINKABLE_EVIDENCE_MODEL_STATUSES,
} from "@/utils/schema";

const inputBase =
    "w-full rounded-md border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed";

function fieldClass(hasError) {
    return `${inputBase} ${hasError
        ? "border-red-400 focus:ring-red-500/10 focus:border-red-500"
        : "border-slate-300 focus:ring-slate-900/10 focus:border-slate-400"
        }`;
}

export default function Step1ClaimIdentity({ onValidityChange, locked }) {

    const {
        draftModel,
        updateField,
        competencies,
        competencyModels,
        evidenceModels,
        selectedCompetency,
        selectedCompetencyModel,
        selectedModelMeta
    } = useEvidenceWizardContext();

    const [errors, setErrors] = useState({});

    /* =====================================================
       1️⃣ GROUP CONFIRMED COMPETENCIES
    ===================================================== */

    const groupedCompetencies = useMemo(() => {

        const groups = {};

        (competencies || []).forEach((comp) => {

            const model = competencyModels.find(
                m => m.id === comp.modelId && isLinkableCompetencyModel(m)
            );

            if (!model) return;

            if (!groups[model.id]) {
                groups[model.id] = {
                    modelId: model.id,
                    modelName: model.name,
                    versionNumber: model.versionNumber,
                    measurementIntent: model.measurementIntent,
                    competencies: []
                };
            }

            groups[model.id].competencies.push(comp);
        });

        return Object.values(groups).sort(
            (a, b) => (b.versionNumber || 0) - (a.versionNumber || 0)
        );

    }, [competencies, competencyModels]);

    /* =====================================================
       2️⃣ VALIDATION (STRUCTURAL ONLY)
    ===================================================== */

    useEffect(() => {

        const newErrors = {};

        // Evidence Model name
        if (!draftModel.name || draftModel.name.trim().length < 3) {
            newErrors.name = "Evidence Model name must be ≥ 3 characters.";
        }

        // Description
        if (!draftModel.description || draftModel.description.trim().length < 10) {
            newErrors.description = "Description must be ≥ 10 characters.";
        }

        // Competency binding
        if (!draftModel.competencyId) {
            newErrors.competencyId = "Primary Competency is required.";
        }

        // 🔒 Unidimensional enforcement
        if (
            selectedModelMeta?.measurementIntent === "unidimensional" &&
            draftModel.competencyId
        ) {

            const otherConfirmed = (evidenceModels || []).filter(
                em =>
                    LINKABLE_EVIDENCE_MODEL_STATUSES.includes(em.status) &&
                    em.competencyId !== draftModel.competencyId &&
                    em.competencyModelVersion === selectedModelMeta?.versionNumber
            );

            if (otherConfirmed.length > 0) {
                newErrors.competencyId =
                    "Unidimensional competency model already has confirmed evidence for another competency.";
            }
        }

        setErrors(newErrors);
        onValidityChange(Object.keys(newErrors).length === 0);

    }, [
        draftModel.name,
        draftModel.description,
        draftModel.competencyId,
        selectedModelMeta
    ]);

    /* =====================================================
       3️⃣ HARD STRUCTURAL RESET
    ===================================================== */

    function handleCompetencyChange(newId) {

        const newCompetency = competencies.find(c => c.id === newId);
        const newModel = competencyModels.find(
            m => m.id === newCompetency?.modelId
        );

        // 🔒 Bind competency
        updateField("competencyId", newId);

        // 🔒 Bind competencyModelVersion (STRICT VERSION LOCK)
        updateField(
            "competencyModelVersion",
            newModel?.versionNumber || null
        );

        // 🔒 FULL DOWNSTREAM RESET
        updateField("claimStatement", "");   // handled in Step 2
        updateField("warrants", []);
        updateField("observables", []);
        updateField("statisticalModels", []);
        updateField("decisionRule", null);
    }

    /* =====================================================
       4️⃣ SORT STATES
    ===================================================== */

    const sortedStates = useMemo(() => {
        if (!selectedCompetency?.states) return [];
        return [...selectedCompetency.states].sort(
            (a, b) => (a.order ?? 0) - (b.order ?? 0)
        );
    }, [selectedCompetency]);

    /* =====================================================
       UI
    ===================================================== */

    return (
        <div className="space-y-6 max-w-4xl">

            {/* HEADER */}
            <div>
                <h2 className="text-lg font-semibold text-slate-900">
                    Structural Claim Identity
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                    Bind this Evidence Model to exactly one confirmed Competency.
                    This defines the latent variable being inferred.
                </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-6">

                {/* NAME */}
                <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        Evidence Model Name <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        className={fieldClass(Boolean(errors.name))}
                        value={draftModel.name || ""}
                        onChange={(e) =>
                            updateField("name", e.target.value)
                        }
                        disabled={locked}
                    />
                    {errors.name && (
                        <p className="mt-1.5 text-xs font-medium text-red-600">
                            {errors.name}
                        </p>
                    )}
                </div>

                {/* DESCRIPTION */}
                <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                        rows={3}
                        className={fieldClass(Boolean(errors.description))}
                        value={draftModel.description || ""}
                        onChange={(e) =>
                            updateField("description", e.target.value)
                        }
                        disabled={locked}
                    />
                    {errors.description && (
                        <p className="mt-1.5 text-xs font-medium text-red-600">
                            {errors.description}
                        </p>
                    )}
                </div>

                {/* COMPETENCY SELECTION */}
                <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        Select Primary Competency <span className="text-red-500">*</span>
                    </label>

                    <select
                        className={fieldClass(Boolean(errors.competencyId))}
                        value={draftModel.competencyId || ""}
                        onChange={(e) =>
                            handleCompetencyChange(e.target.value)
                        }
                        disabled={locked}
                    >
                        <option value="">-- Select Competency --</option>

                        {groupedCompetencies.map((group) => (
                            <optgroup
                                key={group.modelId}
                                label={`Model: ${group.modelName} (v${group.versionNumber})`}
                            >
                                {group.competencies.map((comp) => (
                                    <option key={comp.id} value={comp.id}>
                                        {comp.name}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>

                    {errors.competencyId && (
                        <p className="mt-1.5 text-xs font-medium text-red-600">
                            {errors.competencyId}
                        </p>
                    )}
                </div>
            </div>

            {/* COMPETENCY STRUCTURAL PANEL */}
            {selectedCompetency && selectedCompetencyModel && (
                <CompetencyStructuralPanel
                    competency={selectedCompetency}
                    competencyModel={selectedCompetencyModel}
                    modelMeta={selectedModelMeta}
                    competencies={competencies}
                />
            )}
        </div>
    );
}
