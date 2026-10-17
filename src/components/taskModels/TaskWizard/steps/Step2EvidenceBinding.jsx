// Step2EvidenceBinding.jsx
// ------------------------------------------------------------
// Task Model Wizard — Step 2: Evidence Binding
// ------------------------------------------------------------
// THE Task Model ↔ Evidence Model link. This is now the only place a
// Task Model acquires its construct: the competency is read off the
// bound Evidence Model rather than picked separately (see Step 1's
// header comment for why the separate competency picker was removed).
//
// Two bugs fixed here relative to the old StepEvidenceModels.jsx:
//
//  1. The "View" details dialog never opened. It rendered
//     `<Modal onClose=...>{children}</Modal>`, but src/components/ui/Modal.jsx
//     takes `{isOpen, onClose, onConfirm, title, message}` and renders no
//     children at all -- with `isOpen` undefined it returned null every
//     time. Details are now an inline expandable panel, which also keeps
//     the comparison visible while you pick.
//
//  2. Observables were listed as `obs.label || obs.id`, but the evidence
//     schema names that field `statement` -- so every observable rendered
//     as a raw id. Fixed everywhere observables are shown.
// ------------------------------------------------------------

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, ChevronDown, ChevronUp, Star } from "lucide-react";
import { isLinkableEvidenceModel } from "@/utils/schema";
import { useCompetencies, useCompetencyModels } from "@/api/queries/competencies";
import { useDomainAnalyses } from "@/api/queries/domainAnalyses";
import { perspectiveReadout, readEvidencePerspective } from "@/utils/perspectiveInheritance";

const STATUS_TONE = {
    confirmed: "bg-blue-100 text-blue-700",
    operational: "bg-emerald-100 text-emerald-700",
    suspended: "bg-orange-100 text-orange-700",
};

