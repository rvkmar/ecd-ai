// TaskModelWizardContext.jsx
// ------------------------------------------------------------
// Task Model Wizard — draft ownership, gating and persistence
// ------------------------------------------------------------
// Owns the working draft, the step gate, the dirty flag and the two
// server round-trips (save draft, promote). No UI, no fetching.
//
// CHANGES IN THIS REWORK
// ----------------------
// • Competency selection is gone. `taskPurpose` (primaryCompetencyId /
//   excludedCompetencyIds) and `competencyFrameworkId` are no longer part
//   of the draft, no longer gate promotion, and are no longer required by
//   server/utils/lifecycleValidation.js. A Task Model's construct comes
//   from the Evidence Models it binds -- evidenceModel.competencyId --
//   and asking for it twice let the two disagree.
//
// • `primaryEvidenceModelId` replaces the primary-claim concept. It is a
//   pointer into evidenceModelIds, so it cannot contradict the binding.
//
// • The dirty flag was wrong on open. `lastSavedSnapshot` was
//   `normalize(initialModel)` -- the RAW server record -- while `isDirty`
//   compared it against `normalize(draft)`, the *normalized* draft built
//   from it with defaults filled in and keys reordered. The two never
//   matched, so every model opened dirty and the Cancel guard fired on a
//   wizard the user had not touched. Both sides now normalize the same
//   way, with sorted keys so key order cannot produce a phantom diff.
//
// • Step completeness is derived from taskModelReadiness() in
//   taskModelConstants.js, the single definition also used by the review
//   step, the list, the table and the dashboard. Previously each of those
//   carried its own slightly different copy.
// ------------------------------------------------------------

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

import { isLinkableEvidenceModel } from "@/utils/schema";
import { taskModelReadiness } from "../taskModelConstants";

const TaskModelWizardContext = createContext(null);

export function useTaskModelWizard() {
    const ctx = useContext(TaskModelWizardContext);
    if (!ctx) {
        throw new Error("useTaskModelWizard must be used inside TaskModelWizardProvider");
    }
    return ctx;
}

export const STEPS = [
    "identity",
    "evidence",
    "observables",
    "structure",
    "blueprint",
    "variables",
    "itemMapping",
    "fairness",
    "review",
];

/* ------------------------------------------------------------
 DRAFT SHAPE
 Every persisted field is listed here explicitly. A field missing
 from this builder is a field the wizard silently discards on every
 save/reload cycle -- which is exactly what used to happen to
 accessibilityAssumptions and subTaskIds.
------------------------------------------------------------ */

export function buildInitialDraft(model) {
    const m = model || {};

    return {
        id: m.id,
        status: m.status || "draft",
        locked: m.locked || false,
        versionNumber: m.versionNumber || 1,
        parentModelId: m.parentModelId || null,

        name: m.name || "",
        description: m.description || "",
        designRationale: m.designRationale || "",

        evidenceModelIds: m.evidenceModelIds || [],
        primaryEvidenceModelId:
            m.primaryEvidenceModelId ||
            // Records authored before the primary pointer existed: adopt the
            // first bound model rather than presenting the step as broken.
            (m.evidenceModelIds || [])[0] ||
            "",
        expectedObservations: m.expectedObservations || [],

        taskCompositionType: m.taskCompositionType || "",
        subTaskIds: m.subTaskIds || [],
        actions: m.actions || [],

        taskStructure: {
            presentationMode: "",
            responseFormat: "",
            stimulusPolicy: "",
            timingConstraint: {},
            resourceConstraints: {},
            administration: {},
            ...(m.taskStructure || {}),
        },

        blueprintConstraints: {
            // NOT prefilled to 0-1. Difficulty is expressed on the scale of
            // the bound evidence's statistical model, and those scales are
            // not interchangeable -- IRT/Rasch difficulty is in logits
            // (about -3 to 3), CTT difficulty is a proportion correct (0 to
            // 1). Defaulting to 0-1 unconditionally handed an IRT-backed
            // task a CTT range on a logit field: silently wrong, and valid
            // enough (min < max) to sail through every check.
            //
            // Left empty so Step5Blueprint can offer the right default for
            // the scale actually in play, and so the readiness gate holds
            // until the author has said. Existing records spread over this
            // and keep whatever they stored.
            difficultyRange: {},
            cognitiveDemand: {},
            domainAlignment: {},
            exposurePolicy: {},
            allowedInteractionTypes: [],
            allowedScoringMethods: [],
            ...(m.blueprintConstraints || {}),
        },

        selectedItemIds: m.selectedItemIds || [],
        itemMappings: m.itemMappings || [],

        // D117: shared Task Model Variable bindings (library + per-model settings).
        taskModelVariableIds: Array.isArray(m.taskModelVariableIds)
            ? [...m.taskModelVariableIds]
            : [],
        taskModelVariableSettings: Array.isArray(m.taskModelVariableSettings)
            ? m.taskModelVariableSettings.map((s) => ({ ...s }))
            : [],

        fairnessRisks: m.fairnessRisks || [],
        fairnessNotes: m.fairnessNotes || "",
        accessibilityAssumptions: m.accessibilityAssumptions || {},

        equivalenceGroupId: m.equivalenceGroupId || "",
    };
}

