// src/components/assemblyModels/AssemblyModelWizard/AssemblyModelWizardContext.jsx
// D54 (agreement test closed D90 / W18 block close).
// ------------------------------------------------------------
// Assembly Model wizard state, following the established pattern (see
// CompetencyWizardContext.jsx): data-fetching, draft state, step validity
// and the save/transition mutations live here; the step components read
// them via useAssemblyModelWizard().
//
// The backend (assemblyModelsRoutes.js) is the same "one PUT does both
// content and status" shape QMatrixEditor.jsx already wraps -- there is no
// separate /lifecycle or /confirm endpoint, unlike competencyModels. So
// saveAndReview/confirmModel/returnToDraft below all go through
// useTransitionAssemblyModel(), exactly as QMatrixEditor's transitionTo()
// does, not through a dedicated lifecycle route.
//
// canProceed's reviewed/confirmed gates come from assemblyModelReadiness.js
// and must agree with validateAssemblyModelLifecycle — see
// assemblyModelReadiness.test.js. Do not re-hand-write those checks here.
// ------------------------------------------------------------

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
import { useCompetencyModels } from "@/api/queries/competencies";
import { usePolicies } from "@/api/queries/policies";
import {
  useAssemblyModel,
  useCreateAssemblyModel,
  useUpdateAssemblyModel,
  useTransitionAssemblyModel,
} from "@/api/queries/assemblyModels";
import {
  meetsAssemblyReviewedGates,
  meetsAssemblyConfirmedGates,
  hasAssemblyStoppingRule,
} from "../assemblyModelReadiness";
const AssemblyModelWizardContext = createContext(null);

export function useAssemblyModelWizard() {
  const ctx = useContext(AssemblyModelWizardContext);
  if (!ctx) {
    throw new Error(
      "useAssemblyModelWizard must be used inside AssemblyModelWizardProvider"
    );
  }
  return ctx;
}

const emptyDraft = () => ({
  id: undefined,
  name: "",
  description: "",
  competencyModelId: "",
  competencyModelVersion: undefined,
  targetsBySMV: [],
  stoppingRules: {},
  selectionAlgorithm: {},
  status: "draft",
  locked: false,
});

