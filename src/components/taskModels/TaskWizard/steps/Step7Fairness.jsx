// Step7Fairness.jsx
// Task Model Wizard — Step 7: Fairness & Accessibility
//
// The fairness record is the bound Evidence Model's fairness notes and DIF
// checklist. This step shows that record and adds only the access
// assumptions that belong to the task form.

const inputBase =
    "w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition " +
    "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 " +
    "disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed";

function boundEvidence(draft, evidenceModels) {
    const primary = (evidenceModels || []).find(
        (em) => em.id === draft.primaryEvidenceModelId
    );
    if (primary) return primary;
    const ids = draft.evidenceModelIds || [];
    return (evidenceModels || []).find((em) => ids.includes(em.id)) || null;
}

export default function Step7Fairness({
    draft,
    setDraft,
    disabled,
    evidenceModels = [],
}) {
    const evidence = boundEvidence(draft, evidenceModels);
    const checklist = Array.isArray(evidence?.difReviewChecklist)
        ? evidence.difReviewChecklist
        : [];
    const accessibility = draft.accessibilityAssumptions || {};

    const updateAccessibility = (field, value) => {
        if (disabled) return;
        setDraft((prev) => ({
            ...prev,
            accessibilityAssumptions: {
                ...(prev.accessibilityAssumptions || {}),
                [field]: value,
            },
        }));
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-slate-900">
                    Fairness & Accessibility
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                    Fairness notes and the DIF checklist live on the Evidence Model.
                    This task adds only what it assumes about access.
                </p>
            </div>

            <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800">
                    Evidence fairness record
                </h3>
                {!evidence && (
                    <p className="text-sm text-slate-500">
                        Bind an Evidence Model first. Its fairness notes and DIF checklist
                        are the record for this task.
                    </p>
                )}
                {evidence && (
                    <>
                        <p className="text-sm text-slate-700">
                            <span className="font-medium text-slate-900">{evidence.name || evidence.id}</span>
                            {" "}
                            is the source of this record.
                        </p>
                        <div>
                            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                                Fairness notes
                            </p>
                            <p className="whitespace-pre-wrap text-sm text-slate-700">
                                {String(evidence.fairnessNotes || "").trim() ||
                                    "No fairness notes on this Evidence Model yet."}
                            </p>
                        </div>
                        <div>
                            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                                DIF checklist
                            </p>
                            {checklist.length === 0 ? (
                                <p className="text-sm text-slate-500">No DIF rows on this Evidence Model yet.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {checklist.map((row) => (
                                        <li key={row.id || row.prompt} className="text-sm text-slate-700">
                                            <span className="font-medium text-slate-900">
                                                {row.status || "pending"}
                                            </span>
                                            {" — "}
                                            {row.prompt}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </>
                )}
            </section>

            <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <div>
                    <h3 className="text-sm font-semibold text-slate-800">
                        Access assumptions
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                        What this task form assumes about the examinee&apos;s access.
                        Required before this Task Model can be promoted to operational.
                    </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">
                            Assistive Technology Support
                        </label>
                        <input
                            type="text"
                            value={accessibility.assistiveSupport || ""}
                            disabled={disabled}
                            placeholder="e.g. screen-reader compatible, no drag interactions"
                            onChange={(e) =>
                                updateAccessibility("assistiveSupport", e.target.value)
                            }
                            className={inputBase}
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">
                            Language Load
                        </label>
                        <input
                            type="text"
                            value={accessibility.languageLoad || ""}
                            disabled={disabled}
                            placeholder="e.g. reading demand below the target grade band"
                            onChange={(e) =>
                                updateAccessibility("languageLoad", e.target.value)
                            }
                            className={inputBase}
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">
                            Permitted Accommodations
                        </label>
                        <input
                            type="text"
                            value={accessibility.accommodations || ""}
                            disabled={disabled}
                            placeholder="e.g. extended time, scribe"
                            onChange={(e) =>
                                updateAccessibility("accommodations", e.target.value)
                            }
                            className={inputBase}
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">
                            Sensory / Motor Demands
                        </label>
                        <input
                            type="text"
                            value={accessibility.sensoryMotorDemands || ""}
                            disabled={disabled}
                            placeholder="e.g. requires fine pointer control"
                            onChange={(e) =>
                                updateAccessibility("sensoryMotorDemands", e.target.value)
                            }
                            className={inputBase}
                        />
                    </div>
                </div>
            </section>
        </div>
    );
}
