// WizardStepContainer.jsx
// ------------------------------------------------------------
// Item Wizard — step router + convention C adapter onto the shared
// `src/components/wizard/WizardStepContainer` shell (D112).
//
// This file still owns step routing (Step1Instantiation..Step8Review)
// and the persistence / lifecycle calls from context. Chrome (nav,
// progress, Next gating, discard modal, named blockers banner) comes
// from the shared shell so CM/EM/AM keep convention A and Task Model
// keeps convention B. Item's extra lifecycle transitions (reject,
// activate, suspend, reactivate, archive, clone) stay in the toolbar
// slot rather than replacing Save-for-Review / Lock-&-Confirm — those
// A/B promote buttons are hidden because Item confirm lives on Step 8.
// ------------------------------------------------------------

import { useState } from "react";
import { useItemWizard } from "./ItemWizardContext";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import Modal from "@/components/ui/Modal";
import WizardStepContainer from "@/components/wizard/WizardStepContainer";
import {
    itemLockedNotice,
    itemStepBlockersCopy,
} from "./itemWizardShellContract";

import Step1Instantiation from "./steps/Step1Instantiation";
import Step2Blueprint from "./steps/Step2Blueprint";
import Step3Stimulus from "./steps/Step3Stimulus";
import Step4Interaction from "./steps/Step4Interaction";
import Step5Scoring from "./steps/Step5Scoring";
import Step6Metadata from "./steps/Step6Metadata";
import Step7Operations from "./steps/Step7Operations";
import Step8Review from "./steps/Step8Review";

// MIRROR: every key in itemConstants.ITEM_WIZARD_STEPS needs a case here.
const STEP_COMPONENTS = {
    instantiation: Step1Instantiation,
    blueprint: Step2Blueprint,
    stimulus: Step3Stimulus,
    interaction: Step4Interaction,
    scoring: Step5Scoring,
    metadata: Step6Metadata,
    operations: Step7Operations,
    review: Step8Review,
};

export const ITEM_WIZARD_RENDERED_STEP_KEYS = Object.keys(STEP_COMPONENTS);

const btn = (tone) =>
    `inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none ${tone}`;

function ItemLifecycleToolbar({
    busy,
    canReject,
    canConfirm,
    canActivate,
    canSuspend,
    canReactivate,
    canArchive,
    canClone,
    isReady,
    blocking,
    steps,
    goToStep,
    runTransition,
    setConfirmTransition,
    cloneItem,
}) {
    return (
        <div data-testid="wizard-lifecycle-toolbar" className="flex flex-wrap items-center gap-2">
            {canReject && (
                <button
                    type="button"
                    onClick={() => runTransition("draft")}
                    disabled={busy}
                    className={btn(
                        "bg-white text-amber-700 border border-amber-300 hover:bg-amber-50"
                    )}
                >
                    Send back to draft
                </button>
            )}

            {canConfirm && (
                <button
                    type="button"
                    onClick={() => goToStep(steps.length - 1)}
                    disabled={busy}
                    className={btn("bg-blue-600 text-white hover:bg-blue-700")}
                    title={
                        isReady && blocking.length === 0
                            ? "Review and confirm"
                            : "Outstanding checks — the review step lists them"
                    }
                >
                    Review & confirm
                </button>
            )}

            {canActivate && (
                <button
                    type="button"
                    onClick={() => runTransition("operational")}
                    disabled={busy}
                    className={btn("bg-emerald-600 text-white hover:bg-emerald-700")}
                >
                    Activate
                </button>
            )}

            {canSuspend && (
                <button
                    type="button"
                    onClick={() => setConfirmTransition("suspended")}
                    disabled={busy}
                    className={btn("bg-orange-600 text-white hover:bg-orange-700")}
                >
                    Suspend
                </button>
            )}

            {canReactivate && (
                <button
                    type="button"
                    onClick={() => runTransition("operational")}
                    disabled={busy}
                    className={btn("bg-emerald-600 text-white hover:bg-emerald-700")}
                >
                    Reactivate
                </button>
            )}

            {canArchive && (
                <button
                    type="button"
                    onClick={() => setConfirmTransition("archived")}
                    disabled={busy}
                    className={btn(
                        "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
                    )}
                >
                    Archive
                </button>
            )}

            {canClone && (
                <button
                    type="button"
                    onClick={cloneItem}
                    disabled={busy}
                    className={btn(
                        "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
                    )}
                >
                    Clone
                </button>
            )}
        </div>
    );
}

