// src/components/itemBank/ItemWizard/ItemWizardContext.jsx
// ------------------------------------------------------------
// Item Wizard state, navigation and persistence.
//
// THE BUG THIS FILE EXISTED TO CAUSE
//
// The previous version gated Next on
//
//     Object.values(validationResult.errors).flat().length === 0
//
// where validationResult came from `validateItem(item)` -- called with no
// second argument. validateItem's signature is
// `validateItem(item, { taskModel, evidenceModel, observable,
// activeStatisticalModel })`, and with those undefined it unconditionally
// pushed "Observable not found in EvidenceModel." and "Active statistical
// model not found." on every single call. canProceedToNextStep was
// therefore false for every item at every step, forever.
//
// ItemWizard.jsx then compounded it: its nav bar read `isStepValid` from
// this context, which this context never provided, so `!isStepValid` was
// `!undefined` -- true -- and Next and Save were disabled on top of that.
//
// The Item Wizard has not been able to advance past step 1 for any item.
// Because activating a Task Model requires at least one confirmed Item,
// the whole Competency -> Evidence -> Task -> Item -> Session activation
// chain terminated here.
//
// Two changes fix the class of bug, not just the instance:
//   * Validation is CONTEXT-AWARE. The task model and evidence model are
//     fetched here, once, and passed to every readiness computation.
//   * Gating is PER-STEP. A global gate is the wrong shape regardless of
//     whether it computes correctly: it blocks step 1 on an error whose
//     only fix lives on step 5, which is unreachable from step 1. Each
//     step blocks only on the checks it owns (itemConstants.STEP_BLOCKING_CHECKS);
//     everything else is advisory and surfaces on Review.
// ------------------------------------------------------------

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import toast from "react-hot-toast";

import {
  useCreateItem,
  useUpdateItem,
  useSimulateItem,
  useTransitionItemLifecycle,
  useCloneItem,
  useCalibrateItem,
} from "@/api/queries/items";
import { useTaskModel } from "@/api/queries/taskModels";
import { useEvidenceModel } from "@/api/queries/evidenceModels";
import { apiErrorMessage } from "@/api/apiClient";

import {
  ITEM_WIZARD_STEPS,
  ITEM_WIZARD_STEP_KEYS,
  buildInitialItemDraft,
  deriveItemContext,
  itemReadiness,
  itemCompatibilityNotes,
  operationalReadiness,
  stepBlockingChecks,
} from "../itemConstants";

const ItemWizardContext = createContext(null);

export function useItemWizard() {
  const ctx = useContext(ItemWizardContext);
  if (!ctx) {
    throw new Error("useItemWizard must be used inside ItemWizardProvider");
  }
  return ctx;
}

export { ITEM_WIZARD_STEPS };

