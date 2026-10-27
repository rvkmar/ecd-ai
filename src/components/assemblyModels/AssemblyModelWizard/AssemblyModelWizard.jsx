// src/components/assemblyModels/AssemblyModelWizard/AssemblyModelWizard.jsx
// D54 (built, NOT test-verified this session).
// ------------------------------------------------------------
// 5-step Assembly Model wizard controller, following CompetencyWizard.jsx's
// shape: STEP_CONFIG + goNext/goBack + renderStep(), on the shared
// WizardSidebar/WizardStepContainer shell. Per UI spec §2.3:
//   1. Identity
//   2. Targets by SMV
//   3. Stopping rules
//   4. Selection algorithm
//   5. Review
// ------------------------------------------------------------

import React from "react";
import toast from "react-hot-toast";
import { useAssemblyModelWizard } from "./AssemblyModelWizardContext";
import WizardSidebar from "@/components/wizard/WizardSidebar";
import WizardStepContainer from "@/components/wizard/WizardStepContainer";
import ErrorBoundary from "@/components/ui/ErrorBoundary";

import Step1Identity from "./steps/Step1Identity";
import Step2Targets from "./steps/Step2Targets";
import Step3StoppingRules from "./steps/Step3StoppingRules";
import Step4Constraints from "./steps/Step4Constraints";
import Step5SelectionAlgorithm from "./steps/Step4SelectionAlgorithm";
import Step6Review from "./steps/Step5Review";

const STEP_CONFIG = [
  { id: 1, label: "Identity" },
  { id: 2, label: "Targets by SMV" },
  { id: 3, label: "Stopping Rules" },
  { id: 4, label: "Content constraints" },
  { id: 5, label: "Selection Algorithm" },
  { id: 6, label: "Review" },
];

export default function AssemblyModelWizard({ onCancel }) {
  const {
    draft,
    loading,
    currentStep,
    setCurrentStep,
    canProceed,
    saveDraft,
    saveAndReview,
    confirmModel,
    returnToDraft,
    isDirty,
  } = useAssemblyModelWizard();

  // NOT the same auto-save-on-every-Next convention CompetencyWizard.jsx
  // uses. Found live (D54 verification walk, session 11 continuation):
  // schema.js's assemblyModels validation requires selectionAlgorithm.
  // policyId UNCONDITIONALLY on every save, draft included -- unlike
  // every other entity this wizard shell serves, there is no "create the
  // record now, fill in the rest across later steps" for this one. An
  // auto-save attempted on leaving Step 2 or Step 3 (before Step 4 has
  // set a policy) was refused by the server with "selectionAlgorithm.
  // policyId is required." every time.
  //
  // So the very first persist cannot happen before Step 4 is complete.
  // Steps 1-3 only ever hold local state; the gate below is keyed on
  // whether the draft ACTUALLY has a policyId yet (not on step number),
  // so it behaves correctly however the user navigates. Once a record
  // exists -- either because this session just created it, or because an
  // existing record was reopened for edit -- saves resume on every
  // subsequent Next, matching the original convention. A locked
  // (confirmed+) record skips the save entirely -- paging through it is
  // read-only review, not editing.
  async function goNext() {
    if (!draft?.locked && !canProceed(currentStep)) {
      toast.error("Complete required fields before proceeding.");
      return;
    }

    if (currentStep < STEP_CONFIG.length) {
      const canPersist = currentStep > 1 && Boolean(draft?.selectionAlgorithm?.policyId);
      if (canPersist && !draft?.locked) {
        const ok = await saveDraft();
        if (!ok) return;
      }
      setCurrentStep(currentStep + 1);
    }
  }

  function goBack() {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  }

  function renderStep() {
    switch (currentStep) {
      case 1:
        return <Step1Identity />;
      case 2:
        return <Step2Targets />;
      case 3:
        return <Step3StoppingRules />;
      case 4:
        return <Step4Constraints />;
      case 5:
        return <Step5SelectionAlgorithm />;
      case 6:
        return <Step6Review />;
      default:
        return null;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-slate-600">
        Loading Assembly Model...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      <WizardSidebar
        steps={STEP_CONFIG}
        currentStepIndex={currentStep - 1}
        onStepClick={(index) => {
          const stepId = index + 1;
          if (stepId <= currentStep || canProceed(currentStep)) {
            setCurrentStep(stepId);
          }
        }}
        locked={draft?.locked}
        status={draft?.status}
        title="Assembly Model Wizard"
        brandInitial="A"
        footerLabel="Assembly Layer"
      />

      <div className="flex-1 flex flex-col min-w-0">
        <WizardStepContainer
          step={currentStep}
          totalSteps={STEP_CONFIG.length}
          onNext={goNext}
          onBack={goBack}
          onCancel={onCancel}
          canProceed={canProceed(currentStep)}
          isLast={currentStep === STEP_CONFIG.length}
          locked={draft?.locked}
          status={draft?.status}
          isDirty={isDirty}
          onSaveDraft={saveDraft}
          onSaveAndReview={saveAndReview}
          onConfirm={confirmModel}
          onReturnToDraft={returnToDraft}
          modelLabel="Assembly Model"
        >
          <ErrorBoundary resetKey={currentStep} label={STEP_CONFIG[currentStep - 1]?.label}>
            {renderStep()}
          </ErrorBoundary>
        </WizardStepContainer>
      </div>
    </div>
  );
}
