// src/components/presentationModels/PresentationModelWizard/PresentationModelWizardContext.jsx
// D113. Convention A on the shared wizard shell (same calling shape as
// Assembly Model): data-fetching, draft state, step validity and the
// save/transition mutations live here.
//
// canProceed's reviewed/confirmed gates come from
// presentationModelReadiness.js and must agree with
// validatePresentationModelLifecycle.

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import { apiErrorMessage } from "@/api/apiClient";
import { useTaskModels } from "@/api/queries/taskModels";
import {
  usePresentationModel,
  useCreatePresentationModel,
  useUpdatePresentationModel,
  useTransitionPresentationModel,
} from "@/api/queries/presentationModels";
import {
  meetsPresentationReviewedGates,
  meetsPresentationConfirmedGates,
} from "../presentationModelReadiness";

const PresentationModelWizardContext = createContext(null);

export function usePresentationModelWizard() {
  const ctx = useContext(PresentationModelWizardContext);
  if (!ctx) {
    throw new Error(
      "usePresentationModelWizard must be used inside PresentationModelWizardProvider"
    );
  }
  return ctx;
}

const emptyDraft = () => ({
  id: undefined,
  name: "",
  description: "",
  taskModelId: "",
  taskModelVersion: undefined,
  layout: {},
  conditionalDisplay: {},
  accessibility: {},
  status: "draft",
  locked: false,
});

export function PresentationModelWizardProvider({ presentationModelId, onSaved, children }) {
  const isEditing = Boolean(presentationModelId);

  const { data: existing, isLoading: loadingExisting } = usePresentationModel(presentationModelId, {
    enabled: isEditing,
  });
  const { data: taskModels = [] } = useTaskModels();

  const [draft, setDraft] = useState(emptyDraft());
  const [currentStep, setCurrentStep] = useState(1);
  const [isDirty, setIsDirty] = useState(false);

  const draftIdRef = useRef(draft.id);

  useEffect(() => {
    if (isEditing && existing) {
      setDraft({
        ...emptyDraft(),
        ...existing,
        layout: existing.layout || {},
        conditionalDisplay: existing.conditionalDisplay || {},
        accessibility: existing.accessibility || {},
      });
      draftIdRef.current = existing.id;
      setIsDirty(false);
    }
  }, [isEditing, existing]);

  const createMutation = useCreatePresentationModel();
  const updateMutation = useUpdatePresentationModel();
  const transitionMutation = useTransitionPresentationModel();

  const taskModel = taskModels.find((m) => m.id === draft.taskModelId);

  function markDirty() {
    setIsDirty(true);
  }

  function updateField(field, value) {
    if (draft.locked) return;
    setDraft((d) => ({ ...d, [field]: value }));
    markDirty();
  }

  function selectTaskModel(id) {
    if (draft.locked) return;
    const model = taskModels.find((m) => m.id === id);
    setDraft((d) => ({
      ...d,
      taskModelId: id,
      taskModelVersion: model?.versionNumber,
    }));
    markDirty();
  }

  function patchLayout(patch) {
    if (draft.locked) return;
    setDraft((d) => ({ ...d, layout: { ...(d.layout || {}), ...patch } }));
    markDirty();
  }

  function patchConditionalDisplay(patch) {
    if (draft.locked) return;
    setDraft((d) => ({
      ...d,
      conditionalDisplay: { ...(d.conditionalDisplay || {}), ...patch },
    }));
    markDirty();
  }

  function patchAccessibility(patch) {
    if (draft.locked) return;
    setDraft((d) => ({
      ...d,
      accessibility: { ...(d.accessibility || {}), ...patch },
    }));
    markDirty();
  }

  const meetsReviewed = useMemo(() => meetsPresentationReviewedGates(draft), [draft]);
  const meetsConfirmed = useMemo(() => meetsPresentationConfirmedGates(draft), [draft]);

  const stepValidity = useMemo(
    () => ({
      1: Boolean(draft.name && draft.taskModelId),
      2: Boolean(draft.layout?.itemOrder && draft.layout?.navigation),
      3: true,
      4: true,
      5: draft.status === "reviewed" ? meetsConfirmed : meetsReviewed,
    }),
    [draft, meetsReviewed, meetsConfirmed]
  );

  function canProceed(step) {
    return stepValidity[step] ?? true;
  }

  function compactObject(obj) {
    if (!obj || typeof obj !== "object") return undefined;
    const next = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined && v !== null && v !== "") next[k] = v;
    }
    return Object.keys(next).length > 0 ? next : undefined;
  }

  async function persist() {
    const payload = {
      name: draft.name,
      description: draft.description,
      taskModelId: draft.taskModelId,
      taskModelVersion: taskModel?.versionNumber,
      layout: compactObject(draft.layout),
      conditionalDisplay: compactObject(draft.conditionalDisplay),
      accessibility: compactObject(draft.accessibility),
    };

    try {
      const existingId = draftIdRef.current || draft.id;
      const saved = existingId
        ? await updateMutation.mutateAsync({ id: existingId, payload })
        : await createMutation.mutateAsync(payload);
      setDraft({
        ...emptyDraft(),
        ...saved,
        layout: saved.layout || {},
        conditionalDisplay: saved.conditionalDisplay || {},
        accessibility: saved.accessibility || {},
      });
      draftIdRef.current = saved.id;
      setIsDirty(false);
      return saved;
    } catch (err) {
      toast.error(apiErrorMessage(err, "Save failed."));
      return false;
    }
  }

  async function saveDraft() {
    const saved = await persist();
    return Boolean(saved);
  }

  async function transitionTo(status, successMessage, failureMessage) {
    const id = draftIdRef.current;
    if (!id) return null;
    try {
      const saved = await transitionMutation.mutateAsync({ id, status });
      setDraft({
        ...emptyDraft(),
        ...saved,
        layout: saved.layout || {},
        conditionalDisplay: saved.conditionalDisplay || {},
        accessibility: saved.accessibility || {},
      });
      draftIdRef.current = saved.id;
      setIsDirty(false);
      toast.success(successMessage);
      return saved;
    } catch (err) {
      toast.error(apiErrorMessage(err, failureMessage));
      return null;
    }
  }

  async function saveAndReview() {
    const saved = await persist();
    if (!saved) return;
    const reviewed = await transitionTo(
      "reviewed",
      "Presentation model saved for review.",
      "Could not save for review."
    );
    if (reviewed) onSaved?.(reviewed);
  }

  async function confirmModel() {
    const saved = await transitionTo(
      "confirmed",
      "Presentation model confirmed and locked.",
      "Confirmation failed."
    );
    if (saved) onSaved?.(saved);
  }

  async function returnToDraft() {
    await transitionTo(
      "draft",
      "Presentation model returned to draft.",
      "Could not return model to draft."
    );
  }

  const value = {
    draft,
    isEditing,
    loading: isEditing && loadingExisting,
    taskModels,
    taskModel,
    currentStep,
    setCurrentStep,
    isDirty,

    updateField,
    selectTaskModel,
    patchLayout,
    patchConditionalDisplay,
    patchAccessibility,

    canProceed,
    saveDraft,
    saveAndReview,
    confirmModel,
    returnToDraft,
  };

  return (
    <PresentationModelWizardContext.Provider value={value}>
      {children}
    </PresentationModelWizardContext.Provider>
  );
}
