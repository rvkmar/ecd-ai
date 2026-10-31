// EvidenceWizard/steps/Step3Warrants.jsx
// 🧠 Enterprise ECD Step 3 — Structured Warrants (Stable Refactor)
// -----------------------------------------------------------------------------
// Major improvements
// • Correct memo dependency ordering
// • Stable competency scoping
// • Deterministic diagnostics execution
// • Safer drag sorting
// • Cleaner warrant grouping
// • Health monitoring integration

import React, { useState, useEffect, useMemo, useRef } from "react";

import {
    AlertCircle,
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Info,
    Plus
} from "lucide-react";

import { useEvidenceWizardContext } from "../EvidenceWizardContext";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { useTaskModelVariables } from "@/api/queries/taskModelVariables";
import { evidenceArgumentIssues } from "@/utils/evidenceArgument";

import WarrantBuilder from "../components/WarrantBuilder";
import WarrantCard from "../components/WarrantCard";
import AlternativeExplanationsEditor from "../components/AlternativeExplanationsEditor";

import EvidenceDiagnosticsPanel from "../components/EvidenceDiagnosticsPanel";
import EvidenceHeatmap from "../components/EvidenceHeatmap";
import CompetencyGraphVisualizer from "../components/CompetencyGraphVisualizer";

import { buildEvidenceScope } from "../components/utils/buildEvidenceScope";
import { runEvidenceGapEngine } from "../components/engines/evidenceGapEngine";
import { runEvidenceDiagnostics } from "../components/diagnostics/evidenceDiagnostics";
import { optimizeWarrantCoverage } from "../components/engines/warrantCoverageOptimizer";

import { motion, AnimatePresence } from "framer-motion";

import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors
} from "@dnd-kit/core";

import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
    arrayMove
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

const badgeBase =
    "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide";

const EMPTY_LIST = [];

/* =====================================================
   Sortable Warrant Card
===================================================== */

function SortableWarrantCard(props) {

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition
    } = useSortable({ id: props.warrant.id });


    const style = {
        transform: CSS.Transform.toString(transform),
        transition
    };


    return (

        <motion.div
            ref={setNodeRef}
            style={style}
            layout
        >

            <WarrantCard
                {...props}
                dragAttributes={attributes}
                dragListeners={listeners}
            />

        </motion.div>

    );

}

/* =====================================================
   Main Component
===================================================== */