export default function ItemWizardStepContainer({ onClose }) {
    const {
        item,
        currentStep,
        currentStepKey,
        steps,
        nextStep,
        prevStep,
        goToStep,
        isStepValid,
        stepBlockers,
        isDirty,
        saveDraft,
        transitionLifecycle,
        cloneItem,
        canEdit,
        isLocked,
        canConfirm,
        canActivate,
        canSuspend,
        canReactivate,
        canArchive,
        canReject,
        canClone,
        isReady,
        blocking,
    } = useItemWizard();

    const [busy, setBusy] = useState(false);
    const [confirmTransition, setConfirmTransition] = useState(null);

    const isLastStep = currentStep === steps.length - 1;
    const status = item.status || "draft";
    const StepComponent = STEP_COMPONENTS[currentStepKey];
    const blockersCopy = itemStepBlockersCopy(stepBlockers);

    async function handleNext() {
        if (busy) return;
        setBusy(true);
        try {
            await nextStep();
        } finally {
            setBusy(false);
        }
    }

    /* Every lifecycle action goes through one function, so the auto-save,
       the dirty check and the error handling cannot differ between them —
       which is exactly how the three old confirmation paths came to have
       three different preconditions. */
    async function runTransition(nextStatus, { force = false } = {}) {
        if (busy) return;
        setBusy(true);
        try {
            if (isDirty && canEdit) {
                const saved = await saveDraft();
                if (!saved.success) return;
            }
            const result = await transitionLifecycle(nextStatus, { force });
            if (result.success && nextStatus === "reviewed") onClose?.();
        } finally {
            setBusy(false);
            setConfirmTransition(null);
        }
    }

    return (
        <>
            <WizardStepContainer
                step={currentStep + 1}
                totalSteps={steps.length}
                onNext={handleNext}
                onBack={prevStep}
                onCancel={onClose}
                canProceed={isStepValid}
                isLast={isLastStep}
                locked={isLocked}
                status={status}
                isDirty={isDirty}
                modelLabel="Item"
                cancelLabel="Close"
                hidePromoteActions
                editable={canEdit}
                stepTitle={steps[currentStep]?.label}
                showProgressPercent
                blockersBanner={
                    !isStepValid && stepBlockers.length > 0 ? blockersCopy : null
                }
                blockingReason={
                    !isStepValid && blockersCopy ? blockersCopy : undefined
                }
                lockedNotice={itemLockedNotice(status)}
                toolbarActions={
                    <ItemLifecycleToolbar
                        busy={busy}
                        canReject={canReject}
                        canConfirm={canConfirm}
                        canActivate={canActivate}
                        canSuspend={canSuspend}
                        canReactivate={canReactivate}
                        canArchive={canArchive}
                        canClone={canClone}
                        isReady={isReady}
                        blocking={blocking}
                        steps={steps}
                        goToStep={goToStep}
                        runTransition={runTransition}
                        setConfirmTransition={setConfirmTransition}
                        cloneItem={cloneItem}
                    />
                }
            >
                <ErrorBoundary
                    resetKey={currentStepKey}
                    label={steps[currentStep]?.label}
                >
                    {StepComponent ? <StepComponent /> : null}
                </ErrorBoundary>
            </WizardStepContainer>

            <Modal
                isOpen={!!confirmTransition}
                onClose={() => setConfirmTransition(null)}
                onConfirm={() => runTransition(confirmTransition)}
                title={
                    confirmTransition === "archived"
                        ? "Archive this item?"
                        : "Suspend this item?"
                }
                message={
                    confirmTransition === "archived"
                        ? "Archiving retires the item permanently. It can never be cloned or returned to service, and any Task Model relying on it for activation loses that support."
                        : "Suspending removes the item from delivery. It can be reactivated later, subject to its reactivation ceiling."
                }
                cancelLabel="Cancel"
                confirmLabel={
                    busy
                        ? "Working…"
                        : confirmTransition === "archived"
                          ? "Archive"
                          : "Suspend"
                }
                confirmClass="bg-slate-900 hover:bg-slate-800 text-white"
            >
                <p className="text-xs text-slate-500">
                    If a live session depends on this item the server will refuse.
                    Forcing past that closes those sessions and is an admin action.
                </p>
            </Modal>
        </>
    );
}
