// CompetencyWizard/components/VersionHistoryViewer.jsx
// 🧠 Version History Viewer (Production-Grade Refactor)
// Displays structural version lineage of Competency Model
// - Tailwind UI
// - Clear version lineage logic
// - Status badges
// - Current version highlighting
// - Governance-aligned messaging

import React, { useMemo } from "react";
import LifecycleStatusBadge from "@/components/ui/LifecycleStatusBadge";

export default function VersionHistoryViewer({
    currentModel,
    allModels = [],
    onSelectVersion,
}) {
    if (!currentModel) return null;

    /* =====================================================
       🔹 BUILD VERSION LINEAGE
    ===================================================== */

    const lineage = useMemo(() => {
        const rootId = currentModel.parentModelId || currentModel.id;

        return allModels
            .filter(
                (m) => m.id === rootId || m.parentModelId === rootId
            )
            .sort(
                (a, b) => (a.versionNumber || 1) - (b.versionNumber || 1)
            );
    }, [currentModel, allModels]);

    const hasMultipleVersions = lineage.length > 1;

    /* =====================================================
       🔹 RENDER
    ===================================================== */

    return (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-6 space-y-6">
            <div>
                <h4 className="text-sm font-semibold text-slate-800">Version History</h4>
                <p className="mt-1 text-sm text-slate-500">
                    Structural version lineage for this Competency Model.
                </p>
            </div>

            {!hasMultipleVersions ? (
                <div className="text-sm text-slate-500">
                    No structural versions available.
                </div>
            ) : (
                <ul className="space-y-3">
                    {lineage.map((model) => {
                        const isCurrent = model.id === currentModel.id;

                        return (
                            <li
                                key={model.id}
                                className={`flex items-center justify-between gap-3 rounded-lg border p-4 transition ${isCurrent
                                        ? "border-slate-900 bg-slate-50"
                                        : "border-slate-200 bg-white"
                                    }`}
                            >
                                <div className="space-y-1">
                                    <div className="font-semibold text-slate-800">
                                        Version {model.versionNumber || 1}
                                    </div>

                                    <div className="text-xs">
                                        <LifecycleStatusBadge status={model.status} />
                                    </div>

                                    <div className="text-xs text-slate-500">
                                        Updated: {new Date(model.updatedAt).toLocaleString()}
                                    </div>
                                </div>

                                {isCurrent ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                        <CheckCircle2 size={14} strokeWidth={2} />
                                        Current
                                    </span>
                                ) : (
                                    onSelectVersion && (
                                        <button
                                            type="button"
                                            onClick={() => onSelectVersion(model.id)}
                                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                                        >
                                            <Eye size={14} strokeWidth={2} />
                                            View
                                        </button>
                                    )
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            <div className="text-xs text-slate-500">
                <strong className="font-semibold text-slate-700">Governance:</strong> Structural versions preserve inferential
                integrity. Confirmed versions remain immutable. Draft clones may be
                modified independently.
            </div>
        </div>
    );
}