// Stable stringify: JSON.stringify preserves insertion order, so two
// structurally identical drafts built by different code paths could
// serialize differently and read as "dirty".
function normalize(value) {
    if (value === null || value === undefined) return "null";

    return JSON.stringify(value, (_key, val) => {
        if (val && typeof val === "object" && !Array.isArray(val)) {
            return Object.keys(val)
                .sort()
                .reduce((acc, k) => {
                    acc[k] = val[k];
                    return acc;
                }, {});
        }
        return val;
    });
}

export default function TaskModelWizardProvider({
    initialModel,
    evidenceModels = [],
    items = [],
    onSave,
    onPromote,
    children,
}) {
    const [draft, setDraft] = useState(() => buildInitialDraft(initialModel));
    const [lastSavedSnapshot, setLastSavedSnapshot] = useState(() =>
        normalize(buildInitialDraft(initialModel))
    );
    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
        const next = buildInitialDraft(initialModel);
        setDraft(next);
        setLastSavedSnapshot(normalize(next));
    }, [initialModel]);

    const isDirty = useMemo(
        () => normalize(draft) !== lastSavedSnapshot,
        [draft, lastSavedSnapshot]
    );

    /* ------------------------------------------------------------
     LIFECYCLE
    ------------------------------------------------------------ */

    const lifecycleStatus = draft.status || "draft";
    const isEditable = lifecycleStatus === "draft" || lifecycleStatus === "reviewed";
    const isReviewMode = lifecycleStatus === "reviewed";

    /* ------------------------------------------------------------
     EVIDENCE + OBSERVABLE LOOKUPS

     `linkable` is confirmed | operational | suspended -- the same
     predicate the server applies. The caller used to pre-filter to
     `status === "confirmed" && locked`, and this context filtered the
     result the same way again, so an evidence model that had been
     ACTIVATED (status "operational") disappeared from the picker and
     could never receive a new task model.
    ------------------------------------------------------------ */

    const linkableEvidenceModels = useMemo(
        () => (evidenceModels || []).filter(isLinkableEvidenceModel),
        [evidenceModels]
    );

    // observationId → observable definition. Built from every linkable
    // model plus anything already bound, so a task bound to a model that
    // has since been archived still renders its observables by name
    // instead of by raw id.
    const observationLookup = useMemo(() => {
        const lookup = {};
        (evidenceModels || []).forEach((em) => {
            (em.observables || []).forEach((obs) => {
                lookup[obs.id] = obs;
            });
        });
        return lookup;
    }, [evidenceModels]);

    /* ------------------------------------------------------------
     STEP GATING
    ------------------------------------------------------------ */

    const readiness = useMemo(() => taskModelReadiness(draft), [draft]);

    const checkPassed = useCallback(
        (key) => readiness.checks.find((c) => c.key === key)?.valid === true,
        [readiness]
    );

    // Index-aligned with STEPS (excluding review). Item mapping, variables,
    // and fairness never block forward navigation: variables are optional
    // until an author chooses them; item mapping is advisory; accessibility
    // assumptions are only required at activation, not at confirmation.
    const stepCanAdvance = [
        checkPassed("identity"),
        checkPassed("evidence"),
        checkPassed("observables") && checkPassed("weights"),
        checkPassed("structure"),
        checkPassed("blueprint"),
        true, // variables (D117)
        true, // itemMapping
        true, // fairness
    ];

    const canGoNext = stepCanAdvance[currentStep] ?? true;

    const isStructurallyComplete = readiness.isComplete;

    // A locked model is read-only, not immobile: walking it end to end is
    // the whole point of View mode, and the completeness gate is something
    // no reader can satisfy.
    const goNext = () => {
        if ((canGoNext || !isEditable) && currentStep < STEPS.length - 1) {
            setCurrentStep((s) => s + 1);
        }
    };

    const goBack = () => {
        if (currentStep > 0) setCurrentStep((s) => s - 1);
    };

    /* ------------------------------------------------------------
     PERSISTENCE

     onSave returns the saved record, or null when the request failed
     (it reports its own errors). Folding the response back into the
     draft is what turns the second Save into a PUT against the real
     record instead of a second POST.
    ------------------------------------------------------------ */

    const handleSaveDraft = async () => {
        const saved = await onSave?.({ ...draft });

        if (saved) {
            const next = buildInitialDraft(saved);
            setDraft(next);
            setLastSavedSnapshot(normalize(next));
        }

        return saved || null;
    };

    const handlePromote = async (nextStatus) => {
        return onPromote?.({ ...draft, status: nextStatus }, nextStatus);
    };

    const value = {
        draft,
        setDraft,

        lifecycleStatus,
        isEditable,
        isReviewMode,

        linkableEvidenceModels,
        items,
        observationLookup,

        STEPS,
        currentStep,
        setCurrentStep,
        canGoNext,
        goNext,
        goBack,

        isDirty,
        readiness,
        isStructurallyComplete,

        handleSaveDraft,
        handlePromote,
    };

    return (
        <TaskModelWizardContext.Provider value={value}>
            {children}
        </TaskModelWizardContext.Provider>
    );
}
