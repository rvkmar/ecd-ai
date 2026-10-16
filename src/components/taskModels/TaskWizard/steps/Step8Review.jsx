// Step8Review.jsx
// ------------------------------------------------------------
// Task Model Wizard — Step 8: Review & Lifecycle
// ------------------------------------------------------------
// The last read before promotion: a readiness checklist, a structural
// summary of what is about to be locked, and the reuse metadata.
//
// The lifecycle buttons live in WizardStepContainer, not here -- the same
// split as CompetencyWizard's Step9Confirmation. The previous
// StepReuseAndReview.jsx additionally computed its OWN definition of
// "structurally complete", stricter than the one the container gated the
// buttons on (it demanded full item coverage and a primary competency).
// The result was a checklist showing red crosses next to an enabled
// Confirm button, and vice versa. Both now read
// taskModelReadiness() from taskModelConstants.js -- one definition,
// used by the wizard, the list, the table and the dashboard alike.
// ------------------------------------------------------------

import { useMemo } from "react";
import { AlertTriangle, Check, Lock, X } from "lucide-react";
import InfoTooltip from "../../../ui/InfoTooltip";
import {
    evidenceCompatibilityNotes,
    formatWeight,
    labelFor,
    operationalReadiness,
    PRESENTATION_MODES,
    RESPONSE_FORMATS,
    STIMULUS_POLICIES,
    sumWeights,
    taskModelReadiness,
} from "../../taskModelConstants";

