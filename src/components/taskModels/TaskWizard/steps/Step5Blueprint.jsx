// Step5Blueprint.jsx
// ------------------------------------------------------------
// Task Model Wizard — Step 5: Blueprint Constraints
// ------------------------------------------------------------
// The contract every Item written against this Task Model must satisfy.
//
// The two whitelists at the bottom of this step are not decorative.
// src/utils/schema.js validates each Item against them:
//
//     blueprint.allowedInteractionTypes → item.interaction.type
//     blueprint.allowedScoringMethods   → item.scoring.method
//
// Neither field had any authoring UI before this rework, so they were
// always undefined and the enforcement branch never ran. An empty list
// still means "unconstrained" (the schema check is skipped), which is the
// backwards-compatible reading for every Task Model authored to date.
//
// Bloom level and reasoning type were free-text inputs, which made them
// useless for filtering or reporting; they are enumerations now.
// ------------------------------------------------------------

import { AlertTriangle, Info, Wand2 } from "lucide-react";
import { useMemo } from "react";
import InfoTooltip from "../../../ui/InfoTooltip";
import { useTaskModelVariables } from "@/api/queries/taskModelVariables";
import { designFeatureOptions } from "@/utils/taskModelDesignFeatureRegistry";
import {
    difficultyScaleFor,
    COOLDOWN_POLICIES,
    INTERACTION_TYPES,
    SCORING_METHODS,
} from "../../taskModelConstants";

const inputBase =
    "w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition " +
    "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 " +
    "disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed";