export default function Step2EvidenceBinding({
    draft,
    setDraft,
    evidenceModels = [],
    disabled,
}) {
    const [expandedId, setExpandedId] = useState(null);

    // Read-only construct labels. The competency is displayed, never
    // selected -- it belongs to the Evidence Model.
    const { data: competencies = [] } = useCompetencies();
    const { data: competencyModels = [] } = useCompetencyModels();
    const { data: domainAnalyses = [] } = useDomainAnalyses();

    const competencyById = useMemo(() => {
        const map = {};
        competencies.forEach((c) => {
            map[c.id] = c;
        });
        return map;
    }, [competencies]);

    // Defensive: the caller already filters, but a stray archived model
    // arriving here would be silently unlinkable at save time.
    const linkable = useMemo(
        () => (evidenceModels || []).filter(isLinkableEvidenceModel),
        [evidenceModels]
    );

    const selectedIds = draft.evidenceModelIds || [];
    const primaryId = draft.primaryEvidenceModelId || "";

    const toggleEvidence = (evidenceId) => {
        if (disabled) return;

        setDraft((prev) => {
            const current = prev.evidenceModelIds || [];
            const alreadySelected = current.includes(evidenceId);

            const nextIds = alreadySelected
                ? current.filter((id) => id !== evidenceId)
                : [...current, evidenceId];

            // Unbinding an Evidence Model orphans every observable and item
            // mapping that came from it.
            const nextObservations = (prev.expectedObservations || []).filter(
                (obs) => nextIds.includes(obs.evidenceModelId)
            );

            const survivingObsIds = new Set(
                nextObservations.map((o) => o.observationId)
            );

            const nextMappings = (prev.itemMappings || []).filter((m) =>
                survivingObsIds.has(m.observationId)
            );

            const droppedObservations =
                (prev.expectedObservations || []).length - nextObservations.length;

            if (droppedObservations > 0) {
                toast(
                    `${droppedObservations} orphaned observable${droppedObservations === 1 ? "" : "s"} removed.`,
                    { icon: "⚠️" }
                );
            }

            // The primary must always be one of the bound models.
            let nextPrimary = prev.primaryEvidenceModelId || "";
            if (!nextIds.includes(nextPrimary)) nextPrimary = nextIds[0] || "";

            return {
                ...prev,
                evidenceModelIds: nextIds,
                primaryEvidenceModelId: nextPrimary,
                expectedObservations: nextObservations,
                itemMappings: nextMappings,
            };
        });
    };

    const setPrimary = (evidenceId) => {
        if (disabled) return;
        setDraft((prev) => ({
            ...prev,
            primaryEvidenceModelId: evidenceId,
            evidenceModelIds: (prev.evidenceModelIds || []).includes(evidenceId)
                ? prev.evidenceModelIds
                : [...(prev.evidenceModelIds || []), evidenceId],
        }));
    };

    if (linkable.length === 0) {
        return (
            <div className="space-y-6">
                <Header />
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">
                    <AlertTriangle size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
                    <span>
                        No linkable Evidence Models are available. A Task Model can
                        only bind evidence that has been confirmed; operational and
                        suspended models remain linkable, archived ones do not.
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Header />

            {selectedIds.length > 0 && !primaryId && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">
                    <AlertTriangle size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
                    <span>
                        Nominate one bound Evidence Model as primary. It is the model
                        reporting and calibration treat as this task's main inferential
                        target.
                    </span>
                </div>
            )}

            <div className="grid gap-4">
                {linkable.map((em) => {
                    const isSelected = selectedIds.includes(em.id);
                    const isPrimary = primaryId === em.id;
                    const expanded = expandedId === em.id;
                    const competency = competencyById[em.competencyId];
                    const activeStatModel = (em.statisticalModels || []).find(
                        (sm) => sm.active === true
                    );
                    const observables = em.observables || [];

                    return (
                        <div
                            key={em.id}
                            className={`rounded-lg border shadow-sm transition ${isSelected
                                ? "border-slate-900 bg-slate-50"
                                : "border-slate-200 bg-white hover:shadow"
                                }`}
                        >
                            <div className="flex items-start justify-between gap-4 p-5">
                                <label className="flex flex-1 cursor-pointer items-start gap-3">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleEvidence(em.id)}
                                        disabled={disabled}
                                        className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 accent-slate-900 disabled:cursor-not-allowed"
                                    />

                                    <div className="min-w-0 space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-base font-semibold text-slate-800">
                                                {em.name || "Unnamed Evidence Model"}
                                            </span>
                                            <span
                                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_TONE[em.status] || "bg-slate-100 text-slate-600"
                                                    }`}
                                            >
                                                {em.status}
                                            </span>
                                            {isPrimary && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                                                    <Star size={11} strokeWidth={2.5} />
                                                    Primary
                                                </span>
                                            )}
                                        </div>

                                        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-3">
                                            <Field label="Competency" value={competency?.name || em.competencyId || "—"} />
                                            <Field
                                                label="Perspective"
                                                value={perspectiveReadout(readEvidencePerspective(em, {
                                                    competencies,
                                                    competencyModels,
                                                    domainAnalyses,
                                                })) || "—"}
                                            />
                                            <Field label="Version" value={`v${em.versionNumber ?? 1}`} />
                                            <Field label="Statistical model" value={activeStatModel?.type || "None active"} />
                                            <Field label="Observables" value={observables.length} />
                                            <Field label="Warrants" value={(em.warrants || []).length} />
                                            <Field label="Decision rule" value={em.decisionRule?.type || "—"} />
                                        </dl>
                                    </div>
                                </label>

                                <div className="flex shrink-0 flex-col items-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setExpandedId(expanded ? null : em.id)}
                                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                                        aria-expanded={expanded}
                                    >
                                        {expanded ? (
                                            <>
                                                <ChevronUp size={14} strokeWidth={2.25} />
                                                Hide detail
                                            </>
                                        ) : (
                                            <>
                                                <ChevronDown size={14} strokeWidth={2.25} />
                                                Detail
                                            </>
                                        )}
                                    </button>

                                    {isSelected && !isPrimary && !disabled && (
                                        <button
                                            type="button"
                                            onClick={() => setPrimary(em.id)}
                                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                                        >
                                            <Star size={14} strokeWidth={2.25} />
                                            Make primary
                                        </button>
                                    )}
                                </div>
                            </div>

                            {expanded && (
                                <div className="space-y-4 border-t border-slate-200 bg-white px-5 py-5 text-sm">
                                    <div>
                                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                            Claim
                                        </div>
                                        <p className="mt-1 leading-relaxed text-slate-700">
                                            {em.claimStatement || em.description || "—"}
                                        </p>
                                    </div>

                                    <div>
                                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                            Observables
                                        </div>
                                        {observables.length === 0 ? (
                                            <p className="mt-1 text-slate-400">
                                                This model declares no observables and can carry no
                                                task targeting.
                                            </p>
                                        ) : (
                                            <ul className="mt-1 space-y-1.5">
                                                {observables.map((obs) => (
                                                    <li key={obs.id} className="text-slate-700">
                                                        <span className="font-medium">
                                                            {obs.statement || obs.id}
                                                        </span>
                                                        {obs.type && (
                                                            <span className="ml-2 text-xs text-slate-400">
                                                                {obs.type}
                                                            </span>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function Header() {
    return (
        <div>
            <h2 className="text-lg font-semibold text-slate-900">Evidence Binding</h2>
            <p className="mt-1 text-sm text-slate-500">
                Bind the Evidence Models this task operationalizes, and nominate one
                as primary. The competency each model measures is shown for
                orientation — it is a property of the evidence, not something this
                task redeclares.
            </p>
        </div>
    );
}

// Label above value, not beside it.
//
// This was `flex gap-1.5` with a `truncate` on the value. In a three-up
// grid the non-shrinking label ate the row, leaving the value a few
// pixels -- so a real competency name rendered as "Competency: H..". The
// data was always in the DOM; the layout was starving it. Stacking gives
// the value the full column width, and `break-words` wraps a long name
// rather than clipping it.
function Field({ label, value }) {
    return (
        <div className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wide text-slate-400">
                {label}
            </dt>
            <dd className="break-words font-medium text-slate-600">{value}</dd>
        </div>
    );
}
