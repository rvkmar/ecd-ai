// CompetencyWizard/components/DimensionalIntegrityPanel.jsx
import React, { useMemo } from "react";
import { Check, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { typeCoherenceAdvisories } from "../smVariableSync";

export default function DimensionalIntegrityPanel({
    model,
    competencies = [],
}) {
    const analysis = useMemo(() => {
        const measurementIntent = model?.measurementIntent;
        const checklist = [];

        checklist.push({
            label: "Measurement intent defined",
            passed: ["unidimensional", "multidimensional"].includes(
                measurementIntent
            ),
        });

        checklist.push({
            label: "At least one latent variable defined",
            passed: competencies.length > 0,
        });

        if (measurementIntent === "unidimensional") {
            checklist.push({
                label: "Exactly one latent variable (unidimensional constraint)",
                passed: competencies.length === 1,
            });
        }

        if (measurementIntent === "multidimensional") {
            checklist.push({
                label: "At least two latent variables (multidimensional)",
                passed: competencies.length >= 2,
            });
        }

        const variableTypes = competencies
            .map((c) => c.variableType)
            .filter(Boolean);

        checklist.push({
            label: "All competencies declare variable type",
            passed:
                variableTypes.length === competencies.length &&
                competencies.length > 0,
        });

        checklist.push({
            label: "Psychological perspective declared",
            passed: Boolean(model?.psychologicalPerspective),
        });

        return {
            checklist,
            advisories: typeCoherenceAdvisories(
                competencies,
                model?.psychologicalPerspective
            ),
        };
    }, [model, competencies]);

    const allPassed = analysis.checklist.every((r) => r.passed);

    return (
        <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div>
                <h3 className="text-lg font-semibold text-slate-900">
                    Dimensional Integrity Analysis
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                    Evaluates structural coherence of the latent variable architecture
                    (TR9 CAF Student Model).
                </p>
            </div>

            <ul className="space-y-2">
                {analysis.checklist.map((item, index) => (
                    <li
                        key={index}
                        className={`flex items-center gap-2 text-sm ${
                            item.passed ? "text-emerald-700" : "text-red-600"
                        }`}
                    >
                        {item.passed ? (
                            <Check size={16} strokeWidth={2.25} className="shrink-0" />
                        ) : (
                            <X size={16} strokeWidth={2.25} className="shrink-0" />
                        )}
                        {item.label}
                    </li>
                ))}
            </ul>

            {analysis.advisories.length > 0 && (
                <div className="space-y-2">
                    {analysis.advisories.map((text, i) => (
                        <div
                            key={i}
                            className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800"
                        >
                            <AlertTriangle
                                size={16}
                                strokeWidth={2}
                                className="mt-0.5 shrink-0"
                            />
                            <span>
                                <strong>Advisory:</strong> {text}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <div
                className={`flex items-start gap-3 rounded-lg border px-4 py-3.5 text-sm font-semibold ${
                    allPassed
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-red-200 bg-red-50 text-red-700"
                }`}
            >
                {allPassed ? (
                    <CheckCircle2 size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
                ) : (
                    <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
                )}
                <span>
                    {allPassed
                        ? "Dimensional integrity satisfied."
                        : "Dimensional violations detected. Resolve before confirmation."}
                </span>
            </div>
        </div>
    );
}