export default function Step3Warrants({ onValidityChange, locked }) {

    const {
        draftModel,
        addWarrant,
        updateWarrant,
        removeWarrant,
        competencies,
        competencyModels
    } = useEvidenceWizardContext();

    const { data: designPatternData } = useDesignPatterns({ retry: false });
    const { data: taskModelVariableData } = useTaskModelVariables({ retry: false });
    const designPatterns = designPatternData || EMPTY_LIST;
    const taskModelVariables = taskModelVariableData || EMPTY_LIST;

    // The model as it was when this step first saw an id. Grandfathering
    // compares against that stored row, not against edits in this sitting.
    const storedArgumentModel = useRef(null);
    if (storedArgumentModel.current == null && draftModel?.id) {
        storedArgumentModel.current = draftModel;
    }


    /* =====================================================
       Core Model Data
    ===================================================== */

    const claimText = draftModel?.claimStatement || "";

    const warrants = draftModel?.warrants || [];

    const safeCompetencies = competencies || [];

    const safeModels = competencyModels || [];


    /* =====================================================
       Target Competency
    ===================================================== */

    const targetCompetencyId =

        draftModel?.competencyId || draftModel?.claimCompetencyId;


    const activeCompetency = useMemo(() => {

        return safeCompetencies.find(c => c.id === targetCompetencyId);

    }, [safeCompetencies, targetCompetencyId]);


    const activeModel = useMemo(() => {

        if (!activeCompetency) return null;

        return safeModels.find(m => m.id === activeCompetency.modelId);

    }, [safeModels, activeCompetency]);


    /* =====================================================
       Competency Lookup Map
    ===================================================== */

    const competencyMap = useMemo(() => {

        const map = {};

        safeCompetencies.forEach(c => {

            map[c.id] = c;

        });


        return map;

    }, [safeCompetencies]);


    /* =====================================================
       Evidence Scope
    ===================================================== */

    const scopedCompetencies = useMemo(() => {

        if (!activeCompetency) return [];


        return buildEvidenceScope({

            targetCompetency: activeCompetency,

            competencies: safeCompetencies

        });


    }, [activeCompetency, safeCompetencies]);


    /* =====================================================
       Drag Sensors
    ===================================================== */

    const sensors = useSensors(useSensor(PointerSensor));


    const [errors, setErrors] = useState({});

    const [collapseAll, setCollapseAll] = useState(true);


    /* =====================================================
       Evidence Diagnostics
    ===================================================== */

    const diagnostics = useMemo(() => {

        return runEvidenceDiagnostics({

            claimText,

            claimScore: draftModel?.claimQualityScore || 0,

            warrants,

            competencies: scopedCompetencies

        });


    }, [claimText, warrants, scopedCompetencies, draftModel]);


    /* =====================================================
       Gap Analysis
    ===================================================== */

    const gapAnalysis = useMemo(() => {

        return runEvidenceGapEngine({

            claimText,

            targetCompetency: activeCompetency,

            competencyStates: activeCompetency?.states || [],

            competencyGraph: diagnostics?.competencyGraph || {},

            competencyEvidence: diagnostics?.competencyEvidence || {},

            warrants

        });


    }, [claimText, activeCompetency, diagnostics, warrants]);


    /* =====================================================
       Coverage Optimizer
    ===================================================== */

    const coverage = useMemo(() => {

        if (!activeCompetency) return null;


        return optimizeWarrantCoverage({

            warrants,

            competency: activeCompetency,

            competencies: scopedCompetencies,

            expectedAttributes: diagnostics?.expectedAttributes || [],

            competencyStates: activeCompetency?.states || []

        });


    }, [warrants, activeCompetency, scopedCompetencies, diagnostics]);

    const argumentIssues = useMemo(() => {
        const stored = storedArgumentModel.current;
        return evidenceArgumentIssues(draftModel || {}, {
            evidenceModels: stored ? [stored] : [],
            designPatterns,
            taskModelVariables,
        });
    }, [draftModel, designPatterns, taskModelVariables]);


    /* =====================================================
       Validation
    ===================================================== */

    useEffect(() => {

        const newErrors = {};


        if (!warrants.length) {

            newErrors.general = "At least one warrant is required.";

        }


        warrants.forEach((w, index) => {

            if (!w?.reasoningStatement || w.reasoningStatement.length < 40)

                newErrors[`reasoning-${index}`] =

                    "Reasoning statement must be at least 40 characters.";


            if (!w?.cognitiveAttribute)

                newErrors[`cognitive-${index}`] = "Cognitive attribute required.";


            if (!w?.competencyId)

                newErrors[`competency-${index}`] = "Each warrant must target a competency.";


            // schema.js requires both of these on every warrant before an
            // evidence model can be confirmed. Step 3 used not to check
            // them, so a warrant missing either sailed through to the
            // Confirmation step and failed there -- or, once the wizard
            // started auto-saving on Next, produced a red "Warrant w...
            // missing performanceCondition." toast from a step that showed
            // no error of its own. Surface them here, on the card that owns
            // the field.

            if (!w?.performanceCondition)

                newErrors[`condition-${index}`] =
                    "Performance condition required (the task context the behaviour must occur in).";


            if (!w?.limitationClause && !w?.rebuttalCondition)

                newErrors[`limitation-${index}`] =
                    "Rebuttal / limitation required (the condition under which this inference would not hold).";


        });

        argumentIssues.errors.forEach((message, index) => {
            newErrors[`argument-${index}`] = message;
        });


        setErrors(newErrors);


        if (onValidityChange)

            onValidityChange(Object.keys(newErrors).length === 0);


    }, [warrants, onValidityChange, argumentIssues]);


    /* =====================================================
       Group Warrants by Attribute
    ===================================================== */

    const groupedWarrants = useMemo(() => {

        const groups = {};


        warrants.forEach(w => {

            const key = w?.cognitiveAttribute || "Unclassified";


            if (!groups[key]) groups[key] = [];


            groups[key].push(w);


        });


        return groups;


    }, [warrants]);


    /* =====================================================
       Drag Sorting
    ===================================================== */

    function handleDragEnd(event) {

        const { active, over } = event;


        if (!over || active.id === over.id) return;


        const oldIndex = warrants.findIndex(w => w.id === active.id);

        const newIndex = warrants.findIndex(w => w.id === over.id);


        const reordered = arrayMove(warrants, oldIndex, newIndex);


        reordered.forEach((w, i) => {

            updateWarrant(w.id, { ...w, orderIndex: i });

        });

    }


    /* =====================================================
       Warrant Creation
    ===================================================== */

    function handleAddWarrant() {

        addWarrant({

            id: `w${Date.now()}`,

            competencyId: targetCompetencyId,

            observableEvidence: "",

            cognitiveAttribute: "",

            performanceCondition: "",

            warrantRule: "",

            backingEvidence: "",

            limitationClause: "",

            reasoningStatement: "",

            orderIndex: warrants.length

        });

    }


    function handleBuilderCreate(newWarrant) {

        addWarrant({

            id: `w${Date.now()}`,

            ...newWarrant,

            competencyId: targetCompetencyId,

            orderIndex: warrants.length

        });

    }


    /* =====================================================
       Render
    ===================================================== */

    return (

        <div className="space-y-6 max-w-6xl">

            {/* Header */}

            <div className="flex justify-between items-center">

                <div>

                    <h2 className="text-lg font-semibold text-slate-900">Structured Warrants</h2>

                    <p className="mt-1 text-sm text-slate-500">

                        Define reasoning linking observable evidence to the claim.

                    </p>

                </div>

            </div>


            {/* Competency Panel */}

            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 space-y-3">

                <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-1">
                        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <Info size={14} strokeWidth={2.25} />
                            Target Competency
                        </span>
                        <span className="text-sm font-semibold text-slate-900">
                            {activeCompetency?.name}
                        </span>
                    </div>

                </div>


                <div className="flex flex-wrap items-center gap-2 pt-1">

                    <span className={`${badgeBase} bg-blue-100 text-blue-700`}>

                        {activeModel?.name}

                    </span>


                    <span className={`${badgeBase} bg-slate-100 text-slate-600`}>

                        {activeCompetency?.variableType}

                    </span>


                    {activeCompetency?.states?.length > 0 && (

                        <span className={`${badgeBase} bg-slate-100 text-slate-600`}>

                            {activeCompetency.states.length} states

                        </span>
                    )}

                    {activeCompetency?.variableType === "continuous" && activeCompetency?.scale && (
                        <span className="text-xs text-slate-500">
                            Scale: {activeCompetency.scale.min} to {activeCompetency.scale.max}
                        </span>
                    )}



                </div>


                {/* RELATIONSHIPS (Resolve IDs → Names) */}

                {activeCompetency.relationships?.length > 0 && (
                    <div className="text-sm text-slate-600 mt-2 border-t border-slate-100 pt-2">
                        <strong className="text-slate-700">Relationships:</strong>
                        <ul className="list-disc ml-6 mt-1 space-y-0.5">
                            {activeCompetency.relationships.map((r, i) => {
                                const target = competencyMap[r.targetCompetencyId];
                                return (
                                    <li key={i}>
                                        {r.type} →{" "}
                                        {target ? target.name : r.targetCompetencyId}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

                <div className="text-sm text-slate-600 mt-2 border-t border-slate-100 pt-2">
                    <strong className="text-slate-700">Construct:</strong> <br></br>
                    <span className="text-sm text-slate-800">
                        {activeCompetency?.domain} →{" "}
                        {activeCompetency?.strand} →{" "}
                        {activeCompetency?.facet}
                    </span>
                </div>

            </div>


            <div className="space-y-6">

                {/* Claim */}

                <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-2 w-full">

                        <div className="text-sm text-slate-500 mb-1">

                            Articulated Claim

                        </div>
                        {!locked && (
                            <button
                                type="button"
                                className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 mt-3"
                                onClick={handleAddWarrant}
                            >
                                <Plus size={14} strokeWidth={2.25} />
                                Add Warrant

                            </button>
                        )}
                    </div>

                    <div className="text-sm text-slate-700">

                        {claimText || <span className="italic text-slate-400">No claim articulated.</span>}

                    </div>

                    {!locked && (
                        <div className="flex flex-col gap-4 mt-4">

                            {/* Builder */}

                            <WarrantBuilder

                                claimText={claimText}

                                competency={activeCompetency}

                                competencyModel={activeModel}

                                onCreate={handleBuilderCreate}

                            />
                        </div>
                    )}

                </div>

                <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">

                    <div className="flex items-center mb-4">
                        <h3 className="text-sm font-semibold text-slate-800">
                            Warrant List
                        </h3>

                        {/* Collapse Controls */}

                        {!collapseAll ?
                            <button
                                type="button"
                                className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                                onClick={() => setCollapseAll(true)}
                            >
                                <ChevronUp size={14} strokeWidth={2.25} />
                                Collapse All
                            </button>

                            :

                            <button
                                type="button"
                                className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                                onClick={() => setCollapseAll(false)}
                            >
                                <ChevronDown size={14} strokeWidth={2.25} />
                                Expand All
                            </button>
                        }

                    </div>


                    {/* Warrant Cards */}

                    <DndContext

                        sensors={locked ? [] : sensors}

                        collisionDetection={closestCenter}

                        onDragEnd={locked ? undefined : handleDragEnd}

                    >


                        <SortableContext

                            items={warrants.map(w => w.id)}

                            strategy={verticalListSortingStrategy}

                        >


                            <AnimatePresence>

                                {Object.entries(groupedWarrants).map(([attribute, list]) => (

                                    <div key={attribute} className="mb-6 rounded-lg border border-slate-200 bg-slate-50/60 p-4">


                                        <h3 className="text-sm font-semibold text-slate-700 mb-2">

                                            {attribute} ({list.length})

                                        </h3>


                                        <div className="space-y-3">
                                            {list.map((warrant, index) => (

                                                <SortableWarrantCard

                                                    key={warrant.id}

                                                    warrant={warrant}

                                                    competencies={safeCompetencies}

                                                    index={index}

                                                    errors={errors}

                                                    collapseAll={collapseAll}

                                                    locked={locked}

                                                    onChange={(updated) => updateWarrant(warrant.id, updated)}

                                                    onRemove={() => removeWarrant(warrant.id)}

                                                // disableRemove={warrants.length === 1}

                                                />

                                            ))}
                                        </div>


                                    </div>

                                ))}

                            </AnimatePresence>


                        </SortableContext>


                    </DndContext>
                </div>
            </div>

            <AlternativeExplanationsEditor
                locked={locked}
                patterns={designPatterns}
                taskModelVariables={taskModelVariables}
                errors={argumentIssues.errors}
                warnings={argumentIssues.warnings}
            />

            {/* Diagnostics */}

            <EvidenceDiagnosticsPanel

                claimText={claimText}

                claimQualityScore={draftModel?.claimQualityScore}

                warrants={warrants}

                competencies={safeCompetencies}

                competencyModels={safeModels}

            />


            {/* Coverage Health */}

            {coverage && (

                <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm text-emerald-800">

                    <CheckCircle2 size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />

                    <div className="space-y-1">

                        <div className="font-semibold text-sm">

                            Evidence Structure Health

                        </div>


                        <div className="text-sm">

                            {/* Labeled distinctly from the "Evidence Coverage" score card
                                in the Diagnostics panel below -- that one comes from
                                runEvidenceDiagnostics' claim-vs-warrant attribute match,
                                this one from optimizeWarrantCoverage's diagnostic-count
                                penalty score. They measure different things and used to
                                share a confusingly similar name while disagreeing. */}
                            Structural Health Score: <strong>{coverage.healthScore}</strong>

                        </div>


                        {coverage.diagnostics?.map((d, i) => (

                            <div key={i} className="flex items-center gap-1.5 text-sm text-amber-700">

                                <AlertTriangle size={14} strokeWidth={2.25} className="shrink-0" />
                                {d.message}

                            </div>

                        ))}

                    </div>

                </div>

            )}


            {/* Gap Recommendations */}

            {gapAnalysis?.recommendations?.length > 0 && (

                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">

                    <AlertTriangle size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />

                    <div className="space-y-2">

                        <div className="font-medium text-sm">

                            Evidence Gap Recommendations

                        </div>


                        {gapAnalysis.recommendations.map((rec, i) => (

                            <div key={i} className="text-sm text-amber-800">

                                {rec.message}

                            </div>

                        ))}
                    </div>

                </div>

            )}


            <EvidenceHeatmap

                competencies={scopedCompetencies}

                warrants={warrants}

            />


            <CompetencyGraphVisualizer

                competencies={scopedCompetencies}

                warrants={warrants}

                claimText={claimText}

                claimScore={draftModel?.claimQualityScore}

            />


            {errors.general && (

                <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700">
                    <AlertCircle size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
                    {errors.general}
                </div>

            )}


        </div>

    );

}
