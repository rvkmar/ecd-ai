// CompetencyWizard/steps/Step2MeasurementIntent.jsx
// Step 2 — Measurement Intent (accessible button cards)

import React, { useEffect, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { useCompetencyWizard } from "../CompetencyWizardContext";

export default function Step2MeasurementIntent() {
    const { model, competencies, updateModelField } = useCompetencyWizard();

    const [localError, setLocalError] = useState("");

    const isLocked = model?.locked;

    useEffect(() => {
        validate();
    }, [model?.measurementIntent, competencies.length]);

    function validate() {
        if (!model?.measurementIntent) {
            setLocalError("Measurement intent must be selected.");
            return;
        }

        if (
            model.measurementIntent === "unidimensional" &&
            competencies.length > 1
        ) {
            setLocalError(
                "Unidimensional models cannot contain multiple independent competencies."
            );
            return;
        }

        setLocalError("");
    }

    function handleSelect(intent) {
        if (isLocked) return;

        if (intent === "unidimensional" && competencies.length > 1) {
            setLocalError(
                "Cannot switch to unidimensional while multiple competencies exist."
            );
            return;
        }

        updateModelField("measurementIntent", intent);
    }

    function renderCard(intent, title, description) {
        const selected = model?.measurementIntent === intent;

        return (
            <button
                type="button"
                onClick={() => handleSelect(intent)}
                disabled={isLocked}
                aria-pressed={selected}
                className={`w-full rounded-lg border p-6 text-left transition ${
                    selected
                        ? "border-slate-900 bg-slate-50 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50"
                } ${isLocked ? "cursor-not-allowed opacity-70" : ""}`}
            >
                <h4 className="text-sm font-semibold text-slate-800 mb-1.5">
                    {title}
                </h4>
                <p className="text-sm text-slate-500 leading-relaxed">
                    {description}
                </p>
            </button>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-slate-900">
                    Step 2 — Measurement Intent
                </h2>
                <p className="mt-1 text-sm text-slate-500 max-w-3xl">
                    Specify whether this Student Model represents a single latent
                    proficiency dimension or multiple independent dimensions. This
                    decision determines statistical compatibility and structural rules.
                </p>
            </div>

            <div className="space-y-4">
                {renderCard(
                    "unidimensional",
                    "Unidimensional",
                    "The model represents a single underlying latent trait. Suitable for Rasch / IRT single-parameter structures."
                )}

                {renderCard(
                    "multidimensional",
                    "Multidimensional",
                    "The model contains multiple latent proficiency variables. Suitable for multidimensional IRT or Bayesian networks. Requires ≥3 structural relationships at confirmation."
                )}
            </div>

            {localError && (
                <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700">
                    <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
                    <p>{localError}</p>
                </div>
            )}

            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3.5 text-sm text-blue-800">
                <Info size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
                <p>
                    <strong>ECD Principle:</strong> Measurement intent defines the
                    dimensional structure of the Student Model layer. Once confirmed,
                    dimensionality cannot be changed without cloning.
                </p>
            </div>
        </div>
    );
}
