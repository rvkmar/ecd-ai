// CompetencyWizard/steps/Step7DomainClassification.jsx
// Step 7 — Domain Classification (Enterprise Production Alignment)
// - Aligns with Step 5 & Step 6 ordering
// - Drag-order awareness (respects Step 4 ordering)
// - Collapsible competency cards
// - Buffered typing (no keystroke lag)
// - Global classification completeness indicator
// - Domain summary analytics panel
// - Locked-state governance alignment

import React, { useMemo, useState, useEffect, memo, useCallback } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useCompetencyWizard } from "../CompetencyWizardContext";
import { motion, AnimatePresence } from "framer-motion";
import { useDomainAnalyses } from "@/api/queries/domainAnalyses";
import { DOMAIN_ANALYSIS_ENTITIES } from "@/utils/schema";

/* =====================================================
   🔹 CARD COMPONENT (MEMOIZED)
   Hoisted to module scope -- previously defined inside
   Step7DomainClassification's render body, which meant it remounted
   on every parent re-render (every domain/strand/facet commit) instead
   of reconciling, resetting the card's own `open` state and killing
   the collapse/expand animation mid-transition -- the "click twice"
   symptom. `isLocked` and `updateCompetency` are now passed explicitly
   instead of closed over.
===================================================== */
const DomainCard = memo(function DomainCard({ comp, isLocked, updateCompetency }) {
    const [open, setOpen] = useState(false);

    const [localDomain, setLocalDomain] = useState(comp.domain || "");
    const [localStrand, setLocalStrand] = useState(comp.strand || "");
    const [localFacet, setLocalFacet] = useState(comp.facet || "");

    useEffect(() => {
        setLocalDomain(comp.domain || "");
        setLocalStrand(comp.strand || "");
        setLocalFacet(comp.facet || "");
    }, [comp.id]);

    const commit = useCallback(
        (field, value) => {
            if (isLocked) return;
            updateCompetency(comp.id, { [field]: value });
        },
        [comp.id, isLocked, updateCompetency]
    );

    const isComplete = comp.domain && comp.strand && comp.facet;

    return (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            {/* HEADER */}
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
                <div>
                    <div className="font-semibold text-slate-900">
                        {comp.name || "Unnamed Competency"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                        {localDomain || "No domain assigned"}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${isComplete
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                    >
                        {isComplete ? "Complete" : "Incomplete"}
                    </span>
                    {open ? (
                        <ChevronUp size={16} strokeWidth={2} className="text-slate-400" />
                    ) : (
                        <ChevronDown size={16} strokeWidth={2} className="text-slate-400" />
                    )}
                </div>
            </button>

            {/* BODY */}
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="space-y-5 border-t border-slate-100 bg-slate-50/60 px-6 py-6"
                    >
                        {/* Domain */}
                        <input
                            type="text"
                            value={localDomain}
                            disabled={isLocked}
                            onChange={(e) => setLocalDomain(e.target.value)}
                            onBlur={(e) => {
                                setLocalDomain(e.target.value);
                                commit("domain", e.target.value);
                            }}
                            placeholder="Domain (e.g., Mathematics)"
                            className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                        />

                        {/* Strand */}
                        <input
                            type="text"
                            value={localStrand}
                            disabled={isLocked}
                            onChange={(e) => setLocalStrand(e.target.value)}
                            onBlur={(e) => {
                                setLocalStrand(e.target.value);
                                commit("strand", e.target.value);
                            }}
                            placeholder="Strand (e.g., Algebra)"
                            className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                        />

                        {/* Facet */}
                        <input
                            type="text"
                            value={localFacet}
                            disabled={isLocked}
                            onChange={(e) => setLocalFacet(e.target.value)}
                            onBlur={(e) => {
                                setLocalFacet(e.target.value);
                                commit("facet", e.target.value);
                            }}
                            placeholder="Facet (e.g., Linear Equations)"
                            className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});

function statementText(row) {
    if (typeof row === "string") return row.trim();
    if (row && typeof row === "object") return String(row.label ?? "").trim();
    return "";
}

export function sectionLines(value) {
    if (Array.isArray(value)) return value.map(statementText).filter(Boolean);
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return [];
}

export default function Step7DomainClassification() {
    const { model, competencies, updateCompetency } = useCompetencyWizard();
    const { data: domainAnalyses = [] } = useDomainAnalyses();
    const analysis = domainAnalyses.find((row) => row.id === model?.domainAnalysisId) || null;

    const isLocked = model?.locked;

    /* =====================================================
       LOCAL ORDER (ALIGN WITH STEP 4 DRAG ORDER)
    ===================================================== */

    const ordered = useMemo(() => {
        return [...competencies].sort((a, b) => {
            return (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
        });
    }, [competencies]);

    /* =====================================================
       COMPLETENESS PROGRESS
    ===================================================== */

    const completion = useMemo(() => {
        if (ordered.length === 0) return 0;

        const completed = ordered.filter(
            (c) => c.domain && c.strand && c.facet
        ).length;

        return Math.round((completed / ordered.length) * 100);
    }, [ordered]);

    /* =====================================================
       DOMAIN SUMMARY ANALYTICS
    ===================================================== */

    const domainSummary = useMemo(() => {
        const map = {};

        ordered.forEach((c) => {
            if (!c.domain) return;

            if (!map[c.domain]) {
                map[c.domain] = { strands: {} };
            }

            if (c.strand) {
                if (!map[c.domain].strands[c.strand]) {
                    map[c.domain].strands[c.strand] = 0;
                }
                map[c.domain].strands[c.strand] += 1;
            }
        });

        return map;
    }, [ordered]);

    /* =====================================================
       RENDER
    ===================================================== */

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-slate-900">
                    Step 7 — Domain Classification
                </h2>
                <p className="mt-1 text-sm text-slate-500 max-w-3xl">
                    Domain, strand, and facet are organizational tags. They do not
                    change the latent structure. The Domain Analysis sections beside
                    them are the analysis you cited, shown here so the tags are not
                    mistaken for a second content outline.
                </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-6">

            {/* Global Progress */}
            <div className="space-y-2">
                <div className="flex justify-between text-sm text-slate-700">
                    <span>Classification Completion</span>
                    <span>{completion}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3">
                    <div
                        className="bg-slate-900 h-3 rounded-full transition-all"
                        style={{ width: `${completion}%` }}
                    />
                </div>
            </div>

            {/* Cards */}
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {ordered.map((comp) => (
                    <DomainCard
                        key={comp.id}
                        comp={comp}
                        isLocked={isLocked}
                        updateCompetency={updateCompetency}
                    />
                ))}
            </div>

            {/* Domain Summary */}
            {Object.keys(domainSummary).length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 text-sm">
                    <h3 className="text-sm font-semibold text-slate-800 mb-4">Domain Overview</h3>
                    {Object.entries(domainSummary).map(([domain, data]) => (
                        <div key={domain} className="mb-3">
                            <div className="font-medium text-slate-800">{domain}</div>
                            <ul className="ml-4 list-disc text-slate-500">
                                {Object.entries(data.strands).map(([strand, count]) => (
                                    <li key={strand}>
                                        {strand} ({count})
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}

            {/* Governance */}
            <div className="text-xs text-slate-500 border-t border-slate-200 pt-4">
                <strong className="font-semibold text-slate-600">ECD Note:</strong> Domain
                classification organizes constructs conceptually. It does not alter latent
                structure, relationships, or inferential modeling.
            </div>
            </div>

            <aside className="h-fit rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800">Domain Analysis sections</h3>
                {!model?.domainAnalysisId && (
                    <p className="mt-2 text-sm text-slate-500">
                        No Domain Analysis is cited. Declare one on Model Identity to see its sections here.
                    </p>
                )}
                {model?.domainAnalysisId && !analysis && (
                    <p className="mt-2 text-sm text-slate-500">
                        The cited Domain Analysis is not in the menu.
                    </p>
                )}
                {analysis && (
                    <div className="mt-3 space-y-3">
                        <p className="text-sm font-medium text-slate-900">{analysis.name}</p>
                        {DOMAIN_ANALYSIS_ENTITIES.map(({ padi, field }) => {
                            const lines = sectionLines(analysis[field]);
                            return (
                                <div key={field}>
                                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{padi}</p>
                                    {lines.length === 0 ? (
                                        <p className="text-sm text-slate-400">No statements</p>
                                    ) : (
                                        <ul className="mt-1 list-disc pl-4 text-sm text-slate-700">
                                            {lines.map((line) => (
                                                <li key={line}>{line}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </aside>
            </div>
        </div>
    );
}
