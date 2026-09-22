// Step4TaskStructure.jsx
// ------------------------------------------------------------
// Task Model Wizard — Step 4: Task Structure
// ------------------------------------------------------------
// How the task is presented, how the response is captured, what the
// examinee actually does, and under what administration conditions.
//
// Consolidates three previously disconnected pieces:
//  • StepStructure.jsx — presentation / response / stimulus / timing.
//  • StepConditions.jsx — administration conditions. That file was dead
//    code: it was never imported by WizardStepContainer, and it wrote to
//    top-level draft keys (environment, assessor, supports, …) that the
//    context never initialized and the schema never declared, so nothing
//    it captured survived a reload. Those fields now live under
//    `taskStructure.administration`, which is persisted and validated.
//  • SubTaskSelector.jsx — composite composition. Also never mounted,
//    which is why `subTaskIds` had no authoring path even though
//    SessionPlayer and TaskDetails both read it. Composite tasks now
//    reveal it inline.
//
// The old StepStructure also fired a "Task structure updated" toast on
// every single change event, including every keystroke in the pacing
// policy field. Toasts are for outcomes the user cannot otherwise see;
// a select they just changed is not one.
// ------------------------------------------------------------

import { useMemo } from "react";
import { AlertTriangle, Info } from "lucide-react";
import InfoTooltip from "../../../ui/InfoTooltip";
import SubTaskSelector from "./SubTaskSelector";
import { toolsAllowedList } from "@/utils/schema";
import { useTaskModelVariables } from "@/api/queries/taskModelVariables";
import { designFeatureOptions } from "@/utils/taskModelDesignFeatureRegistry";
import {
    ACTION_OPTIONS,
    evidenceCompatibilityNotes,
    ASSESSOR_ROLES,
    COMPOSITION_TYPES,
    EXECUTION_ENVIRONMENTS,
    LOAD_LEVELS,
    SUPPORT_LEVELS,
} from "../../taskModelConstants";

const inputBase =
    "w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition " +
    "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 " +
    "disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed";

