// CompetencyWizard/steps/Step5StateSpaceScale.jsx
// 🟢 Step 5 — State Space / Scale Specification (Enterprise Production Layout v3)
// ✔ Drag-order awareness (respects orderIndex from Step 4)
// ✔ Global structural completeness progress bar
// ✔ Inline summary preview per competency
// ✔ Collapsible panels + animation
// ✔ Memoized rendering
// ✔ Locked-state alignment

import React, { useMemo, useState, useCallback, memo } from "react";
import { useCompetencyWizard } from "../CompetencyWizardContext";
import StateEditorBinary from "../components/StateEditorBinary";
import StateEditorOrdinal from "../components/StateEditorOrdinal";
import StateEditorCategorical from "../components/StateEditorCategorical";
import ContinuousScaleEditor from "../components/ContinuousScaleEditor";
import PriorDistributionEditor from "../components/PriorDistributionEditor";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ChevronDown, ChevronUp, Info } from "lucide-react";

/* =====================================================
   🔹 MEMOIZED PANEL
   Hoisted to module scope -- previously defined inside
   Step5StateSpaceScale's render body, which made it remount on every
   parent re-render (every competency edit) instead of reconciling,
   collapsing any open panel and cancelling its Framer Motion
   transition mid-flight -- the "click twice" symptom. `meta` and
   `renderStateEditor` are now passed explicitly instead of closed
   over.
===================================================== */
const CompetencyPanel = memo(function CompetencyPanel({
    comp,
    activeId,
    setActiveId,
    meta,
    renderStateEditor,
}) {
    const isActive = activeId === comp.id;

    return (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            {/* HEADER */}
            <button
                type="button"
                onClick={() => setActiveId(isActive ? null : comp.id)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
            >
                <div>
                    <div className="text-sm font-semibold text-slate-800">
                        {comp.name || "Unnamed Competency"}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 capitalize">
                        {meta?.summary}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${meta?.valid
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-red-100 text-red-700"
                            }`}
                    >
                        {meta?.valid ? "Complete" : "Incomplete"}
                    </span>
                    {isActive ? (
                        <ChevronUp size={16} strokeWidth={2} className="text-slate-400" />
                    ) : (
                        <ChevronDown size={16} strokeWidth={2} className="text-slate-400" />
                    )}
                </div>
            </button>

            {/* BODY */}
            <AnimatePresence initial={false}>
                {isActive && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="border-t border-slate-100 bg-slate-50/60 px-6 py-6"
                    >
                        {renderStateEditor(comp)}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});

export default function Step5StateSpaceScale() {
    const { model, competencies, updateCompetency } =
        useCompetencyWizard();

    const isLocked = model?.locked;
    const [activeId, setActiveId] = useState(null);

    /* =====================================================
       🔹 DRAG-ORDER AWARENESS (SORT BY orderIndex)
    ===================================================== */

    const orderedCompetencies = useMemo(() => {
        return [...competencies].sort((a, b) => {
            const aOrder = typeof a.orderIndex === "number" ? a.orderIndex : 0;
            const bOrder = typeof b.orderIndex === "number" ? b.orderIndex : 0;
            return aOrder - bOrder;
        });
    }, [competencies]);

    /* =====================================================
       🔹 COMPLETENESS + SUMMARY COMPUTATION
    ===================================================== */

    const structuralMeta = useMemo(() => {
        let completeCount = 0;

        const map = new Map();

        orderedCompetencies.forEach((comp) => {
            let valid = false;
            let summary = "Not defined";

            if (!comp.variableType) {
                valid = false;
                summary = "No variable type declared";
            } else if (comp.variableType === "binary") {
                const count = comp.states?.length || 0;
                valid = count === 2;
                summary = `${count} state${count !== 1 ? "s" : ""} defined`;
            } else if (comp.variableType === "ordinal") {
                const count = comp.states?.length || 0;
                valid = count >= 2;
                summary = `${count} ordered level${count !== 1 ? "s" : ""}`;
            } else if (comp.variableType === "categorical") {
                const count = comp.states?.length || 0;
                valid = count >= 2;
                summary = `${count} category${count !== 1 ? "ies" : "y"}`;
            } else if (comp.variableType === "continuous") {
                const min = comp.scale?.min;
                const max = comp.scale?.max;
                valid =
                    typeof min === "number" &&
                    typeof max === "number" &&
                    min < max;
                summary =
                    typeof min === "number" && typeof max === "number"
                        ? `Range: ${min} to ${max}`
                        : "Range not defined";
            }

            if (valid) completeCount++;

            map.set(comp.id, { valid, summary });
        });

        const percent =
            orderedCompetencies.length > 0
                ? Math.round((completeCount / orderedCompetencies.length) * 100)
                : 0;

        return { map, percent };
    }, [orderedCompetencies]);

    /* =====================================================
       🔹 RENDER EDITOR BY TYPE
    ===================================================== */

    const renderStateEditor = useCallback(
        (comp) => {
            if (!comp.variableType) {
                return (
                    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">
                        <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
                        <p>
                            Variable type must be declared in Step 4 before defining state
                            space.
                        </p>
                    </div>
                );
            }

            const commonProps = { disabled: isLocked };

            switch (comp.variableType) {
                case "binary":
                    return (
                        <StateEditorBinary
                            states={comp.states || []}
                            onChange={(states) =>
                                updateCompetency(comp.id, { states })
                            }
                            {...commonProps}
                        />
                    );

                case "ordinal":
                    return (
                        <StateEditorOrdinal
                            states={comp.states || []}
                            onChange={(states) =>
                                updateCompetency(comp.id, { states })
                            }
                            {...commonProps}
                        />
                    );

                case "categorical":
                    return (
                        <StateEditorCategorical
                            states={comp.states || []}
                            onChange={(states) =>
                                updateCompetency(comp.id, { states })
                            }
                            {...commonProps}
                        />
                    );

                case "continuous":
                    return (
                        <ContinuousScaleEditor
                            scale={comp.scale || {}}
                            onChange={(scale) =>
                                updateCompetency(comp.id, { scale })
                            }
                            {...commonProps}
                        />
                    );

                default:
                    return null;
            }
        },
        [isLocked, updateCompetency]
    );

    /* =====================================================
       🔹 MAIN RENDER
    ===================================================== */

    return (
        <div className="space-y-6">
            {/* HEADER */}
            <div>
                <h2 className="text-lg font-semibold text-slate-900">
                    Step 5 — State Space / Scale
                </h2>
                <p className="mt-1 text-sm text-slate-500 max-w-3xl">
                    Define the domain of each latent variable. The state space or
                    measurement scale formalizes inferential meaning.
                </p>
            </div>

            {/* GLOBAL PROGRESS BAR */}
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 space-y-2">
                <div className="flex justify-between text-sm text-slate-600">
                    <span>Structural Completeness</span>
                    <span className="font-semibold text-slate-900">{structuralMeta.percent}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                        className="bg-slate-900 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${structuralMeta.percent}%` }}
                    />
                </div>
            </div>

            {/* SCROLLABLE PANELS */}
            <div className="max-h-[65vh] overflow-y-auto space-y-4 pr-2">
                {orderedCompetencies.map((comp) => (
                    <CompetencyPanel
                        key={comp.id}
                        comp={comp}
                        activeId={activeId}
                        setActiveId={setActiveId}
                        meta={structuralMeta.map.get(comp.id)}
                        renderStateEditor={renderStateEditor}
                    />
                ))}
            </div>

            {/* PRIOR DISTRIBUTIONS */}
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5">
                <PriorDistributionEditor />
            </div>

            {/* GOVERNANCE NOTE */}
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3.5 text-sm text-blue-800">
                <Info size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
                <p>
                    <strong>ECD Principle:</strong> Every latent variable must declare
                    its state space or scale range. This determines statistical
                    compatibility and interpretive validity within the Student Model
                    layer.
                </p>
            </div>
        </div>
    );
}
