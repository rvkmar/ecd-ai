// CompetencyWizard/components/CompetencyPreviewPanel.jsx
// 🧠 Competency Preview Panel (Production Refactor)
// - Fully read-only structural summary
// - Tailwind UI
// - Clear structural metrics
// - Optimized derived computations
// - No inline styles

import React, { useMemo } from "react";

export default function CompetencyPreviewPanel({
    model,
    competencies = [],
}) {
    /* =====================================================
       🔹 DERIVED STRUCTURAL SUMMARY
    ===================================================== */

    const summary = useMemo(() => {
        const relationshipCount = competencies.reduce(
            (acc, c) => acc + (c.relationships?.length || 0),
            0
        );

        const variableTypeDistribution = competencies.reduce((acc, c) => {
            if (!c.variableType) return acc;
            acc[c.variableType] = (acc[c.variableType] || 0) + 1;
            return acc;
        }, {});

        return {
            competencyCount: competencies.length,
            relationshipCount,
            variableTypeDistribution,
        };
    }, [competencies]);

    const competencyById = useMemo(() => {
        const map = {};
        competencies.forEach((c) => {
            map[c.id] = c;
        });
        return map;
    }, [competencies]);

    /* =====================================================
       🔹 RENDER
    ===================================================== */

    return (
        <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            {/* Header */}
            <div>
                <h3 className="text-lg font-semibold text-slate-900">Student Model Preview</h3>
                <p className="mt-1 text-sm text-slate-500">
                    Review the complete latent structure before confirmation.
                </p>
            </div>

            {/* Model Info */}
            <div className="grid gap-4 text-sm md:grid-cols-3">
                <div>
                    <div className="font-medium text-slate-700">Name</div>
                    <div className="text-slate-600">{model?.name || "—"}</div>
                </div>
                <div>
                    <div className="font-medium text-slate-700">Measurement Intent</div>
                    <div className="text-slate-600 capitalize">
                        {model?.measurementIntent || "—"}
                    </div>
                </div>
                <div>
                    <div className="font-medium text-slate-700">Status</div>
                    <div className="text-slate-600 capitalize">
                        {model?.status || "draft"}
                    </div>
                </div>
            </div>

            {model?.description && (
                <div className="text-sm text-slate-600">
                    <div className="mb-1 font-medium text-slate-700">Description</div>
                    {model.description}
                </div>
            )}

            {/* Summary Metrics */}
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <div>
                    <strong className="text-slate-800">Total Competencies:</strong>{" "}
                    <span className="text-slate-600">{summary.competencyCount}</span>
                </div>
                <div>
                    <strong className="text-slate-800">Total Relationships:</strong>{" "}
                    <span className="text-slate-600">{summary.relationshipCount}</span>
                </div>

                <div>
                    <strong className="text-slate-800">Variable Type Distribution:</strong>
                    {Object.keys(summary.variableTypeDistribution).length === 0 ? (
                        <div className="mt-1 text-slate-500">None defined</div>
                    ) : (
                        <ul className="mt-1 list-disc pl-5 text-slate-600">
                            {Object.entries(summary.variableTypeDistribution).map(
                                ([type, count]) => (
                                    <li key={type} className="capitalize">
                                        {type}: {count}
                                    </li>
                                )
                            )}
                        </ul>
                    )}
                </div>
            </div>

            {/* Competency Details */}
            <div className="space-y-4">
                {competencies.map((comp) => (
                    <div
                        key={comp.id}
                        className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4"
                    >
                        <div>
                            <div className="font-semibold text-slate-900">{comp.name}</div>
                            {comp.description && (
                                <div className="mt-1 text-sm text-slate-600">
                                    {comp.description}
                                </div>
                            )}
                        </div>

                        <div className="text-sm text-slate-700">
                            <strong className="text-slate-800">Variable Type:</strong>{" "}
                            <span className="capitalize">{comp.variableType || "—"}</span>
                        </div>

                        {/* State or Scale */}
                        {comp.variableType && comp.variableType !== "continuous" && (
                            <div className="text-sm text-slate-700">
                                <strong className="text-slate-800">States:</strong>
                                {(comp.states || []).length === 0 ? (
                                    <div className="mt-1 text-slate-500">No states defined</div>
                                ) : (
                                    <ul className="mt-1 list-disc pl-5">
                                        {comp.states.map((s, idx) => (
                                            <li key={idx}>
                                                {s.value} — {s.label}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        {comp.variableType === "continuous" && (
                            <div className="text-sm text-slate-700">
                                <strong className="text-slate-800">Scale:</strong>{" "}
                                {typeof comp.scale?.min === "number" &&
                                    typeof comp.scale?.max === "number"
                                    ? `${comp.scale.min} to ${comp.scale.max}`
                                    : "Not defined"}
                            </div>
                        )}

                        {/* Relationships */}
                        {(comp.relationships || []).length > 0 && (
                            <div className="text-sm text-slate-700">
                                <strong className="text-slate-800">Relationships:</strong>
                                <ul className="mt-1 list-disc pl-5">
                                    {comp.relationships.map((r, idx) => (
                                        <li key={idx}>
                                            {r.type} →{" "}
                                            {competencyById[r.targetCompetencyId]?.name ||
                                                "Unknown"}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Governance Notice */}
            <div className="border-t border-slate-100 pt-4 text-xs text-slate-500">
                <strong className="text-slate-600">Confirmation Notice:</strong> This preview represents the
                final frozen structure. Structural modification after confirmation
                requires cloning the model to preserve inferential integrity.
            </div>
        </div>
    );
}
