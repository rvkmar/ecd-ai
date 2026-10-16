// CompetencyWizard/steps/Step4LatentVariables.jsx
// 🟢 Step 4 — Latent Variable Definition (Enterprise Production Layout v4)
// ✔ Drag-and-drop FIXED (true reorder)
// ✔ Badge preserved
// ✔ Smooth animation
// ✔ Memoized cards
// ✔ Buffered typing

import React, { useState, useEffect, useCallback, memo } from "react";
import { useCompetencyWizard } from "../CompetencyWizardContext";
import VariableTypeSelector from "../components/VariableTypeSelector";
import { motion, AnimatePresence } from "framer-motion";
import { GripVertical, ChevronDown, ChevronUp, Trash2, Plus } from "lucide-react";
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
    arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/* =====================================================
   🔹 BADGE
   Module scope: stateless, no reason to redefine per render.
===================================================== */
const Badge = ({ type }) => {
    if (!type)
        return (
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide bg-red-100 text-red-700">
                Incomplete
            </span>
        );

    return (
        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-600 capitalize">
            {type}
        </span>
    );
};

/* =====================================================
   🔹 MEMOIZED SORTABLE CARD
   Hoisted to module scope -- this used to be defined INSIDE
   Step4LatentVariables' render body, which made it a brand-new
   component type on every parent re-render (every keystroke commit,
   every competency add/remove). React would then unmount + remount
   every card instance instead of reconciling it, resetting local
   state and cancelling in-flight Framer Motion transitions -- the
   root cause of "have to click twice" on expand/collapse and on
   inputs immediately after any commit. Props that used to be closed
   over are now passed explicitly.
===================================================== */
const SortableCard = memo(function SortableCard({
    comp,
    isLocked,
    measurementIntent,
    activeId,
    setActiveId,
    localErrors,
    handleCommit,
    removeCompetency,
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: comp.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const errors = localErrors[comp.id] || {};
    const isActive = activeId === comp.id;

    const [localName, setLocalName] = useState(comp.name || "");
    const [localDescription, setLocalDescription] = useState(
        comp.description || ""
    );

    useEffect(() => {
        setLocalName(comp.name || "");
        setLocalDescription(comp.description || "");
    }, [comp.id]);

    return (
        <div ref={setNodeRef} style={style}>
            <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-3 px-5 py-4">
                    {!isLocked && (
                        <div
                            className="cursor-grab text-slate-400 hover:text-slate-600 shrink-0"
                            {...listeners}
                            {...attributes}
                        >
                            <GripVertical size={16} strokeWidth={2} />
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={() => setActiveId(isActive ? null : comp.id)}
                        className="flex-1 text-left flex items-center justify-between gap-3"
                    >
                        <div>
                            <div className="flex items-center gap-3">
                                <div className="text-sm font-semibold text-slate-900">
                                    {localName || "Untitled Competency"}
                                </div>
                                <Badge type={comp.variableType} />
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                                {localDescription
                                    ? localDescription.substring(0, 60) +
                                    (localDescription.length > 60 ? "…" : "")
                                    : "No description"}
                            </div>
                        </div>
                        {isActive ? (
                            <ChevronUp size={16} strokeWidth={2} className="text-slate-400 shrink-0" />
                        ) : (
                            <ChevronDown size={16} strokeWidth={2} className="text-slate-400 shrink-0" />
                        )}
                    </button>
                </div>

                <AnimatePresence initial={false}>
                    {isActive && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="border-t border-slate-100 bg-slate-50/60 px-6 py-6 space-y-5"
                        >
                            {!isLocked && (
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => removeCompetency(comp.id)}
                                        className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
                                    >
                                        <Trash2 size={14} strokeWidth={2} />
                                        Delete
                                    </button>
                                </div>
                            )}

                            <div>
                                <input
                                    type="text"
                                    value={localName}
                                    disabled={isLocked}
                                    onChange={(e) => setLocalName(e.target.value)}
                                    onBlur={(e) => {
                                        const value = e.target.value;
                                        setLocalName(value);
                                        handleCommit(comp.id, "name", value);
                                    }}
                                    className={`w-full rounded-md border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${errors.name
                                            ? "border-red-400 focus:ring-red-500/10 focus:border-red-500"
                                            : "border-slate-300 focus:ring-slate-900/10 focus:border-slate-400"
                                        }`}
                                    placeholder="Competency name"
                                />
                                {errors.name && (
                                    <p className="mt-1.5 text-xs font-medium text-red-600">
                                        {errors.name}
                                    </p>
                                )}
                            </div>

                            <div>
                                <textarea
                                    rows={3}
                                    value={localDescription}
                                    disabled={isLocked}
                                    onChange={(e) => setLocalDescription(e.target.value)}
                                    onBlur={(e) => {
                                        const value = e.target.value;
                                        setLocalDescription(value);
                                        handleCommit(comp.id, "description", value);
                                    }}
                                    className={`w-full rounded-md border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition resize-y placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${errors.description
                                            ? "border-red-400 focus:ring-red-500/10 focus:border-red-500"
                                            : "border-slate-300 focus:ring-slate-900/10 focus:border-slate-400"
                                        }`}
                                    placeholder="Competency description"
                                />
                                {errors.description && (
                                    <p className="mt-1.5 text-xs font-medium text-red-600">
                                        {errors.description}
                                    </p>
                                )}
                            </div>

                            <VariableTypeSelector
                                value={comp.variableType}
                                measurementIntent={measurementIntent}
                                disabled={isLocked}
                                onChange={(type) =>
                                    handleCommit(comp.id, "variableType", type)
                                }
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
});

/* =====================================================
   🔹 STEP 4 ORCHESTRATOR
===================================================== */
export default function Step4LatentVariables() {
    const {
        model,
        competencies,
        addCompetency,
        updateCompetency,
        removeCompetency,
    } = useCompetencyWizard();

    const isLocked = model?.locked;
    const [activeId, setActiveId] = useState(null);
    const [localErrors, setLocalErrors] = useState({});

    // 🔥 IMPORTANT: sort from backend orderIndex if exists
    const sortedCompetencies = [...competencies].sort(
        (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
    );

    const sensors = useSensors(useSensor(PointerSensor));

    /* =====================================================
       🔹 DRAG END HANDLER (REAL FIX)
    ===================================================== */
    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = sortedCompetencies.findIndex(
            (c) => c.id === active.id
        );
        const newIndex = sortedCompetencies.findIndex(
            (c) => c.id === over.id
        );

        const newOrder = arrayMove(sortedCompetencies, oldIndex, newIndex);

        // Persist orderIndex properly
        newOrder.forEach((c, index) => {
            updateCompetency(c.id, { orderIndex: index });
        });
    };

    /* =====================================================
       🔹 VALIDATION
    ===================================================== */
    const validateCompetency = useCallback((comp) => {
        const errors = {};
        if (!comp.name || comp.name.trim().length < 3)
            errors.name = "Min 3 characters.";
        if (!comp.description || comp.description.trim().length < 8)
            errors.description = "Min 8 characters.";
        if (!comp.variableType) errors.variableType = "Select variable type.";
        return errors;
    }, []);

    const handleCommit = useCallback(
        (compId, field, value) => {
            const comp = competencies.find((c) => c.id === compId);
            const updated = { ...comp, [field]: value };
            const errors = validateCompetency(updated);
            setLocalErrors((prev) => ({ ...prev, [compId]: errors }));
            updateCompetency(compId, { [field]: value });
        },
        [competencies, updateCompetency, validateCompetency]
    );

    /* =====================================================
       🔹 RENDER
    ===================================================== */
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-slate-900">
                    Step 4 — Latent Variable Definition
                </h2>
            </div>

            {!isLocked && (
                <button
                    onClick={addCompetency}
                    className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                    <Plus size={14} strokeWidth={2} />
                    Add Competency
                </button>
            )}

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={sortedCompetencies.map((c) => c.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="max-h-[65vh] overflow-y-auto space-y-4">
                        {sortedCompetencies.map((comp) => (
                            <SortableCard
                                key={comp.id}
                                comp={comp}
                                isLocked={isLocked}
                                measurementIntent={model?.measurementIntent}
                                activeId={activeId}
                                setActiveId={setActiveId}
                                localErrors={localErrors}
                                handleCommit={handleCommit}
                                removeCompetency={removeCompetency}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
}
