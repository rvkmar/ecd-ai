import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import WizardSidebar from "@/components/wizard/WizardSidebar";
import WizardStepContainer from "@/components/wizard/WizardStepContainer";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { apiFetch, apiErrorMessage } from "@/api/apiClient";
import { useAuth } from "@/auth/AuthProvider";
import { evidenceModelsKey, evidenceModelKey } from "@/api/queries/evidenceModels";

import Step1ClaimIdentity from "./steps/Step1ClaimIdentity";
import Step2ClaimArticulation from "./steps/Step2ClaimArticulation";
import Step3Warrants from "./steps/Step3Warrants";
import Step4Observables from "./steps/Step4Observables";
import Step5EvidenceRules from "./steps/Step5EvidenceRules";
import Step6StatisticalModel from "./steps/Step6StatisticalModel";
import Step7InferentialAudit from "./steps/Step7InferentialAudit";
import Step8Confirmation from "./steps/Step8Confirmation";

import { useEvidenceWizardContext } from "./EvidenceWizardContext";
import { computeEvidenceInferentialAudit } from "./evidenceInferentialAudit";

/* ==========================================================
   STEP DEFINITIONS
========================================================== */
const STEPS = [
  { id: "identity", label: "Claim Identity", component: Step1ClaimIdentity },
  { id: "claim", label: "Claim Articulation", component: Step2ClaimArticulation },
  { id: "warrants", label: "Warrants", component: Step3Warrants },
  { id: "observables", label: "Observables", component: Step4Observables },
  { id: "evidence", label: "Evidence Rules", component: Step5EvidenceRules },
  { id: "statistical", label: "Statistical Model", component: Step6StatisticalModel },
  { id: "audit", label: "Inferential Audit", component: Step7InferentialAudit },
  { id: "confirm", label: "Confirmation", component: Step8Confirmation },
];

