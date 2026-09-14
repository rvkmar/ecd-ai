// WizardStepContainer.jsx
// ------------------------------------------------------------
// Task Model Wizard — step chrome and lifecycle actions
// ------------------------------------------------------------
// Same shell as competencies/CompetencyWizard/WizardStepContainer.jsx and
// evidences/EvidenceWizard/WizardStepContainer.jsx so all four model
// wizards behave identically:
//  • Nav bar (Cancel, step indicator + progress rail, Back/Next/lifecycle
//    action) pinned to the TOP of the step content.
//  • No manual "Save Draft" button — Next silently persists the draft once
//    the wizard has crossed step 1; the review step's lifecycle buttons do
//    the same if anything changed since the last auto-save.
//  • Cancel governance with unsaved-change protection.
//
// This container owns the lifecycle buttons; no step renders its own. It
// also owns the *blocking reason* shown when Next is disabled — previously
// a bare "Resolve required fields before proceeding" toast that never said
// which field, on a step where the failing rule (weights summing to 1) was
// not even visible.
// ------------------------------------------------------------

import { useState } from "react";
import toast from "react-hot-toast";
import { ChevronLeft, ChevronRight, Lock, X } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { useTaskModelWizard } from "./TaskModelWizardContext";
import ErrorBoundary from "@/components/ui/ErrorBoundary";

import Step1Identity from "./steps/Step1Identity";
import Step2EvidenceBinding from "./steps/Step2EvidenceBinding";
import Step3Observables from "./steps/Step3Observables";
import Step4TaskStructure from "./steps/Step4TaskStructure";
import Step5Blueprint from "./steps/Step5Blueprint";
import Step6ItemMapping from "./steps/Step6ItemMapping";
import Step7Fairness from "./steps/Step7Fairness";
import Step8Review from "./steps/Step8Review";