export function AssemblyModelWizardProvider({ assemblyModelId, onSaved, children }) {
  const isEditing = Boolean(assemblyModelId);

  const { data: existing, isLoading: loadingExisting } = useAssemblyModel(assemblyModelId, {
    enabled: isEditing,
  });
  const { data: competencyModels = [] } = useCompetencyModels();
  const { data: policies = [] } = usePolicies();

  const [draft, setDraft] = useState(emptyDraft());
  const [currentStep, setCurrentStep] = useState(1);
  const [isDirty, setIsDirty] = useState(false);

  // Same stale-closure guard QMatrixEditor.jsx uses: WizardStepContainer's
  // handleSave() calls onSaveDraft() then onSaveAndReview() from the SAME
  // render's closures, so a freshly-created record's id must be read from a
  // ref kept in sync, not from `draft.id` (which the second call would still
  // see as undefined otherwise).
  const draftIdRef = useRef(draft.id);

  useEffect(() => {
    if (isEditing && existing) {
      setDraft(existing);
      draftIdRef.current = existing.id;
      setIsDirty(false);
    }
  }, [isEditing, existing]);

  const createMutation = useCreateAssemblyModel();
  const updateMutation = useUpdateAssemblyModel();
  const transitionMutation = useTransitionAssemblyModel();

  const competencyModel = competencyModels.find((m) => m.id === draft.competencyModelId);
  const smVariables = competencyModel?.smVariables || [];

  function markDirty() {
    setIsDirty(true);
  }

  function updateField(field, value) {
    if (draft.locked) return;
    setDraft((d) => ({ ...d, [field]: value }));
    markDirty();
  }

  // Selecting a competency model resets the SMV targets -- a target row
  // names an smvId that only means something relative to the bound model,
  // the same "changing the parent clears dependent selections" rule
  // QMatrixEditor's competency-model Combobox already applies to
  // attributeIds/entries.
  function selectCompetencyModel(id) {
    if (draft.locked) return;
    const model = competencyModels.find((m) => m.id === id);
    setDraft((d) => ({
      ...d,
      competencyModelId: id,
      competencyModelVersion: model?.versionNumber,
      targetsBySMV: [],
    }));
    markDirty();
  }

  function setTargetForSmv(smvId, patch) {
    if (draft.locked) return;
    setDraft((d) => {
      const rest = (d.targetsBySMV || []).filter((t) => t.smvId !== smvId);
      return { ...d, targetsBySMV: [...rest, { smvId, ...patch }] };
    });
    markDirty();
  }

  function clearTargetForSmv(smvId) {
    if (draft.locked) return;
    setDraft((d) => ({
      ...d,
      targetsBySMV: (d.targetsBySMV || []).filter((t) => t.smvId !== smvId),
    }));
    markDirty();
  }

  function patchStoppingRules(patch) {
    if (draft.locked) return;
    setDraft((d) => ({ ...d, stoppingRules: { ...(d.stoppingRules || {}), ...patch } }));
    markDirty();
  }

  function setSelectionPolicy(policyId) {
    if (draft.locked) return;
    setDraft((d) => ({ ...d, selectionAlgorithm: { ...(d.selectionAlgorithm || {}), policyId } }));
    markDirty();
  }

  /* =====================================================
     STEP VALIDITY -- assemblyModelReadiness (D54 agreement).
  ===================================================== */
  const meetsReviewed = useMemo(() => meetsAssemblyReviewedGates(draft), [draft]);
  const meetsConfirmed = useMemo(() => meetsAssemblyConfirmedGates(draft), [draft]);

  const stepValidity = useMemo(
    () => ({
      1: Boolean(draft.name && draft.competencyModelId),
      2: Array.isArray(draft.targetsBySMV) && draft.targetsBySMV.length > 0,
      3: true, // stopping rules are optional until confirm; Review (step 5) is the real gate
      4: Boolean(draft.selectionAlgorithm?.policyId),
      5: draft.status === "reviewed" ? meetsConfirmed : meetsReviewed,
    }),
    [draft, meetsReviewed, meetsConfirmed]
  );

  function canProceed(step) {
    return stepValidity[step] ?? true;
  }

  /* =====================================================
     PERSIST -- create or update, mirroring QMatrixEditor.persist().

     Found live (D54 verification walk): schema.js's assemblyModels
     validation runs stoppingRules' shape check whenever the KEY IS
     PRESENT AT ALL, not only once it has real content -- stoppingRules
     is optional before confirmation per validateAssemblyModelLifecycle,
     but schema.js itself does not gate on status. Sending `stoppingRules:
     {}` (this file's own emptyDraft() default) tripped "must declare at
     least one of maxItems, minItems or targetsMet" on every save before
     Step 3 had real content. Omit the key entirely (undefined, which
     JSON.stringify drops) until at least one rule is actually set, the
     same way selectionAlgorithm is only ever sent once it has a
     policyId -- see AssemblyModelWizard.jsx's goNext() for why THAT one
     is unconditionally required, not just optional-until-confirm.
  ===================================================== */
  async function persist() {
    const hasStoppingRule = hasAssemblyStoppingRule(draft);

    const payload = {
      name: draft.name,
      description: draft.description,
      competencyModelId: draft.competencyModelId,
      competencyModelVersion: competencyModel?.versionNumber,
      targetsBySMV: draft.targetsBySMV,
      stoppingRules: hasStoppingRule ? draft.stoppingRules : undefined,
      selectionAlgorithm: draft.selectionAlgorithm?.policyId ? draft.selectionAlgorithm : undefined,
    };

    try {
      const saved = draft.id
        ? await updateMutation.mutateAsync({ id: draft.id, payload })
        : await createMutation.mutateAsync(payload);
      setDraft(saved);
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
      setDraft(saved);
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
    const saved = await transitionTo(
      "reviewed",
      "Assembly model saved for review.",
      "Could not save for review."
    );
    if (saved) onSaved?.(saved);
  }

  async function confirmModel() {
    const saved = await transitionTo(
      "confirmed",
      "Assembly model confirmed and locked.",
      "Confirmation failed."
    );
    if (saved) onSaved?.(saved);
  }

  async function returnToDraft() {
    await transitionTo(
      "draft",
      "Assembly model returned to draft.",
      "Could not return model to draft."
    );
  }

  const value = {
    draft,
    isEditing,
    loading: isEditing && loadingExisting,
    competencyModels,
    competencyModel,
    smVariables,
    policies,
    currentStep,
    setCurrentStep,
    isDirty,

    updateField,
    selectCompetencyModel,
    setTargetForSmv,
    clearTargetForSmv,
    patchStoppingRules,
    setSelectionPolicy,

    canProceed,
    saveDraft,
    saveAndReview,
    confirmModel,
    returnToDraft,
  };

  return (
    <AssemblyModelWizardContext.Provider value={value}>
      {children}
    </AssemblyModelWizardContext.Provider>
  );
}