/* ==========================================================
   EVIDENCE WIZARD (LIFECYCLE CONTROL CENTER)
========================================================== */
export default function EvidenceWizard({ onCancel, onSaved, readOnly = false }) {
  const { draftModel, setDraftModel } = useEvidenceWizardContext();
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();

  const isLocked = draftModel.locked || readOnly;

  /* --------------------------------------------------
     Wizard State
  -------------------------------------------------- */
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepValidity, setStepValidity] = useState(
    Array(STEPS.length).fill(false)
  );

  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(null);
  const [confirmationChecked, setConfirmationChecked] = useState(false);

  const CurrentStepComponent = STEPS[currentStepIndex].component;
  const isConfirmationStep = currentStepIndex === STEPS.length - 1;

  /* ==========================================================
     DRAFT DIRTY TRACKING
  ========================================================== */

  // If model already persisted (editing existing draft), treat its
  // loaded state as the "last saved" baseline.
  useEffect(() => {
    if (draftModel?.id && lastSavedSnapshot === null) {
      setLastSavedSnapshot(JSON.stringify(draftModel));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftModel?.id]);

  const isDirty = useMemo(() => {
    if (lastSavedSnapshot === null) return true; // brand-new, never saved
    return JSON.stringify(draftModel) !== lastSavedSnapshot;
  }, [draftModel, lastSavedSnapshot]);

  // Steps 3, 4, and 7 list this callback in their effect dependencies.
  // A fresh array on every report re-renders the wizard, mints a new
  // callback, and runs the effect again. React then stops the step
  // with error 185. Keep the previous array when the flag is unchanged.
  const handleValidityChange = useCallback((isValid) => {
    setStepValidity((prev) => {
      if (prev[currentStepIndex] === isValid) return prev;
      const updated = [...prev];
      updated[currentStepIndex] = isValid;
      return updated;
    });
  }, [currentStepIndex]);

  /* ==========================================================
     SAVE DRAFT
     Silent by design -- there is no manual "Save Draft" button
     anymore. Runs automatically whenever the user advances past
     step 1 (see goNext) or confirms with unsaved changes. Returns
     true/false so callers can decide whether to proceed.
  ========================================================== */
  const saveDraft = async () => {
    try {
      const method = draftModel.id ? "PUT" : "POST";
      const url = draftModel.id
        ? `/api/evidenceModels/${draftModel.id}`
        : "/api/evidenceModels";

      const data = await apiFetch(url, {
        method,
        body: JSON.stringify(draftModel),
      }, auth);

      setDraftModel(data);
      setLastSavedSnapshot(JSON.stringify(data));

      queryClient.invalidateQueries({ queryKey: evidenceModelsKey });
      if (data.id) {
        queryClient.invalidateQueries({ queryKey: evidenceModelKey(data.id) });
      }

      return true;
    } catch (err) {
      console.error("Save error", err);
      toast.error(apiErrorMessage(err, "Failed to save Evidence Model."));
      return false;
    }
  };

  /* ==========================================================
     SAVE (FINAL STEP, DRAFT ONLY) -- promotes draft -> reviewed and
     exits. The model list's Edit button becomes Review from here,
     and only that reopened wizard offers Lock & Confirm.
  ========================================================== */
  const handleSaveAndReview = async () => {
    if (!draftModel.id) return;

    try {
      const data = await apiFetch(
        `/api/evidenceModels/${draftModel.id}/lifecycle`,
        { method: "PATCH", body: JSON.stringify({ nextStatus: "reviewed" }) },
        auth
      );

      queryClient.invalidateQueries({ queryKey: evidenceModelsKey });
      queryClient.invalidateQueries({ queryKey: evidenceModelKey(draftModel.id) });

      toast.success("Evidence Model saved and ready for review.");
      onSaved?.(data.model || data);
    } catch (err) {
      console.error("Save error", err);
      toast.error(apiErrorMessage(err, "Failed to save Evidence Model."));
    }
  };

  /* ==========================================================
     RETURN TO DRAFT (REVIEWER REJECTION)
     The reviewed -> draft transition the lifecycle matrix has always
     declared, with no control anywhere in the product to reach it.
  ========================================================== */
  const handleReturnToDraft = async () => {
    if (!draftModel.id) return;

    try {
      const data = await apiFetch(
        `/api/evidenceModels/${draftModel.id}/lifecycle`,
        { method: "PATCH", body: JSON.stringify({ nextStatus: "draft" }) },
        auth
      );

      setDraftModel(data);
      setLastSavedSnapshot(JSON.stringify(data));

      queryClient.invalidateQueries({ queryKey: evidenceModelsKey });
      queryClient.invalidateQueries({ queryKey: evidenceModelKey(draftModel.id) });

      toast.success("Evidence Model returned to draft.");
    } catch (err) {
      console.error("Return to draft error", err);
      toast.error(apiErrorMessage(err, "Could not return model to draft."));
    }
  };

  /* ==========================================================
     CONFIRM (EXIT WIZARD)
  ========================================================== */
  const handleConfirm = async () => {
    if (!draftModel.id) return;

    try {
      const data = await apiFetch(
        `/api/evidenceModels/${draftModel.id}/confirm`,
        { method: "POST" },
        auth
      );

      queryClient.invalidateQueries({ queryKey: evidenceModelsKey });
      queryClient.invalidateQueries({ queryKey: evidenceModelKey(draftModel.id) });

      onSaved?.(data); // exit wizard only on confirm
    } catch (err) {
      console.error("Confirm error", err);
      toast.error(apiErrorMessage(err, "Confirmation failed."));
    }
  };

  /* ==========================================================
     NAVIGATION
     "Crosses step 1" once currentStepIndex > 0 -- the very first
     Next click (leaving step 1) just advances; every Next after
     that silently saves the draft first.

     Confirmed/locked models are read-only -- paging through a locked
     model's steps to review it has nothing to persist, and attempting
     to anyway hits the backend's "Model is confirmed" guard (409),
     which silently blocked Next from ever advancing past step 1 for a
     locked model. Skip the auto-save entirely when locked.

     Read-only is NOT the same as immobile, though: a locked model must
     still be walkable end to end, which is the entire purpose of View
     mode. Navigation therefore ignores `stepValidity` when locked --
     those flags are only ever set by a step's own onValidityChange
     while that step is MOUNTED, so on a model you are merely reading
     they sit at their initial `false` and would pin you to step 1
     forever, for reasons that have nothing to do with the model.
  ========================================================== */
  const goToStep = (index) => {
    setCurrentStepIndex(index);
  };

  const goNext = async () => {
    if (!isLocked && !stepValidity[currentStepIndex]) return;

    if (currentStepIndex > 0 && !isLocked) {
      const ok = await saveDraft();
      if (!ok) return;
    }

    setCurrentStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  };

  // Confirmation does not read stepValidity for the audit step. That
  // flag is set only while Inferential Audit is mounted, so jumping
  // here (or reopening a reviewed model on this step) left Lock
  // disabled on a model the audit would already pass. The audit below
  // is the same function Step 7 renders, run on the current draft.
  //
  // The acknowledgment checkbox gates locking, not saving: a draft's
  // Save on this step asks only for a structurally complete model.
  // Lock & Confirm (review mode) keeps the acknowledgment requirement.
  const confirmationAudit = useMemo(
    () =>
      isConfirmationStep
        ? computeEvidenceInferentialAudit({ draftModel })
        : null,
    [isConfirmationStep, draftModel]
  );
  const isReviewMode = draftModel.status === "reviewed" && !isLocked;
  const canProceed = isConfirmationStep
    ? confirmationAudit.isValid && (!isReviewMode || confirmationChecked)
    : stepValidity[currentStepIndex];
  const blockingReason = !isConfirmationStep || canProceed
    ? undefined
    : !confirmationAudit.isValid
      ? confirmationAudit.errors[0] || "Inferential audit has not passed."
      : "Acknowledge the confirmation notice before locking.";

  /* ==========================================================
     RENDER
  ========================================================== */
  return (
    <div className="flex min-h-screen bg-slate-100">
      <WizardSidebar
        steps={STEPS}
        currentStepIndex={currentStepIndex}
        onStepClick={goToStep}
        locked={isLocked}
        status={draftModel.status}
        title="Evidence Model Wizard"
        brandInitial="E"
        footerLabel="Evidence Layer"
      />

      <WizardStepContainer
        step={currentStepIndex + 1}
        totalSteps={STEPS.length}
        onNext={goNext}
        onBack={goBack}
        onCancel={onCancel}
        canProceed={canProceed}
        isLast={isConfirmationStep}
        locked={isLocked}
        status={draftModel.status}
        isDirty={isDirty}
        onSaveDraft={saveDraft}
        onSaveAndReview={handleSaveAndReview}
        onConfirm={handleConfirm}
        onReturnToDraft={handleReturnToDraft}
        blockingReason={blockingReason}
        modelLabel="Evidence Model"
        adaptiveCancelLabel
      >
        <ErrorBoundary
          resetKey={currentStepIndex}
          label={STEPS[currentStepIndex]?.label}
        >
          <CurrentStepComponent
            locked={isLocked}
            onValidityChange={handleValidityChange}
            {...(isConfirmationStep
              ? { confirmationChecked, setConfirmationChecked }
              : {})}
          />
        </ErrorBoundary>
      </WizardStepContainer>
    </div>
  );
}