export default function Step4TaskStructure({
    draft,
    setDraft,
    disabled,
    observationLookup = {},
    evidenceModels = [],
}) {
    const taskStructure = draft.taskStructure || {};
    const administration = taskStructure.administration || {};
    const composition = draft.taskCompositionType || "";
    const isComposite = composition === "composite";

    // D119: design-feature selects read through the TMV valueSet registry.
    const { data: tmvLibrary = [] } = useTaskModelVariables();
    const featureCtx = useMemo(
        () => ({
            taskModelVariableIds: draft.taskModelVariableIds,
            taskModelVariableSettings: draft.taskModelVariableSettings,
            variables: tmvLibrary,
        }),
        [
            draft.taskModelVariableIds,
            draft.taskModelVariableSettings,
            tmvLibrary,
        ]
    );
    const presentationModeOptions = useMemo(
        () => designFeatureOptions("presentationMode", featureCtx),
        [featureCtx]
    );
    const responseFormatOptions = useMemo(
        () => designFeatureOptions("responseFormat", featureCtx),
        [featureCtx]
    );
    const stimulusPolicyOptions = useMemo(
        () => designFeatureOptions("stimulusPolicy", featureCtx),
        [featureCtx]
    );

    /* ---------------- Mutations ---------------- */

    const updateStructure = (field, value) => {
        if (disabled) return;
        setDraft((prev) => ({
            ...prev,
            taskStructure: { ...(prev.taskStructure || {}), [field]: value },
        }));
    };

    const updateStructureNested = (parent, field, value) => {
        if (disabled) return;
        setDraft((prev) => ({
            ...prev,
            taskStructure: {
                ...(prev.taskStructure || {}),
                [parent]: {
                    ...((prev.taskStructure || {})[parent] || {}),
                    [field]: value,
                },
            },
        }));
    };

    const updateComposition = (value) => {
        if (disabled) return;
        setDraft((prev) => ({
            ...prev,
            taskCompositionType: value,
            // An atomic task cannot own sub-tasks. Clearing here keeps the
            // record from carrying an orphaned composition that the
            // structural-change guard would later flag on a locked model.
            subTaskIds: value === "composite" ? prev.subTaskIds || [] : [],
        }));
    };

    const toggleAction = (action) => {
        if (disabled) return;
        setDraft((prev) => {
            const current = prev.actions || [];
            return {
                ...prev,
                actions: current.includes(action)
                    ? current.filter((a) => a !== action)
                    : [...current, action],
            };
        });
    };

    const setSubTaskIds = (ids) => {
        if (disabled) return;
        setDraft((prev) => ({ ...prev, subTaskIds: ids }));
    };

    /* ---------------- Advisory compatibility notes ---------------- */

    // Live mirror of the confirmation-time coherence rules in
    // src/utils/schema.js. Those cannot run on the draft autosave -- every
    // one of them reads a field authored on this step or later, which is
    // what made the wizard deadlock on Step 2 -- so the author would
    // otherwise not learn that their task form is incompatible with the
    // bound evidence until they tried to confirm, three steps on.
    const compatibility = useMemo(
        () => evidenceCompatibilityNotes(draft, evidenceModels),
        [draft, evidenceModels]
    );

    const advisories = useMemo(() => {
        const notes = [];

        if (taskStructure.stimulusPolicy === "static") {
            notes.push(
                "A static stimulus cannot be varied per administration, so exposure control has to be handled at form assembly rather than by generation."
            );
        }

        if (
            taskStructure.stimulusPolicy === "generative" &&
            taskStructure.responseFormat === "selected"
        ) {
            notes.push(
                "Generated stimuli with selected responses need explicit distractor constraints, otherwise generated options drift out of the construct."
            );
        }

        if (
            taskStructure.responseFormat === "constructed" &&
            taskStructure.presentationMode === "interactive"
        ) {
            notes.push(
                "Interactive constructed response requires a scoring model that can read the produced artefact; confirm the bound Evidence Model supports it."
            );
        }

        if (
            taskStructure.presentationMode === "performance" &&
            administration.assessor === "automated"
        ) {
            notes.push(
                "Performance tasks rated by an automated system need an explicit rating rubric; a human assessor is the usual choice here."
            );
        }

        return notes;
    }, [taskStructure, administration.assessor]);

    const selectedActions = draft.actions || [];

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-slate-900">Task Structure</h2>
                <p className="mt-1 text-sm text-slate-500">
                    Declare how the task is presented, how responses are captured, what
                    the examinee does, and the conditions under which it is
                    administered.
                </p>
            </div>

            {compatibility.length > 0 && (
                <div
                    className={`rounded-lg border px-4 py-3.5 text-sm ${compatibility.some((n) => n.severity === "blocking")
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-blue-200 bg-blue-50 text-blue-800"
                        }`}
                >
                    <div className="flex items-start gap-3">
                        <AlertTriangle size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
                        <div className="space-y-1.5">
                            <div className="font-semibold">
                                Bound evidence constrains this task's form
                            </div>
                            {compatibility.map((note) => (
                                <div key={note.id}>
                                    <span className="font-medium">{note.model}:</span>{" "}
                                    {note.message}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Delivery mechanics */}
            <Section title="Delivery Mechanics">
                <div className="grid gap-6 md:grid-cols-3">
                    <ChoiceField
                        label="Presentation Mode"
                        required
                        value={taskStructure.presentationMode || ""}
                        options={presentationModeOptions}
                        disabled={disabled}
                        onChange={(v) => updateStructure("presentationMode", v)}
                    />
                    <ChoiceField
                        label="Response Format"
                        required
                        value={taskStructure.responseFormat || ""}
                        options={responseFormatOptions}
                        disabled={disabled}
                        onChange={(v) => updateStructure("responseFormat", v)}
                    />
                    <ChoiceField
                        label="Stimulus Policy"
                        required
                        value={taskStructure.stimulusPolicy || ""}
                        options={stimulusPolicyOptions}
                        disabled={disabled}
                        onChange={(v) => updateStructure("stimulusPolicy", v)}
                    />
                </div>
            </Section>

            {/* Student actions */}
            <Section
                title="Observable Student Actions"
                description="What the examinee is expected to do during execution. At least one is required — these are what the task's observables are read from."
            >
                <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 md:grid-cols-3">
                    {ACTION_OPTIONS.map(({ value, label }) => (
                        <label
                            key={value}
                            className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
                        >
                            <input
                                type="checkbox"
                                checked={selectedActions.includes(value)}
                                disabled={disabled}
                                onChange={() => toggleAction(value)}
                                className="h-4 w-4 rounded border-slate-300 accent-slate-900 disabled:cursor-not-allowed"
                            />
                            <span>{label}</span>
                        </label>
                    ))}
                </div>

                {selectedActions.length === 0 && !disabled && (
                    <p className="mt-3 text-xs font-medium text-amber-700">
                        Select at least one action before continuing.
                    </p>
                )}
            </Section>

            {/* Composition */}
            <Section
                title="Task Composition"
                description="Structural classification only — it says nothing about instructional sequencing or stakes."
            >
                <div className="max-w-sm">
                    <ChoiceField
                        label="Composition"
                        required
                        value={composition}
                        options={COMPOSITION_TYPES}
                        disabled={disabled}
                        onChange={updateComposition}
                        tooltip="Atomic tasks are a single unit of work. Composite tasks are assembled from other Task Models executed in order."
                    />
                </div>

                {isComposite && (
                    <div className="mt-6 border-t border-slate-100 pt-6">
                        <SubTaskSelector
                            disabled={disabled}
                            value={draft.subTaskIds || []}
                            onChange={setSubTaskIds}
                            currentTaskId={draft.id}
                            parentEvidenceModelIds={draft.evidenceModelIds || []}
                            parentObservationIds={(draft.expectedObservations || []).map(
                                (o) => o.observationId
                            )}
                            parentObservationMap={observationLookup}
                        />

                        {(draft.subTaskIds || []).length === 0 && !disabled && (
                            <p className="mt-3 text-xs font-medium text-amber-700">
                                A composite task needs at least one structural component.
                            </p>
                        )}
                    </div>
                )}
            </Section>

            {/* Timing and resources */}
            <Section title="Timing & Resource Constraints">
                <div className="grid gap-6 md:grid-cols-2">
                    <div>
                        <FieldLabel htmlFor="time-limit">Time Limit (seconds)</FieldLabel>
                        <input
                            id="time-limit"
                            type="number"
                            min="0"
                            value={taskStructure.timingConstraint?.timeLimitSeconds ?? ""}
                            disabled={disabled}
                            placeholder="Leave blank for untimed"
                            onChange={(e) =>
                                updateStructureNested(
                                    "timingConstraint",
                                    "timeLimitSeconds",
                                    e.target.value === "" ? null : Number(e.target.value)
                                )
                            }
                            className={inputBase}
                        />
                    </div>

                    <div>
                        <FieldLabel htmlFor="pacing-policy">Pacing Policy</FieldLabel>
                        <input
                            id="pacing-policy"
                            type="text"
                            value={taskStructure.timingConstraint?.pacingPolicy || ""}
                            disabled={disabled}
                            placeholder="e.g. examinee-paced, no backtracking"
                            onChange={(e) =>
                                updateStructureNested(
                                    "timingConstraint",
                                    "pacingPolicy",
                                    e.target.value
                                )
                            }
                            className={inputBase}
                        />
                    </div>

                    <div>
                        <FieldLabel htmlFor="max-attempts">Max Attempts</FieldLabel>
                        <input
                            id="max-attempts"
                            type="number"
                            min="1"
                            value={taskStructure.resourceConstraints?.maxAttempts ?? ""}
                            disabled={disabled}
                            placeholder="Unlimited if blank"
                            onChange={(e) =>
                                updateStructureNested(
                                    "resourceConstraints",
                                    "maxAttempts",
                                    e.target.value === "" ? null : Number(e.target.value)
                                )
                            }
                            className={inputBase}
                        />
                    </div>

                    <div>
                        <FieldLabel htmlFor="tools-allowed">Tools Allowed</FieldLabel>
                        <input
                            id="tools-allowed"
                            type="text"
                            /* Stored as a string[], displayed as the comma-separated
                               text the author types. This used to store the raw
                               string, while the Item Wizard read the same field as
                               an array and called .join() on it -- a TypeError out
                               of a render that blanked the whole admin console for
                               any Task Model that actually named a tool. See
                               toolsAllowedList() in src/utils/schema.js. */
                            value={toolsAllowedList(
                                taskStructure.resourceConstraints
                            ).join(", ")}
                            disabled={disabled}
                            placeholder="e.g. four-function calculator, formula sheet"
                            onChange={(e) =>
                                updateStructureNested(
                                    "resourceConstraints",
                                    "toolsAllowed",
                                    e.target.value
                                        .split(",")
                                        .map((t) => t.trim())
                                        .filter(Boolean)
                                )
                            }
                            className={inputBase}
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                                type="checkbox"
                                checked={Boolean(
                                    taskStructure.resourceConstraints?.collaborationAllowed
                                )}
                                disabled={disabled}
                                onChange={(e) =>
                                    updateStructureNested(
                                        "resourceConstraints",
                                        "collaborationAllowed",
                                        e.target.checked
                                    )
                                }
                                className="h-4 w-4 rounded border-slate-300 accent-slate-900 disabled:cursor-not-allowed"
                            />
                            Collaboration permitted during execution
                        </label>
                    </div>
                </div>
            </Section>

            {/* Administration conditions */}
            <Section
                title="Administration Conditions"
                description="Delivery context only. These constrain execution; they do not change the task's claim, stakes or interpretation."
            >
                <div className="grid gap-6 md:grid-cols-2">
                    <ChoiceField
                        label="Execution Environment"
                        value={administration.environment || ""}
                        options={EXECUTION_ENVIRONMENTS}
                        disabled={disabled}
                        onChange={(v) => updateStructureNested("administration", "environment", v)}
                    />
                    <ChoiceField
                        label="Assessor / Observer"
                        value={administration.assessor || ""}
                        options={ASSESSOR_ROLES}
                        disabled={disabled}
                        onChange={(v) => updateStructureNested("administration", "assessor", v)}
                    />
                    <ChoiceField
                        label="Level of Support"
                        value={administration.supportLevel || ""}
                        options={SUPPORT_LEVELS}
                        disabled={disabled}
                        onChange={(v) => updateStructureNested("administration", "supportLevel", v)}
                    />
                    <div>
                        <FieldLabel htmlFor="support-description">
                            Support Description
                        </FieldLabel>
                        <input
                            id="support-description"
                            type="text"
                            value={administration.supportDescription || ""}
                            disabled={disabled}
                            placeholder="e.g. read-aloud available on request"
                            onChange={(e) =>
                                updateStructureNested(
                                    "administration",
                                    "supportDescription",
                                    e.target.value
                                )
                            }
                            className={inputBase}
                        />
                    </div>
                    <ChoiceField
                        label="Affective Load"
                        value={administration.affectiveLoad || ""}
                        options={LOAD_LEVELS}
                        disabled={disabled}
                        onChange={(v) => updateStructureNested("administration", "affectiveLoad", v)}
                        tooltip="Contextual pressure that may influence performance without being part of the construct."
                    />
                    <ChoiceField
                        label="Social Exposure"
                        value={administration.socialExposure || ""}
                        options={LOAD_LEVELS}
                        disabled={disabled}
                        onChange={(v) =>
                            updateStructureNested("administration", "socialExposure", v)
                        }
                    />
                </div>
            </Section>

            {advisories.length > 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">
                    <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
                    <div className="space-y-1.5">
                        <div className="font-semibold">Design advisories</div>
                        {advisories.map((note, idx) => (
                            <div key={idx}>{note}</div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ---------------- Presentational helpers ---------------- */

function Section({ title, description, children }) {
    return (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            {description && (
                <p className="mb-4 mt-1 text-sm text-slate-500">{description}</p>
            )}
            <div className={description ? "" : "mt-4"}>{children}</div>
        </section>
    );
}

function FieldLabel({ htmlFor, children, required, tooltip }) {
    return (
        <label
            htmlFor={htmlFor}
            className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700"
        >
            {children}
            {required && <span className="text-red-600">*</span>}
            {tooltip && <InfoTooltip content={tooltip} />}
        </label>
    );
}

function ChoiceField({ label, value, options, disabled, onChange, required, tooltip }) {
    const id = `field-${label.replace(/\s+/g, "-").toLowerCase()}`;
    const hint = options.find((o) => o.value === value)?.hint;

    return (
        <div>
            <FieldLabel htmlFor={id} required={required} tooltip={tooltip}>
                {label}
            </FieldLabel>
            <select
                id={id}
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                className={inputBase}
            >
                <option value="">Select…</option>
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
            {hint && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-400">
                    <Info size={12} strokeWidth={2.25} className="mt-0.5 shrink-0" />
                    {hint}
                </p>
            )}
        </div>
    );
}
