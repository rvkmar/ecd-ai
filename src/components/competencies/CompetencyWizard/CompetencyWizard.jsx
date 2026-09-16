// CompetencyWizard/CompetencyWizard.jsx
// 🧠 Extreme Strict ECD — Competency Wizard Controller (Enterprise Refactor)
// Clean orchestration layer
// - No routing logic
// - No cancel modal logic (handled by WizardStepContainer)
// - No alert()
// - Dirty tracking integration
// - Lifecycle-aligned with strict ECD governance

import React from "react";
import toast from "react-hot-toast";
import { useCompetencyWizard } from "./CompetencyWizardContext";
import WizardSidebar from "@/components/wizard/WizardSidebar";
import WizardStepContainer from "@/components/wizard/WizardStepContainer";
import ErrorBoundary from "@/components/ui/ErrorBoundary";

// Steps
import Step1ModelIdentity from "./steps/Step1ModelIdentity";
import Step2MeasurementIntent from "./steps/Step2MeasurementIntent";
import Step3ConstructFramework from "./steps/Step3ConstructFramework";
import Step4LatentVariables from "./steps/Step4LatentVariables";
import Step5StateSpaceScale from "./steps/Step5StateSpaceScale";
import Step6StructuralRelationships from "./steps/Step6StructuralRelationships";
import Step7DomainClassification from "./steps/Step7DomainClassification";
import Step8StructuralAudit from "./steps/Step8StructuralAudit";
import Step9Confirmation from "./steps/Step9Confirmation";

const STEP_CONFIG = [
    { id: 1, label: "Model Identity" },
    { id: 2, label: "Measurement Intent" },
    { id: 3, label: "Construct Framework" },
    { id: 4, label: "Latent Variables" },
    { id: 5, label: "State Space / Scale" },
    { id: 6, label: "Structural Relationships" },
    { id: 7, label: "Domain Classification" },
    { id: 8, label: "Structural Audit" },
    { id: 9, label: "Confirmation" },
];

export default function CompetencyWizard({ onCancel }) {
    const {
        model,
        currentStep,
        setCurrentStep,
        loading,
        canProceed,
        saveDraft,
        saveAndReview,
        confirmModel,
        returnToDraft,
        isDirty,
    } = useCompetencyWizard();

    /* =====================================================
       🔹 STEP NAVIGATION
       No manual "Save Draft" button anymore -- once the draft has
       crossed step 1, every "Next" click silently persists it first
       (saveDraft() is silent: no loading/success toast, just a
       blocking error toast + stay put if the save fails). Step 1
       alone isn't enough to save (Step 2's Measurement Intent is
       required by the backend), so the very first Next click just
       advances; auto-save kicks in from the second Next onward.

       Confirmed/locked models are read-only, though -- there is
       nothing to persist while just paging through a locked model's
       steps to review it, and attempting to anyway hits the backend's
       "Confirmed model cannot be modified" guard (409), which
       silently blocked Next from ever advancing past step 1 for a
       locked model. Skip the auto-save entirely when locked.
    ===================================================== */

    async function goNext() {
        /* A locked model is read-only, not immobile -- walking a confirmed
           model end to end is the whole purpose of View mode, and the
           required-field gate below is meaningless there (nothing can be
           edited, so nothing can be completed). Only editable models are
           held to it. */
        if (!model?.locked && !canProceed(currentStep)) {
            toast.error("Complete required fields before proceeding.");
            return;
        }

        if (currentStep < STEP_CONFIG.length) {
            if (currentStep > 1 && !model?.locked) {
                const ok = await saveDraft();
                if (!ok) return;
            }
            setCurrentStep(currentStep + 1);
        }
    }

    function goBack() {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
        }
    }

    /* =====================================================
       🔹 STEP RENDERER
    ===================================================== */

    function renderStep() {
        switch (currentStep) {
            case 1:
                return <Step1ModelIdentity />;
            case 2:
                return <Step2MeasurementIntent />;
            case 3:
                return <Step3ConstructFramework />;
            case 4:
                return <Step4LatentVariables />;
            case 5:
                return <Step5StateSpaceScale />;
            case 6:
                return <Step6StructuralRelationships />;
            case 7:
                return <Step7DomainClassification />;
            case 8:
                return <Step8StructuralAudit />;
            case 9:
                return <Step9Confirmation />;
            default:
                return null;
        }
    }

    /* =====================================================
       🔹 LOADING STATE
    ===================================================== */

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen text-slate-600">
                Loading Student Model...
            </div>
        );
    }

    /* =====================================================
       🔹 RENDER
    ===================================================== */

    return (
        <div className="flex min-h-screen bg-slate-100">
            {/* Sidebar */}
            <WizardSidebar
                steps={STEP_CONFIG}
                currentStepIndex={currentStep - 1}
                onStepClick={(index) => {
                    const stepId = index + 1;
                    if (stepId <= currentStep || canProceed(currentStep)) {
                        setCurrentStep(stepId);
                    }
                }}
                locked={model?.locked}
                status={model?.status}
                title="Student Model Wizard"
                brandInitial="C"
                footerLabel="Competency Layer"
            />

            {/* Main Panel -- WizardStepContainer owns its own top nav bar
                + content area, which now grows with content height instead
                of scrolling internally, so no extra padding wrapper here. */}
            <div className="flex-1 flex flex-col min-w-0">
                <WizardStepContainer
                    step={currentStep}
                    totalSteps={STEP_CONFIG.length}
                    onNext={goNext}
                    onBack={goBack}
                    onCancel={onCancel}
                    canProceed={canProceed(currentStep)}
                    isLast={currentStep === STEP_CONFIG.length}
                    locked={model?.locked}
                    status={model?.status}
                    isDirty={isDirty}
                    onSaveDraft={saveDraft}
                    onSaveAndReview={saveAndReview}
                    onConfirm={confirmModel}
                    onReturnToDraft={returnToDraft}
                    modelLabel="Student Model"
                >
                    <ErrorBoundary
                        resetKey={currentStep}
                        label={STEP_CONFIG[currentStep - 1]?.label}
                    >
                        {renderStep()}
                    </ErrorBoundary>
                </WizardStepContainer>
            </div>
        </div>
    );
}