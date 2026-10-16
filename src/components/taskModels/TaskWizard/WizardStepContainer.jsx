// WizardStepContainer.jsx
// ------------------------------------------------------------
// Task Model Wizard — step router + convention B adapter onto the
// shared `src/components/wizard/WizardStepContainer` shell (D111).
//
// This file still owns step routing (Step1Identity..Step8Review) and
// the persistence/promote calls from context. Chrome (nav, progress,
// lifecycle buttons, discard modal, named blocking-reason toast) comes
// from the shared shell so CM/EM/AM keep convention A unchanged.
// ------------------------------------------------------------

import { useTaskModelWizard } from "./TaskModelWizardContext";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import WizardStepContainer from "@/components/wizard/WizardStepContainer";
import {
    taskModelBlockingReason,
    taskModelLockedNotice,
} from "./taskWizardShellContract";

import Step1Identity from "./steps/Step1Identity";
import Step2EvidenceBinding from "./steps/Step2EvidenceBinding";
import Step3Observables from "./steps/Step3Observables";
import Step4TaskStructure from "./steps/Step4TaskStructure";
import Step5Blueprint from "./steps/Step5Blueprint";
import StepVariables from "./steps/StepVariables";
import Step6ItemMapping from "./steps/Step6ItemMapping";
import Step7Fairness from "./steps/Step7Fairness";
import Step8Review from "./steps/Step8Review";

export default function TaskModelWizardStepContainer({ onCancel }) {
    const {
        draft,
        setDraft,

        STEPS,
        currentStep,
        canGoNext,
        goNext,
        goBack,

        linkableEvidenceModels,
        items,
        observationLookup,

        isEditable,
        lifecycleStatus,

        isDirty,
        readiness,
        isStructurallyComplete,

        handleSaveDraft,
        handlePromote,
    } = useTaskModelWizard();

    const stepKey = STEPS[currentStep];
    const isLastStep = stepKey === "review";
    const disabled = !isEditable;
    const blockingReason = taskModelBlockingReason(readiness);

    const renderStep = () => {
        switch (stepKey) {
            case "identity":
                return <Step1Identity draft={draft} setDraft={setDraft} disabled={disabled} />;

            case "evidence":
                return (
                    <Step2EvidenceBinding
                        draft={draft}
                        setDraft={setDraft}
                        evidenceModels={linkableEvidenceModels}
                        disabled={disabled}
                    />
                );

            case "observables":
                return (
                    <Step3Observables
                        draft={draft}
                        setDraft={setDraft}
                        evidenceModels={linkableEvidenceModels}
                        disabled={disabled}
                    />
                );

            case "structure":
                return (
                    <Step4TaskStructure
                        draft={draft}
                        setDraft={setDraft}
                        disabled={disabled}
                        observationLookup={observationLookup}
                        evidenceModels={linkableEvidenceModels}
                    />
                );

            case "blueprint":
                return (
                    <Step5Blueprint
                        draft={draft}
                        setDraft={setDraft}
                        disabled={disabled}
                        evidenceModels={linkableEvidenceModels}
                    />
                );

            case "variables":
                return (
                    <StepVariables
                        draft={draft}
                        setDraft={setDraft}
                        disabled={disabled}
                    />
                );

            case "itemMapping":
                return (
                    <Step6ItemMapping
                        draft={draft}
                        setDraft={setDraft}
                        disabled={disabled}
                        availableItems={items}
                        observationLookup={observationLookup}
                    />
                );

            case "fairness":
                return (
                    <Step7Fairness
                        draft={draft}
                        setDraft={setDraft}
                        disabled={disabled}
                        evidenceModels={linkableEvidenceModels}
                    />
                );

            case "review":
                return (
                    <Step8Review
                        draft={draft}
                        setDraft={setDraft}
                        disabled={disabled}
                        evidenceModels={linkableEvidenceModels}
                        observationLookup={observationLookup}
                        items={items}
                    />
                );

            default:
                return null;
        }
    };

    /* ------------------------------------------------------------
     NEXT — silently saves the draft before advancing, once the wizard
     has crossed step 1.

     A Task Model that is no longer editable has nothing to persist, and
     attempting to save one hits the backend's lifecycle guard, which
     used to block Next from ever advancing past step 1 in View mode.

     Named blocking-reason toast lives in the shared shell (toastOnBlock)
     so a gated click names the failing check instead of a generic line.
    ------------------------------------------------------------ */
    const handleNext = async () => {
        if (currentStep > 0 && isEditable) {
            const saved = await handleSaveDraft();
            if (!saved) return;
        }
        goNext();
    };

    /* Save-if-dirty, then promote. Completeness is gated by canProceed
       on the shared Save / Lock & Confirm buttons (and toastOnBlock);
       Return to draft deliberately skips that gate so a reviewer can
       send back an incomplete model. */
    const saveIfDirty = async () => {
        if (!isDirty) return true;
        const saved = await handleSaveDraft();
        return saved ? true : false;
    };

    return (
        <WizardStepContainer
            step={currentStep + 1}
            totalSteps={STEPS.length}
            onNext={handleNext}
            onBack={goBack}
            onCancel={onCancel}
            canProceed={isLastStep ? isStructurallyComplete : canGoNext}
            isLast={isLastStep}
            locked={!isEditable}
            status={lifecycleStatus}
            isDirty={isDirty}
            onSaveDraft={saveIfDirty}
            onSaveAndReview={() => handlePromote("reviewed")}
            onConfirm={() => handlePromote("confirmed")}
            onReturnToDraft={async () => {
                const ok = await saveIfDirty();
                if (ok === false) return;
                await handlePromote("draft");
            }}
            modelLabel="Task Model"
            blockingReason={blockingReason}
            toastOnBlock
            lockedNotice={taskModelLockedNotice(lifecycleStatus)}
        >
            <ErrorBoundary resetKey={stepKey} label={stepKey}>
                {renderStep()}
            </ErrorBoundary>
        </WizardStepContainer>
    );
}
