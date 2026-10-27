// BNConfigPanel.jsx
// 🧠 Enterprise ECD — Bayesian Network Configuration Panel
// --------------------------------------------------------
// Defines probabilistic diagnostic structure linking
// observable evidence variables to the competency claim.
//
// Current architecture:
// • single latent claim node
// • observable evidence nodes
// • directed edges Claim → Observables
//
// Future support:
// • multi-latent networks
// • skill hierarchies
// • evidence nodes with multiple parents

import React, { useEffect, useMemo } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { useEvidenceWizardContext } from "../../EvidenceWizardContext";
import EvidenceChainCard from "../EvidenceChainCard";

export default function BNConfigPanel({

    model,
    observables = [],
    warrants = [],
    evidenceRules = [],
    onChange,
    locked

}) {

    const { selectedCompetency } =
        useEvidenceWizardContext();


    /* =====================================================
       Competency Context
    ===================================================== */

    const competencyName =
        selectedCompetency?.name || "Competency";


    /* =====================================================
       Latent Node
    ===================================================== */

    const latentNodeId =
        model?.structureConfig?.latentNodes?.[0] ||
        "CLAIM_NODE";


    /* =====================================================
       Configuration State
    ===================================================== */

    const config = model.structureConfig || {

        latentNodes: [latentNodeId],

        observableIds: [],

        edges: []

    };


    /* =====================================================
       Latent node persistence

       StatisticalModelSelector resets structureConfig to `{}` when the
       model family is chosen, and `{}` is truthy -- so the default object
       above never applied and `latentNodes` was only ever written if some
       other edit happened to carry it along. It never did, because
       updateStructure spreads the same empty config back.

       The consequence showed up at confirmation, not here: schema.js
       requires `Bayesian model <id> must contain exactly one latent node`,
       so a Bayesian model configured entirely through this panel failed to
       confirm with an error naming a node the UI never asked the author
       about. Write it as soon as the panel mounts, and guarantee it on
       every subsequent edit.
    ===================================================== */

    useEffect(() => {

        if (locked) return;

        if (config.latentNodes?.length === 1) return;

        onChange({

            ...config,

            latentNodes: [latentNodeId],

            observableIds: config.observableIds || [],

            edges: config.edges || []

        });

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [model.id, config.latentNodes?.length, locked]);


    const updateStructure = (updates) => {

        onChange({

            ...config,

            latentNodes: config.latentNodes?.length
                ? config.latentNodes
                : [latentNodeId],

            ...updates

        });

    };


    /* =====================================================
       Edge Creation Helper
    ===================================================== */

    const createEdge = (obsId) => ({

        from: latentNodeId,

        to: obsId,

        type: "evidence"

    });


    /* =====================================================
       Observable Toggle
    ===================================================== */

    const toggleObservable = (obsId, checked) => {

        const ids = new Set(config.observableIds || []);

        let edges = [...(config.edges || [])];

        if (checked) {

            ids.add(obsId);

            if (!edges.some(e => e.to === obsId)) {

                edges.push(createEdge(obsId));

            }

        }

        else {

            ids.delete(obsId);

            edges =
                edges.filter(e => e.to !== obsId);

        }

        updateStructure({

            observableIds: Array.from(ids),

            edges

        });

    };


    /* =====================================================
       Select All Observables
    ===================================================== */

    const toggleSelectAll = (checked) => {

        if (checked) {

            const ids =
                observables.map(o => o.id);

            const edges =
                ids.map(createEdge);

            updateStructure({

                observableIds: ids,

                edges

            });

        }

        else {

            updateStructure({

                observableIds: [],

                edges: []

            });

        }

    };


    /* =====================================================
       Derived State
    ===================================================== */

    const allSelected = useMemo(() => {

        return config.observableIds?.length ===
            observables.length;

    }, [config.observableIds, observables]);


    /* =====================================================
       Helpers
    ===================================================== */

    const truncate = (text, max = 90) => {

        if (!text) return "";

        return text.length > max
            ? text.slice(0, max) + "..."
            : text;

    };


    /* =====================================================
       Network Summary
    ===================================================== */

    const networkSummary = useMemo(() => {

        return {

            latentNodes:
                config.latentNodes?.length || 0,

            observableNodes:
                config.observableIds?.length || 0,

            edges:
                config.edges?.length || 0

        };

    }, [config]);


    /* =====================================================
       UI
    ===================================================== */

    return (

        <div className="space-y-6">


            {/* =====================================================
                Header
            ===================================================== */}

            <div>

                <h3 className="text-sm font-semibold text-slate-800">

                    Bayesian Network Structure

                </h3>

                <p className="mt-1 text-sm text-slate-500">

                    Configure the probabilistic diagnostic model
                    linking observable evidence variables to
                    the competency claim.

                </p>

            </div>


            {/* =====================================================
                Latent Node Context
            ===================================================== */}

            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3.5 text-sm text-blue-800">

                <Info size={16} strokeWidth={2} className="mt-0.5 shrink-0" />

                <div className="space-y-1.5">

                    <div className="font-medium text-sm">

                        Latent Claim Node

                    </div>

                    <div className="text-xs text-blue-700/80">

                        Represents the latent competency being inferred.

                    </div>

                    <div className="text-sm">

                        Node ID:

                        <span className="ml-2 font-mono">

                            {latentNodeId}

                        </span>

                    </div>

                    <div className="text-sm">

                        Competency:

                        <span className="ml-2 font-medium">

                            {competencyName}

                        </span>

                    </div>

                </div>

            </div>


            {/* =====================================================
                Observable Evidence Nodes
            ===================================================== */}

            <div>

                <label className="mb-1.5 block text-sm font-medium text-slate-700">

                    Observable Evidence Nodes <span className="text-red-500">*</span>

                </label>


                <div className="flex items-center gap-2 mb-3">

                    <input

                        type="checkbox"

                        checked={allSelected}

                        onChange={(e) =>
                            toggleSelectAll(e.target.checked)
                        }

                        disabled={locked}

                        className="h-4 w-4 rounded border-slate-300 accent-slate-900"

                    />

                    <span className="text-sm font-medium text-slate-700">

                        Connect All Observables

                    </span>

                </div>


                <div className="space-y-3 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">

                    {observables.map(obs => {

                        const included =
                            config.observableIds?.includes(obs.id);

                        return (

                            <EvidenceChainCard
                                key={obs.id}
                                observable={obs}
                                warrants={warrants}
                                evidenceRules={evidenceRules}
                                checked={included}
                                onToggle={toggleObservable}
                                locked={locked}
                            />

                        );

                    })}

                </div>

                <p className="mt-1.5 text-xs text-slate-400">

                    Observable variables provide probabilistic
                    evidence about the competency claim.

                </p>

            </div>


            {/* =====================================================
                Network Structure Summary
            ===================================================== */}

            <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-5">

                <div className="font-medium text-sm text-slate-800 mb-2">

                    Network Summary

                </div>

                <div className="text-xs text-slate-600 space-y-1">

                    <div>
                        Latent Nodes:
                        <span className="ml-1 font-mono text-slate-900">
                            {networkSummary.latentNodes}
                        </span>
                    </div>

                    <div>
                        Observable Nodes:
                        <span className="ml-1 font-mono text-slate-900">
                            {networkSummary.observableNodes}
                        </span>
                    </div>

                    <div>
                        Edges:
                        <span className="ml-1 font-mono text-slate-900">
                            {networkSummary.edges}
                        </span>
                    </div>

                </div>

            </div>


            {/* =====================================================
                Network Dependency Preview
            ===================================================== */}

            <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-5">

                <div className="font-medium text-sm text-slate-800 mb-3">

                    Dependency Preview

                </div>

                <div className="text-xs font-mono text-slate-600 space-y-1">

                    <div>{latentNodeId}</div>

                    {config.observableIds?.map(id => (

                        <div key={id}>

                            └── {id}

                        </div>

                    ))}

                </div>

            </div>


            {/* =====================================================
                Governance Notice
            ===================================================== */}

            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">

                <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />

                <span>

                    Delivery scores one latent student model variable, the observables that depend on it, and a conditional probability table. A second latent node, an edge between observables, or a continuous student model variable is refused.

                </span>

            </div>

        </div>

    );

}