export default function Step5Blueprint({
    draft,
    setDraft,
    disabled,
    evidenceModels = [],
}) {
    const blueprint = draft.blueprintConstraints || {};
    const difficulty = blueprint.difficultyRange || {};

    // D119: Bloom / reasoning options via TMV valueSet registry path.
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
    const bloomOptions = useMemo(
        () => designFeatureOptions("bloomLevel", featureCtx),
        [featureCtx]
    );
    const reasoningOptions = useMemo(
        () => designFeatureOptions("reasoningType", featureCtx),
        [featureCtx]
    );

    // Which scale this task's difficulty is actually expressed on, read
    // from the primary evidence model's active statistical model. Null
    // when nothing is bound or nothing is active -- in which case the step
    // says so rather than guessing.
    const scale = difficultyScaleFor(draft, evidenceModels);

    const applySuggestedRange = () => {
        if (disabled || !scale) return;
        setDraft((prev) => ({
            ...prev,
            blueprintConstraints: {
                ...(prev.blueprintConstraints || {}),
                difficultyRange: { min: scale.min, max: scale.max },
            },
        }));
    };

    const updateNested = (parent, field, value) => {
        if (disabled) return;
        setDraft((prev) => ({
            ...prev,
            blueprintConstraints: {
                ...(prev.blueprintConstraints || {}),
                [parent]: {
                    ...((prev.blueprintConstraints || {})[parent] || {}),
                    [field]: value,
                },
            },
        }));
    };

    const updateList = (field, value) => {
        if (disabled) return;
        setDraft((prev) => {
            const current = (prev.blueprintConstraints || {})[field] || [];
            const next = current.includes(value)
                ? current.filter((v) => v !== value)
                : [...current, value];

            return {
                ...prev,
                blueprintConstraints: {
                    ...(prev.blueprintConstraints || {}),
                    [field]: next,
                },
            };
        });
    };

    // Empty string must not silently become 0 -- `Number("")` is 0, which
    // is how the old step turned a cleared Minimum field into a valid-
    // looking 0 and quietly changed the blueprint.
    const numericOrNull = (raw) => (raw === "" ? null : Number(raw));

    const min = difficulty.min;
    const max = difficulty.max;

    const difficultyInvalid =
        typeof min === "number" && typeof max === "number" && min >= max;

    const difficultyIncomplete =
        typeof min !== "number" || typeof max !== "number";

    const allowedInteractionTypes = blueprint.allowedInteractionTypes || [];
    const allowedScoringMethods = blueprint.allowedScoringMethods || [];

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-slate-900">
                    Blueprint Constraints
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                    The envelope every Item instantiated from this Task Model must fall
                    inside. These constraints are enforced server-side at item
                    validation, not merely advisory.
                </p>
            </div>

            {/* Difficulty */}
            <Section
                title="Difficulty Range"
                description="Expressed on the scale used by the bound Evidence Model's statistical model. These scales are not interchangeable, so the range is not prefilled."
            >
                {scale ? (
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                        <span className="flex items-start gap-2.5">
                            <Info size={15} strokeWidth={2.25} className="mt-0.5 shrink-0" />
                            <span>
                                <strong className="font-semibold">{scale.evidenceModel}</strong>{" "}
                                runs on {scale.statisticalModel.toUpperCase()}, so difficulty
                                here is in <strong className="font-semibold">{scale.label}</strong> —
                                typically {scale.min} to {scale.max}.
                            </span>
                        </span>

                        {!disabled && (
                            <button
                                type="button"
                                onClick={applySuggestedRange}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-800 transition hover:bg-blue-100"
                            >
                                <Wand2 size={13} strokeWidth={2.25} />
                                Use {scale.min} to {scale.max}
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        <Info size={15} strokeWidth={2.25} className="mt-0.5 shrink-0 text-slate-400" />
                        <span>
                            The scale depends on the primary Evidence Model's active
                            statistical model. Bind one in Step 2 to see the range this
                            field should use.
                        </span>
                    </div>
                )}

                <div className="flex flex-wrap items-end gap-8">
                    <div>
                        <FieldLabel htmlFor="difficulty-min" required>
                            Minimum
                        </FieldLabel>
                        <input
                            id="difficulty-min"
                            type="number"
                            step="0.1"
                            value={min ?? ""}
                            disabled={disabled}
                            placeholder={scale ? String(scale.min) : ""}
                            onChange={(e) =>
                                updateNested("difficultyRange", "min", numericOrNull(e.target.value))
                            }
                            className={`${inputBase} w-36`}
                        />
                    </div>

                    <div>
                        <FieldLabel htmlFor="difficulty-max" required>
                            Maximum
                        </FieldLabel>
                        <input
                            id="difficulty-max"
                            type="number"
                            step="0.1"
                            value={max ?? ""}
                            disabled={disabled}
                            placeholder={scale ? String(scale.max) : ""}
                            onChange={(e) =>
                                updateNested("difficultyRange", "max", numericOrNull(e.target.value))
                            }
                            className={`${inputBase} w-36`}
                        />
                    </div>
                </div>

                {difficultyInvalid && (
                    <Banner tone="error">
                        Minimum must be strictly less than maximum. The server rejects a
                        Task Model whose difficulty range is empty or inverted.
                    </Banner>
                )}

                {!difficultyInvalid && difficultyIncomplete && (
                    <Banner tone="warn">
                        Both bounds are required before this Task Model can be saved
                        {scale ? ` — on the ${scale.label} scale.` : "."}
                    </Banner>
                )}
            </Section>

            {/* Cognitive demand */}
            <Section title="Cognitive Demand">
                <div className="grid gap-6 md:grid-cols-2">
                    <ChoiceField
                        label="Bloom Level"
                        value={blueprint.cognitiveDemand?.bloomLevel || ""}
                        options={bloomOptions}
                        disabled={disabled}
                        onChange={(v) => updateNested("cognitiveDemand", "bloomLevel", v)}
                    />
                    <ChoiceField
                        label="Reasoning Type"
                        value={blueprint.cognitiveDemand?.reasoningType || ""}
                        options={reasoningOptions}
                        disabled={disabled}
                        onChange={(v) => updateNested("cognitiveDemand", "reasoningType", v)}
                        tooltip="Should match the cognitive attribute named on the warrants of the bound Evidence Model."
                    />
                </div>
            </Section>

            {/* Domain alignment */}
            <Section title="Domain Alignment">
                <div className="grid gap-6 md:grid-cols-2">
                    <div>
                        <FieldLabel htmlFor="subject">Subject</FieldLabel>
                        <input
                            id="subject"
                            type="text"
                            value={blueprint.domainAlignment?.subject || ""}
                            disabled={disabled}
                            placeholder="e.g. Mathematics"
                            onChange={(e) =>
                                updateNested("domainAlignment", "subject", e.target.value)
                            }
                            className={inputBase}
                        />
                    </div>
                    <div>
                        <FieldLabel htmlFor="grade-band">Grade Band</FieldLabel>
                        <input
                            id="grade-band"
                            type="text"
                            value={blueprint.domainAlignment?.gradeBand || ""}
                            disabled={disabled}
                            placeholder="e.g. Grades 6–8"
                            onChange={(e) =>
                                updateNested("domainAlignment", "gradeBand", e.target.value)
                            }
                            className={inputBase}
                        />
                    </div>
                </div>
            </Section>

            {/* Exposure */}
            <Section
                title="Exposure Policy"
                description="How often an item built from this Task Model may be shown before it is rested."
            >
                <div className="grid gap-6 md:grid-cols-2">
                    <div>
                        <FieldLabel htmlFor="max-uses">Max Uses</FieldLabel>
                        <input
                            id="max-uses"
                            type="number"
                            min="0"
                            value={blueprint.exposurePolicy?.maxUses ?? ""}
                            disabled={disabled}
                            placeholder="Unlimited if blank"
                            onChange={(e) =>
                                updateNested(
                                    "exposurePolicy",
                                    "maxUses",
                                    numericOrNull(e.target.value)
                                )
                            }
                            className={`${inputBase} w-40`}
                        />
                    </div>
                    <ChoiceField
                        label="Cooldown Policy"
                        value={blueprint.exposurePolicy?.cooldownPolicy || ""}
                        options={COOLDOWN_POLICIES}
                        disabled={disabled}
                        onChange={(v) => updateNested("exposurePolicy", "cooldownPolicy", v)}
                    />
                </div>
            </Section>

            {/* Item contract */}
            <Section
                title="Item Contract"
                description="Leave a list empty to place no restriction. Selecting values makes them the only interaction types / scoring methods an Item bound to this Task Model may use."
            >
                <div className="grid gap-8 md:grid-cols-2">
                    <ChecklistField
                        legend="Allowed Interaction Types"
                        tooltip="Validated against item.interaction.type when an Item is saved."
                        options={INTERACTION_TYPES}
                        selected={allowedInteractionTypes}
                        disabled={disabled}
                        onToggle={(v) => updateList("allowedInteractionTypes", v)}
                    />
                    <ChecklistField
                        legend="Allowed Scoring Methods"
                        tooltip="Validated against item.scoring.method when an Item is saved."
                        options={SCORING_METHODS}
                        selected={allowedScoringMethods}
                        disabled={disabled}
                        onToggle={(v) => updateList("allowedScoringMethods", v)}
                    />
                </div>

                {(allowedInteractionTypes.length === 0 ||
                    allowedScoringMethods.length === 0) && (
                        <p className="mt-4 flex items-start gap-2 text-xs text-slate-400">
                            <Info size={12} strokeWidth={2.25} className="mt-0.5 shrink-0" />
                            An empty list means unconstrained. Items will then be limited
                            only by the observable's own declared type.
                        </p>
                    )}
            </Section>
        </div>
    );
}

/* ---------------- Presentational helpers ---------------- */

function Section({ title, description, children }) {
    return (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div>
                <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
                {description && (
                    <p className="mt-1 text-sm text-slate-500">{description}</p>
                )}
            </div>
            {children}
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

function ChoiceField({ label, value, options, disabled, onChange, tooltip }) {
    const id = `bp-${label.replace(/\s+/g, "-").toLowerCase()}`;

    return (
        <div>
            <FieldLabel htmlFor={id} tooltip={tooltip}>
                {label}
            </FieldLabel>
            <select
                id={id}
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                className={inputBase}
            >
                <option value="">Unspecified</option>
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

function ChecklistField({ legend, options, selected, disabled, onToggle, tooltip }) {
    return (
        <fieldset>
            <legend className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                {legend}
                {tooltip && <InfoTooltip content={tooltip} />}
            </legend>
            <div className="space-y-2">
                {options.map((o) => (
                    <label
                        key={o.value}
                        className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
                    >
                        <input
                            type="checkbox"
                            checked={selected.includes(o.value)}
                            disabled={disabled}
                            onChange={() => onToggle(o.value)}
                            className="h-4 w-4 rounded border-slate-300 accent-slate-900 disabled:cursor-not-allowed"
                        />
                        {o.label}
                    </label>
                ))}
            </div>
        </fieldset>
    );
}

function Banner({ tone, children }) {
    const classes =
        tone === "error"
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-amber-200 bg-amber-50 text-amber-800";

    return (
        <div className={`flex items-start gap-3 rounded-lg border px-4 py-3.5 text-sm ${classes}`}>
            <AlertTriangle size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
            <span>{children}</span>
        </div>
    );
}
