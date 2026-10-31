// WarrantBuilder.jsx
// 🧠 Enterprise ECD Warrant Builder (Claim‑Bound Version)
// ------------------------------------------------------------------
// This version assumes the competency is already determined in
// Step1 (Claim Identity). Therefore the builder is *bound to a single
// competency* and does not allow selecting a different construct.
//
// Responsibilities
// • Generate vocabulary from competency + claim
// • Suggest high‑quality warrants
// • Allow structured warrant construction
// • Produce Toulmin‑style reasoning statements
// • Return completed warrant objects

import { useState, useMemo, useEffect } from "react";
import { Sparkles, Wand2, Plus } from "lucide-react";

import {
    generateWarrantVocabulary,
    generateWarrantStatement
} from "../components/vocabulary/warrantVocabularyEngine";

import {
    generateWarrantSuggestions
} from "../components/engines/warrantSuggestionEngine";

import CognitiveAttributeSelector from "./CognitiveAttributeSelector";

export default function WarrantBuilder({

    claimText = "",

    competency = null,

    competencyModel = null,

    onCreate

}) {


    /* =====================================================
       Builder Visibility
    ===================================================== */

    const [isOpen, setIsOpen] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(true);

    /* =====================================================
       Builder State
    ===================================================== */

    const [builder, setBuilder] = useState({

        behavior: "",

        attribute: "",

        condition: "",

        rule: "",

        backing: "",

        limitation: ""

    });


    /* =====================================================
       Vocabulary Engine
    ===================================================== */

    const vocabulary = useMemo(() => {

        if (!competency) return null;


        return generateWarrantVocabulary({

            competency,

            competencyModel,

            claimText

        });


    }, [competency, competencyModel, claimText]);


    /* =====================================================
       Suggestion Engine
    ===================================================== */

    const suggestions = useMemo(() => {

        if (!competency || !claimText) return [];


        return generateWarrantSuggestions({

            claimText,

            competency

        });


    }, [claimText, competency]);


    /* =====================================================
       Initialize Builder Defaults
    ===================================================== */

    useEffect(() => {

        if (!vocabulary) return;


        setBuilder(prev => ({

            ...prev,

            attribute: prev.attribute || vocabulary.attributes?.[0] || "",

            condition: prev.condition || vocabulary.conditions?.[0] || "",

            limitation: prev.limitation || vocabulary.limitations?.[0] || "",

            rule: prev.rule || vocabulary.warrantRules?.[0] || "",

            backing: prev.backing || vocabulary.backingEvidence?.[0] || ""

        }));


    }, [vocabulary]);


    /* =====================================================
       Generated Warrant Statement
    ===================================================== */

    const generatedWarrant = useMemo(() => {

        if (
            !builder.behavior ||
            !builder.attribute ||
            !builder.condition ||
            !builder.rule ||
            !builder.backing ||
            !builder.limitation
        ) return "";


        return generateWarrantStatement({

            behavior: builder.behavior,

            condition: builder.condition,

            attribute: builder.attribute,

            rule: builder.rule,

            backing: builder.backing,

            limitation: builder.limitation

        });


    }, [builder]);


    /* =====================================================
       Update Builder Field
    ===================================================== */

    function updateField(field, value) {

        setBuilder(prev => ({

            ...prev,

            [field]: value

        }));

    }


    /* =====================================================
       Apply Suggested Warrant
    ===================================================== */

    function applySuggestion(suggestion) {

        setBuilder({

            behavior: suggestion.observableEvidence || "",

            attribute: suggestion.cognitiveAttribute || "",

            condition: suggestion.performanceCondition || "",

            rule: suggestion.warrantRule || "",

            backing: suggestion.backingEvidence || "",

            limitation:
                suggestion.limitationClause ||
                suggestion.rebuttalCondition ||
                ""

        });

    }


    /* =====================================================
       Create Warrant
    ===================================================== */

    function handleCreate() {

        if (!generatedWarrant || !competency) return;


        const newWarrant = {

            id: `w${Date.now()}`,

            competencyId: competency.id,

            observableEvidence: builder.behavior,

            cognitiveAttribute: builder.attribute,

            performanceCondition: builder.condition,

            warrantRule: builder.rule,

            // Schema field is `backing`. The card and older saves still
            // read `backingEvidence`. Write both so a save does not drop it.
            backing: builder.backing,

            backingEvidence: builder.backing,

            // Canonical field name for the Toulmin rebuttal is
            // `limitationClause` -- that is what schema.js validates,
            // what WarrantCard edits, what Step 8 / ItemWizard render and
            // what the generated reasoning statement is built from. This
            // builder used to emit `rebuttalCondition` instead, so a
            // warrant created here arrived with the rebuttal the author
            // had just typed stored under a name nothing else read: the
            // card showed an empty "Rebuttal / Limitation" box, warrant
            // diagnostics reported "Rebuttal condition not specified.",
            // and saving failed schema validation with
            // "Warrant w... missing limitationClause."
            //
            // `rebuttalCondition` is still written alongside it so the
            // suggestion engine's own vocabulary (which speaks in
            // rebuttals) and any consumer written against the old name
            // keep working.
            limitationClause: builder.limitation,

            rebuttalCondition: builder.limitation,

            reasoningStatement: generatedWarrant

        };


        if (onCreate) onCreate(newWarrant);


        setBuilder({

            behavior: "",

            attribute: "",

            condition: "",

            rule: "",

            backing: "",

            limitation: ""

        });

    }


    if (!competency) return null;


    /* =====================================================
       UI
    ===================================================== */

    return (

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-5 space-y-5">


            {/* Header */}

            <div className="flex justify-between items-center">

                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                    <Wand2 size={16} strokeWidth={2} className="text-slate-400" />
                    Build a Structured Warrant for the claim
                </h3>

                <div className="flex items-center gap-2">

                    {/* Suggestions toggle only when builder is open */}
                    {isOpen && (
                        <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                            onClick={() => setShowSuggestions(prev => !prev)}
                        >
                            {showSuggestions ? "Hide Suggestions" : "Show Suggestions"}
                        </button>
                    )}

                    {/* Builder toggle */}
                    <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                        onClick={() => {
                            const next = !isOpen;
                            setIsOpen(next);

                            if (!next) {
                                setShowSuggestions(false);
                            }
                        }}
                    >
                        {isOpen ? "Hide Builder" : "Show Builder"}
                    </button>

                </div>

            </div>


            {isOpen && (

                <div className="space-y-5">


                    {/* Suggested Warrants */}

                    {showSuggestions && (

                        <div className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3.5 text-sm text-blue-800">

                            <div className="text-sm font-semibold flex items-center gap-1.5">
                                <Sparkles size={14} strokeWidth={2} className="shrink-0" />
                                Suggested Warrants
                            </div>

                            {suggestions.length === 0 && (
                                <div className="text-xs text-slate-500">
                                    No suggestions available for this claim.
                                </div>
                            )}

                            {suggestions.map((s, i) => (

                                <div key={i} className="flex gap-3 items-start text-sm">

                                    <div className="flex-1 text-slate-700">
                                        {s.reasoningStatement}
                                    </div>


                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-1 shrink-0 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                                        onClick={() => applySuggestion(s)}
                                    >
                                        Use
                                    </button>

                                </div>

                            ))}


                        </div>

                    )}


                    {/* Builder Grid -- grouped into Toulmin-structured pairs
                        (data+basis / context+rule / backing+rebuttal) and laid
                        out two-up so the panel reads as three compact rows
                        instead of six stacked full-width dropdowns. Each group
                        carries its own accent color so the panel isn't a wall
                        of identical gray boxes when expanded. */}

                    {vocabulary && (

                        <div className="space-y-4">

                            <FieldGroup label="Data" accent="border-sky-300 bg-sky-50/60">
                                <SelectField
                                    label="Observable Evidence"
                                    value={builder.behavior}
                                    options={vocabulary.behaviors}
                                    onChange={(v) => updateField("behavior", v)}
                                />
                                <CognitiveAttributeSelector
                                    value={builder.attribute}
                                    onChange={(v) => updateField("attribute", v)}
                                />
                            </FieldGroup>

                            <FieldGroup label="Warrant" accent="border-violet-300 bg-violet-50/60">
                                <SelectField
                                    label="Performance Context"
                                    value={builder.condition}
                                    options={vocabulary.conditions}
                                    onChange={(v) => updateField("condition", v)}
                                />
                                <SelectField
                                    label="Warrant Reasoning Rule"
                                    value={builder.rule}
                                    options={vocabulary.warrantRules}
                                    onChange={(v) => updateField("rule", v)}
                                />
                            </FieldGroup>

                            <FieldGroup label="Backing" accent="border-amber-300 bg-amber-50/60">
                                <SelectField
                                    label="Theoretical / Empirical Backing"
                                    value={builder.backing}
                                    options={vocabulary.backingEvidence}
                                    onChange={(v) => updateField("backing", v)}
                                />
                                <SelectField
                                    label="Rebuttal / Limitation"
                                    value={builder.limitation}
                                    options={vocabulary.limitations}
                                    onChange={(v) => updateField("limitation", v)}
                                />
                            </FieldGroup>

                        </div>

                    )}


                    {/* Generated Warrant */}

                    {generatedWarrant && (

                        <div className="rounded-md border border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-700">

                            <span className="text-sm font-semibold text-slate-800">Generated Warrant</span>


                            <p className="mt-2 whitespace-pre-line">
                                {generatedWarrant}
                            </p>

                        </div>

                    )}


                    {/* Create Button */}

                    <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none"
                        disabled={!generatedWarrant}
                        onClick={handleCreate}
                    >
                        <Plus size={16} strokeWidth={2} />
                        Add Warrant
                    </button>


                </div>

            )}


        </div>

    );

}


/* =====================================================
   Field Group
   Wraps a semantically related pair of fields in a two-column row
   with a distinct accent tint, so the builder reads as a handful of
   labeled Toulmin groups rather than a tall monotone list.
===================================================== */

function FieldGroup({ label, accent, children }) {

    return (

        <div className={`rounded-lg border px-4 py-4 ${accent}`}>

            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {label}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {children}
            </div>

        </div>

    );

}


/* =====================================================
   Reusable Select Field
===================================================== */

function SelectField({ label, value, options = [], onChange }) {

    return (

        <div>

            <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {label}
            </label>


            <select
                className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            >

                <option value="">-- Select --</option>


                {options.map(opt => (

                    <option key={opt} value={opt}>{opt}</option>

                ))}


            </select>


        </div>

    );

}
