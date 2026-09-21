// src/components/presentationModels/PresentationModelWizard/PresentationModelWizard.jsx
// D113 — 5-step Presentation Model wizard on the shared shell,
// convention A (CM/EM/AM): onStepClick always fires; parent gates;
// cursor ticks; HTML-disabled Next; onSaveAndReview / onConfirm.
//
//   1. Identity
//   2. Layout
//   3. Conditional display
//   4. Accessibility
//   5. Review

import React from "react";
import toast from "react-hot-toast";
import { usePresentationModelWizard } from "./PresentationModelWizardContext";
import WizardSidebar from "@/components/wizard/WizardSidebar";
import WizardStepContainer from "@/components/wizard/WizardStepContainer";
import ErrorBoundary from "@/components/ui/ErrorBoundary";

import Step1Identity from "./steps/Step1Identity";
import Step2Layout from "./steps/Step2Layout";
import Step3ConditionalDisplay from "./steps/Step3ConditionalDisplay";
import Step4Accessibility from "./steps/Step4Accessibility";
import Step5Review from "./steps/Step5Review";

export const STEP_CONFIG = [
  { id: 1, label: "Identity" },
  { id: 2, label: "Layout" },
  { id: 3, label: "Conditional display" },
  { id: 4, label: "Accessibility" },
  { id: 5, label: "Review" },
];

export default function PresentationModelWizard({ onCancel }) {
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
  } = usePresentationModelWizard();

  async function goNext() {
    if (!draft?.locked && !canProceed(currentStep)) {
      toast.error("Complete required fields before proceeding.");
      return;
    }

    if (currentStep < STEP_CONFIG.length) {
      const canPersist = currentStep >= 1 && Boolean(draft?.name && draft?.taskModelId);
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
        return <Step2Layout />;
      case 3:
        return <Step3ConditionalDisplay />;
      case 4:
        return <Step4Accessibility />;
      case 5:
        return <Step5Review />;
      default:
        return null;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-slate-600">
        Loading Presentation Model...
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
        title="Presentation Model Wizard"
        brandInitial="P"
        footerLabel="Presentation Layer"
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
          modelLabel="Presentation Model"
        >
          <ErrorBoundary resetKey={currentStep} label={STEP_CONFIG[currentStep - 1]?.label}>
            {renderStep()}
          </ErrorBoundary>
        </WizardStepContainer>
      </div>
    </div>
  );
}
