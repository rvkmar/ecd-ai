// WarrantCard.jsx
// 🧠 Enterprise ECD Warrant Card (Refactored)
// --------------------------------------------------------------------
// Research-grade warrant authoring component used in Evidence Model Step 3.
//
// Improvements over previous version
// • Builder integration slot (children)
// • Deterministic Toulmin reasoning generation
// • Buffered editing with stable sync
// • Optimized memo diagnostics
// • Collapsible enterprise UI
// • Drag-safe header interactions
// • Construct resolution from competency

import React, { useState, useEffect, memo, useMemo } from "react";
import { GripVertical, Trash2, ChevronDown, ChevronUp, Check, AlertTriangle } from "lucide-react";
import WarrantBuilder from "./WarrantBuilder";
import { runWarrantDiagnostics } from "../components/diagnostics/warrantDiagnostics";

function WarrantCard({

    warrant,

    index,

    competencies = [],

    errors = {},

    collapseAll = false,

    onChange,

    onRemove,

    disableRemove = false,

    dragAttributes = {},

    dragListeners = {},

    locked,

    children

}) {


    /* =====================================================
       Collapse State
    ===================================================== */

    const [collapsed, setCollapsed] = useState(true);

    useEffect(() => {

        setCollapsed(collapseAll);

    }, [collapseAll]);


    /* =====================================================
       Resolve Competency
    ===================================================== */

    const competency = useMemo(() => {

        if (!warrant?.competencyId) return null;

        return competencies?.find(
            c => c.id === warrant?.competencyId
        ) || null;

    }, [competencies, warrant?.competencyId]);


    const constructLabel = competency

        ? `${competency.domain} → ${competency.strand} → ${competency.facet}`

        : "Unassigned Construct";


    /* =====================================================
       Construct (competencyId) Assignment

       Previously the only way to see a warrant's construct binding was
       this badge -- there was no control anywhere to set it, so a warrant
       that came in unbound (e.g. an older bulk upload) was a dead end:
       "Unassigned Construct" forever, with Step 3's Next button disabled
       and no way to fix it short of editing the raw record. onChange here
       calls straight through with a partial update (bypassing the
       reasoning-statement buffer above, which doesn't track competencyId)
       so it's applied immediately via updateWarrant's merge.
    ===================================================== */

    function handleConstructChange(e) {

        const newCompetencyId = e.target.value || null;

        if (onChange) onChange({ competencyId: newCompetencyId });

    }


    /* =====================================================
       Inline Validation Errors (Step3Warrants keys these by index:
       competency-, cognitive-, condition-, limitation-, reasoning-).
       These used to be computed and passed down but never rendered
       anywhere, so Step 3's "Next" button could disable itself with
       no visible explanation or remedy.
    ===================================================== */

    const cardErrors = [

        errors?.[`competency-${index}`],

        errors?.[`cognitive-${index}`],

        errors?.[`condition-${index}`],

        errors?.[`limitation-${index}`],

        errors?.[`reasoning-${index}`]

    ].filter(Boolean);


    /* =====================================================
       Buffered Editing State
    ===================================================== */

    const [buffer, setBuffer] = useState({

        observableEvidence: "",

        performanceCondition: "",

        cognitiveAttribute: "",

        warrantRule: "",

        backing: "",

        backingEvidence: "",

        limitationClause: "",

        reasoningStatement: ""

    });


    useEffect(() => {

        setBuffer({

            observableEvidence: warrant?.observableEvidence || "",

            performanceCondition: warrant?.performanceCondition || "",

            cognitiveAttribute: warrant?.cognitiveAttribute || "",

            warrantRule: warrant?.warrantRule || "",

            backing: warrant?.backing || warrant?.backingEvidence || "",

            backingEvidence: warrant?.backingEvidence || warrant?.backing || "",

            limitationClause: warrant?.limitationClause || "",

            reasoningStatement: warrant?.reasoningStatement || ""

        });


    }, [warrant]);


    /* =====================================================
       Toulmin Reasoning Generator
    ===================================================== */

    function generateReasoning(b) {

        if (!b.observableEvidence || !b.cognitiveAttribute) return "";


        let text = `Observed evidence that the student ${b.observableEvidence}`;


        if (b.performanceCondition)

            text += ` ${b.performanceCondition}`;


        text += ` provides support for the inference that the student possesses ${b.cognitiveAttribute}.`;


        if (b.warrantRule)

            text += ` This inference is justified because ${b.warrantRule}.`;


        if (b.backingEvidence)

            text += ` This interpretation is supported by ${b.backingEvidence}.`;


        if (b.limitationClause)

            text += ` However, this inference may not hold if ${b.limitationClause}.`;


        return text;

    }


    /* =====================================================
       Auto Reasoning Regeneration
    ===================================================== */

    useEffect(() => {

        const reasoning = generateReasoning(buffer);


        if (reasoning && reasoning !== buffer.reasoningStatement) {

            const updated = {

                ...buffer,

                reasoningStatement: reasoning

            };


            setBuffer(updated);


            if (onChange) onChange(updated);

        }


    }, [

        buffer.observableEvidence,

        buffer.performanceCondition,

        buffer.cognitiveAttribute,

        buffer.warrantRule,

        buffer.backingEvidence,

        buffer.limitationClause

    ]);


    /* =====================================================
       Field Update
    ===================================================== */

    function updateField(field, value) {

        const updated = {

            ...buffer,

            [field]: value

        };

        if (field === "backing" || field === "backingEvidence") {
            updated.backing = value;
            updated.backingEvidence = value;
        }


        setBuffer(updated);


        if (onChange) onChange(updated);

    }

    /* =====================================================
       Apply Builder Patch
    ===================================================== */

    function applyBuilderPatch(patch) {

        const updated = {
            ...buffer,
            observableEvidence: patch.observableEvidence ?? buffer.observableEvidence,
            cognitiveAttribute: patch.cognitiveAttribute ?? buffer.cognitiveAttribute,
            performanceCondition: patch.performanceCondition ?? buffer.performanceCondition,
            warrantRule: patch.warrantRule ?? buffer.warrantRule,
            backing: patch.backing ?? patch.backingEvidence ?? buffer.backing,
            backingEvidence: patch.backingEvidence ?? patch.backing ?? buffer.backingEvidence,
            limitationClause: patch.limitationClause ?? buffer.limitationClause,
            reasoningStatement: patch.reasoningStatement ?? buffer.reasoningStatement
        };

        setBuffer(updated);

        if (onChange) onChange(updated);

    }


    /* =====================================================
       Warrant Strength Diagnostics
    ===================================================== */

    const diagnostics = useMemo(() => {

        return runWarrantDiagnostics(buffer);

    }, [buffer]);


    /* =====================================================
       Collapsed Summary
    ===================================================== */

    const summary =

        buffer.reasoningStatement?.slice(0, 800) ||

        "Empty warrant";


    /* =====================================================
       UI
    ===================================================== */

    return (

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">


            {/* Header */}

            <div

                className="flex justify-between items-center gap-3 px-5 py-4 text-left cursor-pointer"

                onClick={() => setCollapsed(!collapsed)}

            >


                <div className="flex items-center gap-3">


                    <span

                        {...(locked ? {} : dragAttributes)}

                        {...(locked ? {} : dragListeners)}

                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 cursor-grab select-none transition hover:bg-slate-100 hover:text-slate-700"

                        onClick={(e) => e.stopPropagation()}

                    >

                        <GripVertical size={16} strokeWidth={2} />

                    </span>


                    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-600">

                        Warrant {index + 1}

                    </span>


                    {locked || competencies.length === 0 ? (

                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide bg-blue-100 text-blue-700">

                            {constructLabel}

                        </span>

                    ) : (

                        <select

                            value={warrant?.competencyId || ""}

                            onChange={handleConstructChange}

                            onClick={(e) => e.stopPropagation()}

                            className={`rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${warrant?.competencyId ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}

                        >

                            <option value="">Unassigned Construct</option>

                            {competencies.map(c => (

                                <option key={c.id} value={c.id}>

                                    {[c.domain, c.strand, c.facet].filter(Boolean).join(" → ") || c.name || c.id}

                                </option>

                            ))}

                        </select>

                    )}

                </div>



                <div className="flex items-center gap-3">
                    {!locked && (
                        <button

                            type="button"

                            className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none"

                            disabled={disableRemove}

                            onClick={(e) => {

                                e.stopPropagation();

                                onRemove?.();

                            }}

                        >

                            <Trash2 size={14} strokeWidth={2} />

                            Remove

                        </button>

                    )}

                    <span className="text-slate-400">

                        {collapsed ? <ChevronDown size={16} strokeWidth={2} /> : <ChevronUp size={16} strokeWidth={2} />}

                    </span>


                </div>


            </div>


            {/* Inline validation errors -- previously computed by Step3Warrants
                and passed in as `errors` but never rendered, so a disabled
                Next button gave no clue which warrant (or which field) was
                the problem. Shown even while collapsed. */}

            {cardErrors.length > 0 && (

                <div className="border-t border-red-100 bg-red-50 px-6 py-3 space-y-1">

                    {cardErrors.map((message, i) => (

                        <div key={i} className="flex items-start gap-1.5 text-sm text-red-700">
                            <AlertTriangle size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
                            <span>{message}</span>
                        </div>

                    ))}

                </div>

            )}


            {/* Body */}


            {collapsed && (
                <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-4 text-sm text-slate-600 text-justify">

                    {summary}

                </div>

            )}


            {!collapsed && (

                <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-6 space-y-5">


                    {/* Warrant Strength */}

                    <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">

                        <div className="flex justify-between mb-1">

                            <span className="font-medium text-slate-800">

                                Warrant Strength

                            </span>


                            <span className="text-slate-700">

                                {diagnostics.strengthScore}/100

                            </span>


                        </div>


                        <div className="w-full bg-slate-200 rounded h-2">

                            <div

                                className="h-2 rounded bg-emerald-500"

                                style={{ width: `${diagnostics.strengthScore}%` }}

                            />


                        </div>


                        <div className="mt-2 space-y-1">


                            {diagnostics.diagnostics.map((d, i) => (

                                <div key={i} className="flex items-center gap-1.5 text-emerald-700">

                                    <Check size={14} strokeWidth={2} className="shrink-0" />
                                    {d.message}

                                </div>

                            ))}


                            {diagnostics.warnings.map((w, i) => (

                                <div key={i} className="flex items-center gap-1.5 text-amber-700">

                                    <AlertTriangle size={14} strokeWidth={2} className="shrink-0" />
                                    {w.message}

                                </div>

                            ))}


                        </div>


                    </div>


                    {/* Observable Evidence */}

                    <InputField

                        label="Observable Evidence"

                        value={buffer.observableEvidence}

                        onChange={(v) => updateField("observableEvidence", v)}

                        locked={locked}

                    />


                    {/* Cognitive Attribute */}

                    <InputField

                        label="Cognitive Attribute"

                        value={buffer.cognitiveAttribute}

                        onChange={(v) => updateField("cognitiveAttribute", v)}

                        locked={locked}

                    />


                    {/* Performance Condition */}

                    <InputField

                        label="Performance Condition"

                        value={buffer.performanceCondition}

                        onChange={(v) => updateField("performanceCondition", v)}

                        locked={locked}

                    />


                    {/* Warrant Rule */}

                    <TextareaField

                        label="Warrant Reasoning Rule"

                        value={buffer.warrantRule}

                        onChange={(v) => updateField("warrantRule", v)}

                        locked={locked}

                    />


                    {/* Backing Evidence */}

                    <InputField

                        label="Theoretical / Empirical Backing"

                        value={buffer.backingEvidence}

                        onChange={(v) => updateField("backingEvidence", v)}

                        locked={locked}

                    />


                    {/* Rebuttal */}

                    <InputField

                        label="Rebuttal / Limitation"

                        value={buffer.limitationClause}

                        onChange={(v) => updateField("limitationClause", v)}

                        locked={locked}

                    />


                    {/* Reasoning */}

                    <TextareaField

                        label="Generated Warrant Statement"

                        value={buffer.reasoningStatement}

                        onChange={(v) => updateField("reasoningStatement", v)}

                        locked={locked}

                    />

                </div>

            )}


        </div>

    );

}


/* =====================================================
   Field Components
===================================================== */

function InputField({ label, value, onChange, locked }) {

    return (

        <div>

            <label className="mb-1.5 block text-sm font-medium text-slate-700">

                {label}

            </label>


            <input

                className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"

                value={value}

                onChange={(e) => onChange(e.target.value)}

                disabled = {locked}

            />


        </div>

    );

}


function TextareaField({ label, value, onChange, locked }) {

    return (

        <div>

            <label className="mb-1.5 block text-sm font-medium text-slate-700">

                {label}

            </label>


            <textarea

                rows={5}

                className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"

                value={value}

                onChange={(e) => onChange(e.target.value)}

                disabled = {locked}

            />


        </div>

    );

}


export default memo(WarrantCard);