export default function WizardStepContainer({ onCancel }) {
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
        isReviewMode,
        lifecycleStatus,

        isDirty,
        readiness,
        isStructurallyComplete,

        handleSaveDraft,
        handlePromote,
    } = useTaskModelWizard();

    const [saving, setSaving] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);

    const stepKey = STEPS[currentStep];
    const isLastStep = stepKey === "review";
    const progressPercent = Math.min(
        100,
        Math.round(((currentStep + 1) / STEPS.length) * 100)
    );

    const disabled = !isEditable;

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
                return <Step7Fairness draft={draft} setDraft={setDraft} disabled={disabled} />;

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
     Name the failing check instead of asserting one exists. The step
     rail and the readiness checklist read from the same source, so
     these strings can never drift from what the review step shows.
    ------------------------------------------------------------ */
    const blockingReason = () => {
        const failed = readiness.checks.filter((c) => !c.valid);
        if (failed.length === 0) return "Resolve required fields before proceeding.";
        return failed[0].detail;
    };

    /* ------------------------------------------------------------
     NEXT — silently saves the draft before advancing, once the wizard
     has crossed step 1.

     A Task Model that is no longer editable has nothing to persist, and
     attempting to save one hits the backend's lifecycle guard, which
     used to block Next from ever advancing past step 1 in View mode.
    ------------------------------------------------------------ */
    const handleNext = async () => {
        if (isEditable && !canGoNext) {
            toast.error(blockingReason());
            return;
        }

        if (saving) return;

        try {
            setSaving(true);

            if (currentStep > 0 && isEditable) {
                const saved = await handleSaveDraft();
                if (!saved) return;
            }

            goNext();
        } finally {
            setSaving(false);
        }
    };

    /* ------------------------------------------------------------
     LIFECYCLE PROMOTION (review step only)
    ------------------------------------------------------------ */

    const promote = async (nextStatus) => {
        if (saving) return;

        if (!isStructurallyComplete) {
            toast.error(blockingReason());
            return;
        }

        try {
            setSaving(true);
            if (isDirty) {
                const saved = await handleSaveDraft();
                if (!saved) return;
            }
            await handlePromote(nextStatus);
        } finally {
            setSaving(false);
        }
    };

    /* ------------------------------------------------------------
     RETURN TO DRAFT -- reviewer rejection. Deliberately skips the
     isStructurallyComplete gate above: that gate exists to keep a broken
     model from being promoted forward, and would make it impossible to
     reject exactly the incomplete/wrong models a reviewer most needs to
     send back.
    ------------------------------------------------------------ */
    const returnToDraft = async () => {
        if (saving) return;

        try {
            setSaving(true);
            if (isDirty) {
                const saved = await handleSaveDraft();
                if (!saved) return;
            }
            await handlePromote("draft");
        } finally {
            setSaving(false);
        }
    };

    const handleCancelClick = () => {
        if (isEditable && isDirty) {
            setShowCancelModal(true);
        } else {
            onCancel?.();
        }
    };

    const primaryButtonClasses = (isDisabled, tone = "bg-slate-900 hover:bg-slate-800") =>
        `inline-flex items-center gap-1.5 rounded-md px-5 py-2 text-sm font-semibold text-white shadow-sm transition ${isDisabled
            ? "cursor-not-allowed bg-slate-200 text-slate-400 shadow-none"
            : tone
        }`;

    return (
        <div className="flex min-w-0 flex-1 flex-col">
            {/* Top Navigation Bar */}
            <div className="sticky top-0 z-20 border-b border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-4 px-8 py-4">
                    <button
                        onClick={handleCancelClick}
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                    >
                        <X size={15} strokeWidth={2.25} />
                        Cancel
                    </button>

                    <div className="flex flex-1 flex-col items-center px-4">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            Step {currentStep + 1} of {STEPS.length}
                        </span>
                        <div className="mt-1.5 h-1 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
                            <div
                                className="h-full rounded-full bg-slate-900 transition-all duration-300"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                        {saving && (
                            <span className="mr-0.5 text-xs font-medium text-slate-400">
                                Saving…
                            </span>
                        )}

                        {currentStep > 0 && (
                            <button
                                onClick={goBack}
                                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                            >
                                <ChevronLeft size={15} strokeWidth={2.25} />
                                Back
                            </button>
                        )}

                        {/* Next stays available on a locked model so View mode can
                            page through it; the completeness gate applies only
                            while editing. */}
                        {!isLastStep && (
                            <button
                                onClick={handleNext}
                                disabled={saving || (isEditable && !canGoNext)}
                                title={
                                    isEditable && !canGoNext ? blockingReason() : undefined
                                }
                                className={primaryButtonClasses(
                                    saving || (isEditable && !canGoNext)
                                )}
                            >
                                Next
                                <ChevronRight size={15} strokeWidth={2.25} />
                            </button>
                        )}

                        {isLastStep && lifecycleStatus === "draft" && (
                            <button
                                onClick={() => promote("reviewed")}
                                disabled={saving || !isStructurallyComplete}
                                title={
                                    !isStructurallyComplete ? blockingReason() : undefined
                                }
                                className={primaryButtonClasses(
                                    saving || !isStructurallyComplete,
                                    "bg-emerald-600 hover:bg-emerald-700"
                                )}
                            >
                                {saving ? "Saving…" : "Save for Review"}
                            </button>
                        )}

                        {isLastStep && isReviewMode && (
                            <button
                                onClick={returnToDraft}
                                disabled={saving}
                                className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-700 shadow-sm transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:text-slate-400"
                            >
                                Return to draft
                            </button>
                        )}

                        {isLastStep && isReviewMode && (
                            <button
                                onClick={() => promote("confirmed")}
                                disabled={saving || !isStructurallyComplete}
                                title={
                                    !isStructurallyComplete ? blockingReason() : undefined
                                }
                                className={primaryButtonClasses(
                                    saving || !isStructurallyComplete,
                                    "bg-blue-600 hover:bg-blue-700"
                                )}
                            >
                                {saving ? "Processing…" : "Lock & Confirm"}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Step Content — grows with content; the page scrolls, the
                sidebar and nav bar stay pinned via `sticky`. */}
            <div className="flex-1 px-8 py-8">
                <div className="mx-auto max-w-5xl">
                    <ErrorBoundary resetKey={stepKey} label={stepKey}>
                        {renderStep()}
                    </ErrorBoundary>

                    {!isEditable && (
                        <div className="mt-8 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm text-emerald-800">
                            <Lock size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
                            <span>
                                This Task Model is {lifecycleStatus} and no longer editable.
                                Structural changes require cloning to a new version.
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <Modal
                isOpen={showCancelModal}
                onClose={() => setShowCancelModal(false)}
                onConfirm={() => {
                    setShowCancelModal(false);
                    onCancel?.();
                }}
                title="Discard changes?"
                message="You have unsaved changes on this step. Leaving now will discard them."
                cancelLabel="Continue Editing"
                confirmLabel="Discard & Exit"
                confirmClass="bg-red-600 hover:bg-red-700 text-white"
            />
        </div>
    );
}