export function ItemWizardProvider({ children, initialItem }) {
  /* =====================================================
     Draft state
     -----------------------------------------------------
     Normalised on the way in. Previously the raw record was held as
     state but compared against a normalised shape for dirty tracking, so
     every item opened dirty and the first Next auto-saved an untouched
     record.
  ===================================================== */

  const [item, setItem] = useState(() => buildInitialItemDraft(initialItem));
  const [currentStep, setCurrentStep] = useState(0);

  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(() =>
    initialItem ? JSON.stringify(buildInitialItemDraft(initialItem)) : null
  );

  const isDirty =
    lastSavedSnapshot === null || JSON.stringify(item) !== lastSavedSnapshot;

  /* =====================================================
     The chain behind the item
  ===================================================== */

  const { data: taskModel = null, isLoading: taskModelLoading } = useTaskModel(
    item.taskModelId
  );
  const { data: evidenceModel = null, isLoading: evidenceModelLoading } =
    useEvidenceModel(item.evidenceModelId);

  const chainLoading = taskModelLoading || evidenceModelLoading;

  const ctx = useMemo(
    () => deriveItemContext(item, { taskModel, evidenceModel }),
    [item, taskModel, evidenceModel]
  );

  /* =====================================================
     Mutations
  ===================================================== */

  const createItemMutation = useCreateItem();
  const updateItemMutation = useUpdateItem();
  const simulateItemMutation = useSimulateItem();
  const transitionItemMutation = useTransitionItemLifecycle();
  const cloneItemMutation = useCloneItem();
  const calibrateItemMutation = useCalibrateItem();

  /* =====================================================
     Governance
  ===================================================== */

  const isLocked = item.locked === true;
  const canEdit = !isLocked;

  const status = item.status || "draft";

  // Derived from the lifecycle matrix rather than restated, so the
  // buttons offered here and the transitions the server accepts cannot
  // disagree. `canConfirm` used to be `status === "reviewed"` alone,
  // which is right, but three different components each decided it
  // separately and two of them also required things the server did not.
  const canSendToReview = canEdit && status === "draft";
  const canConfirm = status === "reviewed";
  const canActivate = status === "confirmed";
  const canSuspend = status === "operational";
  const canReactivate = status === "suspended";
  const canArchive = ["confirmed", "operational", "suspended"].includes(status);
  const canReject = status === "reviewed";
  const canClone = isLocked && status !== "archived";

  /* =====================================================
     Mutation API
  ===================================================== */

  const safeSetItem = useCallback(
    (updater) => {
      if (isLocked) return;
      setItem((prev) => (typeof updater === "function" ? updater(prev) : updater));
    },
    [isLocked]
  );

  const activeModelType = ctx.activeStatisticalModel?.type || "";
  useEffect(() => {
    if (!canEdit || !activeModelType) return;
    if (item.psychometrics?.statisticalModelType === activeModelType) return;
    safeSetItem((prev) => ({
      ...prev,
      psychometrics: {
        ...prev.psychometrics,
        statisticalModelType: activeModelType,
      },
    }));
  }, [canEdit, activeModelType, item.psychometrics?.statisticalModelType, safeSetItem]);

  const updateField = useCallback(
    (field, value) => safeSetItem((prev) => ({ ...prev, [field]: value })),
    [safeSetItem]
  );

  const updateNestedField = useCallback(
    (parent, field, value) =>
      safeSetItem((prev) => ({
        ...prev,
        [parent]: { ...(prev[parent] || {}), [field]: value },
      })),
    [safeSetItem]
  );

  const replaceObject = useCallback(
    (parent, obj) => {
      if (!obj || typeof obj !== "object") return;
      safeSetItem((prev) => ({ ...prev, [parent]: obj }));
    },
    [safeSetItem]
  );

  const mergeObject = useCallback(
    (parent, partial) => {
      if (!partial || typeof partial !== "object") return;
      safeSetItem((prev) => ({
        ...prev,
        [parent]: { ...(prev[parent] || {}), ...partial },
      }));
    },
    [safeSetItem]
  );

  /* Binding the Task Model resets everything derived from it.

     Leaving the old observation, interaction and scoring in place when
     the Task Model changed produced an item whose scoring was derived
     from an Evidence Model it no longer referenced -- valid-looking, and
     wrong in a way no error message named. */
  const bindTaskModel = useCallback(
    (tm) => {
      if (isLocked) return;

      /* Blueprint constraints are INHERITED, not merely displayed.

         The blueprint declares a subject, a grade band, a cognitive
         demand and an exposure ceiling that every item instantiating the
         model is meant to sit inside. The wizard showed them as
         placeholder text and prefilled nothing, so an author had to
         retype values the Task Model had already stated -- and the
         exposure ceiling in particular defaulted to 0 ("no ceiling")
         while the blueprint declared a real number, which is the one
         field where the wrong default has operational consequences.

         Seeded only on bind, and only into empty fields, so this can
         never overwrite something the author chose. Everything remains
         editable: departing from the blueprint is allowed and sometimes
         right, and Step 6 says so. */
      const blueprint = tm?.blueprintConstraints || {};

      const seedIfEmpty = (current, candidate) =>
        String(current ?? "").trim().length > 0 ? current : candidate ?? current;

      safeSetItem((prev) => ({
        ...prev,
        taskModelId: tm?.id ?? null,
        taskModelVersion: tm?.versionNumber ?? null,
        observationId: null,
        taskSpecId: null,
        evidenceModelId: null,
        evidenceModelVersion: null,
        interaction: { type: "", responseComponents: [], config: {} },
        scoring: { method: "", maxScore: 1, evidenceActivationMap: [] },
        psychometrics: {
          ...prev.psychometrics,
          statisticalModelType: "",
          irtParams: {},
          dinaParams: {},
        },
        metadata: {
          ...prev.metadata,
          subject: seedIfEmpty(
            prev.metadata?.subject,
            blueprint.domainAlignment?.subject
          ),
          grade: seedIfEmpty(
            prev.metadata?.grade,
            blueprint.domainAlignment?.gradeBand
          ),
        },
        cognitiveDemand: {
          ...prev.cognitiveDemand,
          bloomLevel: seedIfEmpty(
            prev.cognitiveDemand?.bloomLevel,
            blueprint.cognitiveDemand?.bloomLevel
          ),
          reasoningType: seedIfEmpty(
            prev.cognitiveDemand?.reasoningType,
            blueprint.cognitiveDemand?.reasoningType
          ),
        },
        exposureControl: {
          ...prev.exposureControl,
          maxUsageBeforeRetire:
            prev.exposureControl?.maxUsageBeforeRetire ||
            blueprint.exposurePolicy?.maxUses ||
            0,
        },
      }));
    },
    [isLocked, safeSetItem]
  );

  /* Selecting the observation sets the DERIVED evidence binding
     optimistically so the next steps can render immediately. The server
     recomputes both fields on save; they are shown, never trusted. */
  const bindObservation = useCallback(
    (observationId) => {
      if (isLocked) return;

      const declared = (taskModel?.expectedObservations || []).find(
        (eo) => eo.observationId === observationId
      );

      safeSetItem((prev) => ({
        ...prev,
        observationId: observationId || null,
        evidenceModelId: declared?.evidenceModelId ?? null,
        // Version is unknown until the Evidence Model is fetched; the
        // server fills it. Null rather than a stale carry-over.
        evidenceModelVersion: null,
        interaction: { type: "", responseComponents: [], config: {} },
        scoring: { method: "", maxScore: 1, evidenceActivationMap: [] },
      }));
    },
    [isLocked, safeSetItem, taskModel]
  );

  const bindTaskSpec = useCallback(
    (taskSpecId) => {
      if (isLocked) return;
      const next = String(taskSpecId || "").trim();
      safeSetItem((prev) => ({
        ...prev,
        taskSpecId: next || null,
      }));
    },
    [isLocked, safeSetItem]
  );

  /* =====================================================
     Readiness
  ===================================================== */

  const readiness = useMemo(() => itemReadiness(item, ctx), [item, ctx]);
  const compatibilityNotes = useMemo(
    () => itemCompatibilityNotes(item, ctx),
    [item, ctx]
  );
  const operationalChecks = useMemo(
    () => operationalReadiness(item, ctx),
    [item, ctx]
  );

  const isReady = readiness.every((c) => c.ok);
  const failing = readiness.filter((c) => !c.ok);
  const blocking = compatibilityNotes.filter((n) => n.severity === "blocking");

  const currentStepKey = ITEM_WIZARD_STEP_KEYS[currentStep];

  const stepBlockers = useMemo(
    () => stepBlockingChecks(currentStepKey, item, ctx),
    [currentStepKey, item, ctx]
  );

  /* Sidebar completion, derived from the item rather than from position.

     The rail used to tick a step whenever `index < currentStep`, so the
     ticks were a record of how far the cursor had travelled, not of what
     was finished: walking back to step 1 un-ticked steps 2 and 3 although
     nothing about them had changed, and a step could show complete while
     its own readiness checks were failing.

     A step with readiness checks is complete when all of them pass. A step
     with none of its own -- Blueprint is read-only, Metadata is entirely
     advisory -- has nothing to fail, so the only honest signal is whether
     the author has been there; `furthestStep` remembers that across
     backwards navigation. */
  const [furthestStep, setFurthestStep] = useState(
    // A confirmed item is finished by definition -- opening one to read it
    // should not show seven "not started" steps.
    initialItem?.locked ? ITEM_WIZARD_STEPS.length : 0
  );

  const stepCompletion = useMemo(() => {
    const map = {};

    ITEM_WIZARD_STEPS.forEach((step, index) => {
      const owned = readiness.filter((c) => c.step === step.key);

      if (step.key === "review") {
        map[step.key] = isReady && blocking.length === 0;
      } else if (owned.length > 0) {
        map[step.key] = owned.every((c) => c.ok);
      } else {
        map[step.key] = index < furthestStep;
      }
    });

    return map;
  }, [readiness, isReady, blocking, furthestStep]);

  // A locked item is being READ, not built. Gating a read would pin the
  // reader to step 1 on an error nothing on screen can fix.
  const isStepValid = !canEdit || stepBlockers.length === 0;

  /* =====================================================
     Persistence
  ===================================================== */

  const saveDraft = useCallback(async () => {
    if (isLocked) {
      return { success: true, data: item, error: null };
    }

    try {
      const data = item.id
        ? await updateItemMutation.mutateAsync({ id: item.id, payload: item })
        : await createItemMutation.mutateAsync(item);

      if (data) {
        const normalized = buildInitialItemDraft(data);
        setItem(normalized);
        setLastSavedSnapshot(JSON.stringify(normalized));
      }

      return { success: true, data, error: null };
    } catch (err) {
      const message = apiErrorMessage(err, err.message || "Failed to save item.");
      toast.error(message);
      return { success: false, data: null, error: message };
    }
  }, [isLocked, item, createItemMutation, updateItemMutation]);

  /* =====================================================
     Navigation
  ===================================================== */

  const nextStep = useCallback(async () => {
    if (canEdit && stepBlockers.length > 0) return false;

    // Once past step 1 every Next silently persists first. The very
    // first Next creates the record.
    if (canEdit) {
      const result = await saveDraft();
      if (!result.success) return false;
    }

    setCurrentStep((s) => {
      const next = Math.min(s + 1, ITEM_WIZARD_STEPS.length - 1);
      setFurthestStep((f) => Math.max(f, next));
      return next;
    });
    return true;
  }, [canEdit, stepBlockers, saveDraft]);

  const prevStep = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  const goToStep = useCallback(
    (index) => {
      if (index < 0 || index >= ITEM_WIZARD_STEPS.length) return;
      // Backwards and re-entry are always allowed; forward jumps are
      // earned, except on a locked item where every step is readable.
      // A locked item is being read, so every step is reachable; while
      // editing, forward jumps are still earned.
      if (isLocked || index <= currentStep) {
        setCurrentStep(index);
        setFurthestStep((f) => Math.max(f, index));
      }
    },
    [isLocked, currentStep]
  );

  /* =====================================================
     Lifecycle
  ===================================================== */

  const transitionLifecycle = useCallback(
    async (nextStatus, options = {}) => {
      if (!item.id) {
        const message = "Save the item before changing its status.";
        toast.error(message);
        return { success: false, data: null, error: message };
      }

      try {
        const data = await transitionItemMutation.mutateAsync({
          id: item.id,
          nextStatus,
          force: options.force === true,
        });

        if (data) {
          if (data.compositeLibrary && data.compositeLibrary.ok === false) {
            toast.error(
              data.compositeLibrary.error ||
                "Composite library was not rebuilt. Scoring will refuse this task model until it is rebuilt."
            );
          }
          const normalized = buildInitialItemDraft(data);
          setItem(normalized);
          setLastSavedSnapshot(JSON.stringify(normalized));
        }

        return { success: true, data, error: null };
      } catch (err) {
        const message = apiErrorMessage(
          err,
          err.message || "Lifecycle transition failed."
        );
        toast.error(message);
        return { success: false, data: null, error: message };
      }
    },
    [item.id, transitionItemMutation]
  );

  const simulate = useCallback(async () => {
    if (!item.id) {
      return {
        success: false,
        data: null,
        error: "Save the item before running a preflight check.",
      };
    }

    try {
      const data = await simulateItemMutation.mutateAsync(item.id);
      return { success: true, data, error: null };
    } catch (err) {
      return {
        success: false,
        data: null,
        error: apiErrorMessage(err, err.message || "Preflight check failed."),
      };
    }
  }, [item.id, simulateItemMutation]);

  const cloneItem = useCallback(async () => {
    if (!item.id) return { success: false, data: null, error: "Nothing to clone." };

    try {
      const data = await cloneItemMutation.mutateAsync(item.id);

      if (data) {
        const normalized = buildInitialItemDraft(data);
        setItem(normalized);
        setLastSavedSnapshot(JSON.stringify(normalized));
        setCurrentStep(0);
        toast.success(`Cloned as v${data.versionNumber}. You are now editing the clone.`);
      }

      return { success: true, data, error: null };
    } catch (err) {
      const message = apiErrorMessage(err, err.message || "Clone failed.");
      toast.error(message);
      return { success: false, data: null, error: message };
    }
  }, [item.id, cloneItemMutation]);

  const calibrate = useCallback(
    async (params) => {
      if (!item.id) return { success: false, error: "Save the item first." };

      try {
        const data = await calibrateItemMutation.mutateAsync({
          id: item.id,
          irtParams: params,
        });

        if (data?.irtParams) {
          setItem((prev) => ({
            ...prev,
            psychometrics: {
              ...prev.psychometrics,
              calibrationStatus: data.calibrationStatus,
              irtParams: data.irtParams,
            },
          }));
        }

        toast.success("Calibration saved.");
        return { success: true, data, error: null };
      } catch (err) {
        const message = apiErrorMessage(err, err.message || "Calibration failed.");
        toast.error(message);
        return { success: false, data: null, error: message };
      }
    },
    [item.id, calibrateItemMutation]
  );

  /* =====================================================
     Value
  ===================================================== */

  const value = {
    item,
    ctx,
    chainLoading,
    taskModel,
    evidenceModel,

    currentStep,
    currentStepKey,
    steps: ITEM_WIZARD_STEPS,

    nextStep,
    prevStep,
    goToStep,

    updateField,
    updateNestedField,
    replaceObject,
    mergeObject,
    bindTaskModel,
    bindObservation,
    bindTaskSpec,

    readiness,
    failing,
    isReady,
    compatibilityNotes,
    blocking,
    operationalChecks,
    stepBlockers,
    stepCompletion,
    isStepValid,

    isDirty,
    saveDraft,
    simulate,
    transitionLifecycle,
    cloneItem,
    calibrate,

    canEdit,
    isLocked,
    canSendToReview,
    canConfirm,
    canActivate,
    canSuspend,
    canReactivate,
    canArchive,
    canReject,
    canClone,
  };

  return (
    <ItemWizardContext.Provider value={value}>
      {children}
    </ItemWizardContext.Provider>
  );
}