export default function Step8Review({
    draft = {},
    setDraft,
    disabled,
    evidenceModels = [],
    observationLookup = {},
    items = [],
}) {
    const { checks, isComplete } = useMemo(
        () => taskModelReadiness(draft),
        [draft]
    );

    const operationalChecks = useMemo(
        () => operationalReadiness(draft, items, evidenceModels),
        [draft, items, evidenceModels]
    );

    // Cross-model compatibility is enforced at confirmation by the
    // coherence layer in src/utils/schema.js. Show it here too so a
    // refusal is never the first the author hears of it.
    const compatibility = useMemo(
        () => evidenceCompatibilityNotes(draft, evidenceModels),
        [draft, evidenceModels]
    );

    const blockingCompatibility = compatibility.filter(
        (n) => n.severity === "blocking"
    );

    const evidenceById = useMemo(() => {
        const map = {};
        (evidenceModels || []).forEach((em) => {
            map[em.id] = em;
        });
        return map;
    }, [evidenceModels]);

    const expectedObservations = draft.expectedObservations || [];
    const fairnessEvidence =
        (evidenceModels || []).find((em) => em.id === draft.primaryEvidenceModelId) ||
        null;
    const difRows = Array.isArray(fairnessEvidence?.difReviewChecklist)
        ? fairnessEvidence.difReviewChecklist
        : [];
    const access = draft.accessibilityAssumptions || {};
    const accessCount = ["assistiveSupport", "languageLoad", "accommodations", "sensoryMotorDemands"]
        .filter((key) => String(access[key] || "").trim()).length;
    const structure = draft.taskStructure || {};
    const blueprint = draft.blueprintConstraints || {};

    return (
        <div className="space-y-6">
            <div>
                <h2 className="inline-flex items-center gap-1.5 text-lg font-semibold text-slate-900">
                    Review & Lifecycle
                    <InfoTooltip content="Confirming locks the structure. Later structural changes require cloning to a new version." />
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                    Everything below is what will be frozen when this Task Model is
                    confirmed.
                </p>
            </div>

            {/* Readiness */}
            <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800">
                    Structural Readiness
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                    All six must pass before this Task Model can be saved for review or
                    confirmed.
                </p>

                <ul className="mt-4 space-y-3">
                    {checks.map((check) => (
                        <li key={check.key} className="flex items-start gap-3">
                            {check.valid ? (
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                                    <Check size={13} strokeWidth={3} />
                                </span>
                            ) : (
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                                    <X size={13} strokeWidth={3} />
                                </span>
                            )}
                            <div className="min-w-0">
                                <div
                                    className={`text-sm font-medium ${check.valid ? "text-slate-700" : "text-slate-900"
                                        }`}
                                >
                                    {check.label}
                                </div>
                                <div className="text-xs text-slate-500">{check.detail}</div>
                            </div>
                        </li>
                    ))}
                </ul>

                {!isComplete && (
                    <div className="mt-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700">
                        <AlertTriangle size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
                        <span>
                            Resolve the failed checks above. Use the step rail to jump back
                            to the step that owns each one.
                        </span>
                    </div>
                )}
            </section>

            {compatibility.length > 0 && (
                <section
                    className={`rounded-lg border p-6 ${blockingCompatibility.length > 0
                        ? "border-red-200 bg-red-50"
                        : "border-blue-200 bg-blue-50"
                        }`}
                >
                    <h3
                        className={`inline-flex items-center gap-1.5 text-sm font-semibold ${blockingCompatibility.length > 0 ? "text-red-800" : "text-blue-900"
                            }`}
                    >
                        <AlertTriangle size={14} strokeWidth={2.25} />
                        Evidence Compatibility
                    </h3>
                    <p
                        className={`mt-1 text-sm ${blockingCompatibility.length > 0 ? "text-red-700" : "text-blue-800"
                            }`}
                    >
                        {blockingCompatibility.length > 0
                            ? "Confirmation will be refused until these are resolved. Each one is a property of the task form, authored in Steps 3 and 4."
                            : "Outstanding requirements of the statistical models behind the bound evidence."}
                    </p>

                    <ul className="mt-3 space-y-1.5 text-sm">
                        {compatibility.map((note) => (
                            <li
                                key={note.id}
                                className={
                                    note.severity === "blocking"
                                        ? "text-red-700"
                                        : "text-blue-800"
                                }
                            >
                                <span className="font-medium">{note.model}:</span> {note.message}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* Structural summary */}
            <section className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800">
                    Structural Summary
                </h3>

                <SummaryBlock label="Evidence binding">
                    {(draft.evidenceModelIds || []).length === 0 ? (
                        <span className="text-slate-400">None bound</span>
                    ) : (
                        <ul className="space-y-1">
                            {draft.evidenceModelIds.map((id) => {
                                const em = evidenceById[id];
                                const isPrimary = draft.primaryEvidenceModelId === id;
                                return (
                                    <li key={id} className="text-slate-700">
                                        {em?.name || id}
                                        <span className="ml-2 text-xs text-slate-400">
                                            v{em?.versionNumber ?? "?"} · {em?.status || "unknown"}
                                        </span>
                                        {isPrimary && (
                                            <span className="ml-2 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                                Primary
                                            </span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </SummaryBlock>

                <SummaryBlock
                    label={`Expected observations (weight ${formatWeight(sumWeights(expectedObservations))})`}
                >
                    {expectedObservations.length === 0 ? (
                        <span className="text-slate-400">None declared</span>
                    ) : (
                        <ul className="space-y-1">
                            {expectedObservations.map((o) => (
                                <li key={o.observationId} className="text-slate-700">
                                    {observationLookup[o.observationId]?.statement ||
                                        o.observationId}
                                    <span className="ml-2 text-xs text-slate-400">
                                        {o.required ? "required" : "optional"} · weight{" "}
                                        {/* 3dp rendered 0.3333/0.3333/0.3334 as
                                            0.333 three times -- a reviewer reads
                                            0.999 beneath a heading claiming 1. */}
                                        {formatWeight(o.weight)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </SummaryBlock>

                <SummaryBlock label="Task structure">
                    <dl className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
                        <Pair
                            label="Presentation"
                            value={labelFor(PRESENTATION_MODES, structure.presentationMode)}
                        />
                        <Pair
                            label="Response"
                            value={labelFor(RESPONSE_FORMATS, structure.responseFormat)}
                        />
                        <Pair
                            label="Stimulus"
                            value={labelFor(STIMULUS_POLICIES, structure.stimulusPolicy)}
                        />
                        <Pair
                            label="Composition"
                            value={
                                draft.taskCompositionType === "composite"
                                    ? `Composite (${(draft.subTaskIds || []).length} components)`
                                    : draft.taskCompositionType || "—"
                            }
                        />
                        <Pair
                            label="Actions"
                            value={(draft.actions || []).length || "—"}
                        />
                        <Pair
                            label="Time limit"
                            value={
                                structure.timingConstraint?.timeLimitSeconds
                                    ? `${structure.timingConstraint.timeLimitSeconds}s`
                                    : "Untimed"
                            }
                        />
                    </dl>
                </SummaryBlock>

                <SummaryBlock label="Blueprint">
                    <dl className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
                        <Pair
                            label="Difficulty"
                            value={
                                typeof blueprint.difficultyRange?.min === "number" &&
                                    typeof blueprint.difficultyRange?.max === "number"
                                    ? `${blueprint.difficultyRange.min} – ${blueprint.difficultyRange.max}`
                                    : "—"
                            }
                        />
                        <Pair
                            label="Exposure cap"
                            value={blueprint.exposurePolicy?.maxUses ?? "Unlimited"}
                        />
                        <Pair
                            label="Interaction types"
                            value={
                                (blueprint.allowedInteractionTypes || []).join(", ") ||
                                "Unconstrained"
                            }
                        />
                        <Pair
                            label="Scoring methods"
                            value={
                                (blueprint.allowedScoringMethods || []).join(", ") ||
                                "Unconstrained"
                            }
                        />
                    </dl>
                </SummaryBlock>

                <SummaryBlock label="Task Model Variables">
                    <span className="text-slate-700">
                        {(draft.taskModelVariableIds || []).length === 0
                            ? "None bound"
                            : `${(draft.taskModelVariableIds || []).length} bound · ${(draft.taskModelVariableSettings || []).filter((s) => s.required).length} required`}
                    </span>
                </SummaryBlock>

                <SummaryBlock label="Fairness">
                    <span className="text-slate-700">
                        {fairnessEvidence
                            ? `${fairnessEvidence.name || fairnessEvidence.id}: ${
                                String(fairnessEvidence.fairnessNotes || "").trim()
                                    ? "fairness notes on the evidence model"
                                    : "no fairness notes yet"
                            }, ${difRows.length} DIF row${difRows.length === 1 ? "" : "s"}. ${accessCount} access assumption${accessCount === 1 ? "" : "s"}.`
                            : "No evidence model bound. Access assumptions are the only task-level addition."}
                    </span>
                </SummaryBlock>

                <SummaryBlock label="Item mapping">
                    <span className="text-slate-700">
                        {(draft.selectedItemIds || []).length} item
                        {(draft.selectedItemIds || []).length === 1 ? "" : "s"} in scope ·{" "}
                        {(draft.itemMappings || []).length} mapping
                        {(draft.itemMappings || []).length === 1 ? "" : "s"}
                    </span>
                </SummaryBlock>
            </section>

            {/* Reuse metadata */}
            <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <div>
                    <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                        Reuse & Equivalence
                        <InfoTooltip content="Task Models sharing an equivalence group are treated as interchangeable at form assembly. Required before promotion to operational." />
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                        Groups this Task Model with others that may substitute for it.
                    </p>
                </div>

                <input
                    type="text"
                    value={draft.equivalenceGroupId || ""}
                    disabled={disabled}
                    placeholder="e.g. fraction-comparison-v1"
                    onChange={(e) =>
                        setDraft((prev) => ({
                            ...prev,
                            equivalenceGroupId: e.target.value,
                        }))
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                />
            </section>

            {/* Operational readiness — forward-looking, never blocks confirm */}
            <section className="rounded-lg border border-slate-200 bg-slate-50 p-6">
                <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                    <Lock size={14} strokeWidth={2.25} className="text-slate-400" />
                    Operational Prerequisites
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                    Not required to confirm, but the server enforces these before this
                    Task Model can be activated.
                </p>

                <ul className="mt-3 space-y-2.5 text-sm">
                    {operationalChecks.map((check) => (
                        <li key={check.key} className="flex items-start gap-2.5">
                            {check.valid ? (
                                <Check
                                    size={14}
                                    strokeWidth={2.5}
                                    className="mt-0.5 shrink-0 text-emerald-600"
                                />
                            ) : (
                                <X
                                    size={14}
                                    strokeWidth={2.5}
                                    className="mt-0.5 shrink-0 text-slate-400"
                                />
                            )}
                            <span className="min-w-0">
                                <span
                                    className={
                                        check.valid ? "text-slate-700" : "text-slate-500"
                                    }
                                >
                                    {check.label}
                                </span>
                                {check.detail && (
                                    <span className="block text-xs text-slate-400">
                                        {check.detail}
                                    </span>
                                )}
                            </span>
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}

function SummaryBlock({ label, children }) {
    return (
        <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {label}
            </div>
            <div className="mt-1.5 text-sm">{children}</div>
        </div>
    );
}

function Pair({ label, value }) {
    return (
        <div className="flex gap-2">
            <dt className="text-slate-400">{label}:</dt>
            <dd className="min-w-0 font-medium capitalize text-slate-700">{value}</dd>
        </div>
    );
}
