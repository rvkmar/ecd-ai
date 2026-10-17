// StatisticalModelSelector.jsx
// Enterprise ECD — Statistical Model Selector
// ------------------------------------------------
// Responsible for selecting the statistical model
// family and subtype used in the Evidence Model.

import React, { useMemo } from "react";
import { Info } from "lucide-react";

import { useDomainAnalyses } from "@/api/queries/domainAnalyses";
import PerspectiveAtDecision from "@/components/authoring/PerspectiveAtDecision";
import { readStudentPerspective } from "@/utils/perspectiveInheritance";

import { useEvidenceWizardContext }
    from "../EvidenceWizardContext";

import {
    getModelAvailability,
    getModelGuidance
}
    from "../components/utils/modelGuidanceLibrary";

import {
    getSubtypeOptions,
    getSubtypeMetadata
}
    from "../components/utils/modelSubtypeEngine";

import ModelSelectionCard
    from "../components/modelCards/ModelSelectionCard";


export default function StatisticalModelSelector({

    model,
    onChange,
    locked

}) {

    const { selectedCompetency, selectedCompetencyModel } =
        useEvidenceWizardContext();
    const { data: domainAnalyses = [] } = useDomainAnalyses();
    const perspectiveReading = readStudentPerspective(
        selectedCompetencyModel,
        domainAnalyses
    );


    /* =====================================================
       Competency Context
    ===================================================== */

    const variableType =
        selectedCompetency?.variableType;

    const competencyName =
        selectedCompetency?.name || "Competency";


    /* =====================================================
       Model Families

       Every family the platform supports, each flagged with whether
       this competency's variable type permits it. Incompatible ones
       render disabled, with the reason on the card -- see
       getModelAvailability() in modelGuidanceLibrary.js for why they
       are shown rather than filtered out.
    ===================================================== */

    const modelOptions = useMemo(() => {

        return getModelAvailability(variableType);

    }, [variableType]);


    const availableCount = useMemo(() => {

        return modelOptions.filter(m => m.compatible).length;

    }, [modelOptions]);


    /* =====================================================
       Model Selection
    ===================================================== */

    /* Structure defaults that a model of this family cannot be valid
       without. Switching family deliberately discards the previous
       family's config -- an IRT observable mapping means nothing to a
       threshold rule -- but resetting to a bare `{}` left a Bayesian
       network with no latent node, which schema.js rejects at
       confirmation ("Bayesian model ... must contain exactly one latent
       node") with an error the author has no control in Step 6 to answer.
       BNConfigPanel repairs this on mount as well; seeding here means it
       holds even for a model whose config panel is never expanded. */

    const defaultStructureConfig = (type) => {

        if (type === "bayesian_network") {

            return {

                latentNodes: ["CLAIM_NODE"],

                observableIds: [],

                edges: []

            };

        }

        if (type === "ctt") {

            return {

                observableIds: [],

                weights: {},

                scoreScale: "raw",

                reliabilityTarget: 0.7

            };

        }

        if (type === "sum") {

            return {

                observableIds: [],

                weights: {},

                normalization: false

            };

        }

        return {};

    };


    const selectModel = (type) => {

        // Selecting a family the competency does not permit would produce a
        // model that fails validation the moment the author moves on, so the
        // card is inert rather than merely styled as inert.
        const option = modelOptions.find(m => m.type === type);

        if (option && !option.compatible) return;

        onChange({

            ...model,

            type,

            subtype: "",

            structureConfig: defaultStructureConfig(type)

        });

    };


    /* =====================================================
       Scoring Mode
    ===================================================== */

    const scoringMode =
        model?.structureConfig?.scoringMode ||
        "binary";


    /* =====================================================
       Allowed Subtypes (from Engine)
    ===================================================== */

    const subtypeOptions = useMemo(() => {

        if (!model.type) return [];

        return getSubtypeOptions({

            modelType: model.type,
            scoringMode

        });

    }, [model.type, scoringMode]);


    /* =====================================================
       Subtype Selection
    ===================================================== */

    const selectSubtype = (subtype) => {

        onChange({

            ...model,

            subtype

        });

    };


    /* =====================================================
       UI
    ===================================================== */

    return (

        <div className="space-y-6">


            {/* =====================================================
                Model Selection Cards
            ===================================================== */}

            <PerspectiveAtDecision reading={perspectiveReading} />

            <div>

                <div className="mb-1 flex items-baseline justify-between gap-3">

                    <div className="text-sm font-semibold text-slate-800">

                        Select Statistical Model (Complexity Level)

                    </div>

                    {variableType && (

                        <div className="text-xs text-slate-500">

                            {availableCount} of {modelOptions.length} available for a{" "}

                            <span className="font-semibold text-slate-700">

                                {variableType}

                            </span>{" "}

                            competency

                        </div>

                    )}

                </div>


                {!variableType && (

                    <div className="mb-3 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">

                        <Info size={16} strokeWidth={2} className="mt-0.5 shrink-0" />

                        <span>

                            The target competency has no variable type, so no
                            statistical model can be judged compatible. Set the
                            variable type on the competency, then return here.

                        </span>

                    </div>

                )}


                <div className="mt-3 grid grid-cols-2 gap-4">

                    {modelOptions.map(meta => (

                        <ModelSelectionCard

                            key={meta.type}

                            modelMeta={meta}

                            selected={model.type === meta.type}

                            onSelect={selectModel}

                            locked={locked}

                            disabled={!meta.compatible}

                            reason={meta.reason}

                        />

                    ))}

                </div>

            </div>


            {/* =====================================================
                Model Guidance
            ===================================================== */}

            {model.type && (

                <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3.5 text-sm text-blue-800">

                    <Info size={16} strokeWidth={2} className="mt-0.5 shrink-0" />

                    <span>{getModelGuidance(model.type)?.description}</span>

                </div>

            )}


            {/* =====================================================
                Subtype Selector
            ===================================================== */}

            {subtypeOptions.length > 0 && (

                <div>

                    <label className="mb-1.5 block text-sm font-medium text-slate-700">

                        Measurement Model Variant

                    </label>

                    <select

                        className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"

                        value={model.subtype || ""}

                        onChange={(e) =>
                            selectSubtype(e.target.value)
                        }

                        disabled={locked}

                    >

                        <option value="">

                            Select model variant

                        </option>

                        {subtypeOptions.map(option => (

                            <option

                                key={option.value}

                                value={option.value}

                            >

                                {option.label}

                            </option>

                        ))}

                    </select>


                    {/* Subtype Description */}

                    {model.subtype && (

                        <div className="mt-1.5 text-xs text-slate-400">

                            {

                                getSubtypeMetadata(model.subtype)
                                    ?.description

                            }

                        </div>

                    )}

                </div>

            )}


            {/* =====================================================
                Active Model Toggle
            ===================================================== */}

            <div className="flex items-center gap-2">

                <input

                    type="checkbox"

                    checked={model.active || false}

                    onChange={(e) =>

                        onChange({

                            ...model,

                            active: e.target.checked

                        })

                    }

                    disabled={locked}

                    className="h-4 w-4 rounded border-slate-300 accent-slate-900"

                />

                <label className="text-sm font-medium text-slate-700">

                    Set as Active Model

                </label>

            </div>


            {/* =====================================================
                Competency Context
            ===================================================== */}

            <div className="text-xs text-slate-500">

                Model selected for competency:

                <strong className="text-slate-700"> {competencyName}</strong>

            </div>

        </div>

    );

}
