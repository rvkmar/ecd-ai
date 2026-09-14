// components/wizard/WizardStepContainer.jsx
// 🧩 Shared Wizard Step Container (Day 44 — Part 5.4 wizard shell)
// ------------------------------------------------------------
// Extracted from competencies/CompetencyWizard/WizardStepContainer.jsx and
// evidences/EvidenceWizard/WizardStepContainer.jsx. A Day 44 line-by-line
// diff found exactly two behavioral differences between them, both now
// parameterised below rather than hardcoded:
//   1. The Cancel button: Competency always shows the X icon + "Cancel".
//      Evidence swaps to a plain "OK" (no icon) once the model is no longer
//      editable. Preserved via `adaptiveCancelLabel`.
//   2. The locked-model notice names the model type ("This Competency
//      Model is confirmed and locked." / "This Evidence Model..."). Preserved
//      via `modelLabel`.
// Everything else -- the nav bar layout, the Next/Save/Return-to-draft/
// Lock & Confirm button set and their gating, the discard-changes modal --
// was byte-identical and is unified as-is.
//
// Task Model's step container (taskModels/TaskWizard/WizardStepContainer.jsx)
// is deliberately NOT folded in here (see WizardSidebar.jsx's header
// comment for the matching sidebar decision). It takes almost no props,
// pulling draft/step state from `useTaskModelWizard()` context instead, and
// it doubles as the step ROUTER -- it imports and switches between
// Step1Identity..Step8Review itself, where Competency/Evidence's containers
// just render externally-provided `children`. Its lifecycle button set also
// differs (a named blocking-reason toast, a `Saving…` progress label tied to
// its own save flow). Reconciling that would mean either changing Task
// Model's context/data-flow architecture as a side effect of a shell
// extraction, or growing this shared component a second, incompatible
// calling convention -- both out of scope for Day 44. See
// claude/day44-wizard-shell.md.
// ------------------------------------------------------------

import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Lock, X } from "lucide-react";
import Modal from "@/components/ui/Modal";

export default function WizardStepContainer({
    step,
    totalSteps,
    onNext,
    onBack,
    onCancel,
    canProceed,
    isLast,
    locked,
    status,
    isDirty = false,
    onSaveDraft,
    onSaveAndReview,
    onConfirm,
    onReturnToDraft,
    modelLabel = "Model",
    adaptiveCancelLabel = false,
    children,
}) {
    const [saving, setSaving] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);

    /* Two pre-confirmation states are editable, not one:
         draft     -- being authored. Last step offers Save.
         reviewed  -- saved and reopened via the list's Review button.
                      Last step offers Lock & Confirm.
       Confirmed/locked is read-only: no Next, no Save, no Confirm. */
    const isDraft = status === "draft";
    const isReviewMode = status === "reviewed" && !locked;
    const canEdit = (isDraft || isReviewMode) && !locked;
    const progressPercent = Math.min(100, Math.round((step / totalSteps) * 100));

    /* =====================================================
       🔹 NEXT (silently auto-saves via the onNext prop, which
       already wraps the caller's own draft-save)
    ===================================================== */

    async function handleNext() {
        if (saving) return;
        try {
            setSaving(true);
            await onNext?.();
        } finally {
            setSaving(false);
        }
    }

    /* =====================================================
       🔹 SAVE (final step, draft only) -- persists the draft and
       promotes it to `reviewed`, which is what turns the model
       list's Edit button into Review. Confirmation is deliberately
       a separate, later act performed from review mode.
    ===================================================== */

    async function handleSave() {
        if (saving) return;
        try {
            setSaving(true);
            if (onSaveDraft) {
                const ok = await onSaveDraft();
                if (ok === false) return;
            }
            await onSaveAndReview?.();
        } finally {
            setSaving(false);
        }
    }

    /* =====================================================
       🔹 LOCK & CONFIRM -- auto-saves first if there are
       unsaved edits made on this (final) step, then confirms.
    ===================================================== */

    async function handleLockAndConfirm() {
        if (!onConfirm || !isReviewMode) return;

        try {
            setSaving(true);
            if (isDirty && onSaveDraft) {
                const ok = await onSaveDraft();
                if (ok === false) return;
            }
            await onConfirm();
        } finally {
            setSaving(false);
        }
    }

    /* =====================================================
       🔹 RETURN TO DRAFT -- reviewer rejection. The lifecycle matrix has
       always declared reviewed -> draft; this is its first control.
    ===================================================== */

    async function handleReturnToDraft() {
        if (!onReturnToDraft || !isReviewMode) return;

        try {
            setSaving(true);
            await onReturnToDraft();
        } finally {
            setSaving(false);
        }
    }

    /* =====================================================
       🔹 CANCEL HANDLING
    ===================================================== */

    function handleCancelClick() {
        if (canEdit && isDirty) {
            setShowCancelModal(true);
        } else {
            onCancel?.();
        }
    }

    function confirmCancel() {
        setShowCancelModal(false);
        onCancel?.();
    }

    /* =====================================================
       🔹 TOP NAVIGATION BAR
    ===================================================== */

    const primaryButtonClasses = (disabled, tone = "bg-slate-900 hover:bg-slate-800") =>
        `inline-flex items-center gap-1.5 rounded-md px-5 py-2 text-sm font-semibold text-white shadow-sm transition ${disabled
            ? "cursor-not-allowed bg-slate-200 text-slate-400 shadow-none"
            : tone
        }`;

    // Cancel label: Competency always shows "Cancel" + X; Evidence swaps to
    // a bare "OK" once the model is read-only. Both are preserved verbatim
    // via adaptiveCancelLabel rather than picking one behavior for both.
    const showCancelIcon = !adaptiveCancelLabel || canEdit;
    const cancelText = adaptiveCancelLabel ? (canEdit ? "Cancel" : "OK") : "Cancel";

    function renderNavigation() {
        return (
            <div className="sticky top-0 z-20 border-b border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-4 px-8 py-4">
                    {/* Cancel / OK */}
                    <button
                        onClick={handleCancelClick}
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                    >
                        {showCancelIcon && <X size={15} strokeWidth={2.25} />}
                        {cancelText}
                    </button>

                    {/* Step Indicator + Progress Rail */}
                    <div className="flex flex-1 flex-col items-center px-4">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            Step {step} of {totalSteps}
                        </span>
                        <div className="mt-1.5 h-1 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
                            <div
                                className="h-full rounded-full bg-slate-900 transition-all duration-300"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2.5">
                        {saving && (
                            <span className="mr-0.5 text-xs font-medium text-slate-400">
                                Saving…
                            </span>
                        )}

                        {/* Back */}
                        {step > 1 && (
                            <button
                                onClick={onBack}
                                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                            >
                                <ChevronLeft size={15} strokeWidth={2.25} />
                                Back
                            </button>
                        )}

                        {/* Next -- silently saves the draft before advancing
                            while editing. A confirmed/locked model still gets
                            Next and Back: paging through a locked model to READ
                            it is the whole point of View mode, and the step
                            validity flags that gate Next while editing are
                            meaningless there (a step you never mount never sets
                            its flag, so `canProceed` is false for reasons that
                            have nothing to do with the model). onNext skips the
                            auto-save when locked -- see the wizard controller. */}
                        {!isLast && (
                            <button
                                onClick={handleNext}
                                disabled={saving || (canEdit && !canProceed)}
                                className={primaryButtonClasses(
                                    saving || (canEdit && !canProceed)
                                )}
                            >
                                Next
                                <ChevronRight size={15} strokeWidth={2.25} />
                            </button>
                        )}

                        {/* Save -- final step while still a draft */}
                        {isLast && canEdit && !isReviewMode && (
                            <button
                                onClick={handleSave}
                                disabled={!canProceed || saving}
                                className={primaryButtonClasses(
                                    !canProceed || saving,
                                    "bg-emerald-600 hover:bg-emerald-700"
                                )}
                            >
                                {saving ? "Saving…" : "Save for Review"}
                            </button>
                        )}

                        {/* Return to draft -- reviewer rejection, review mode only */}
                        {isLast && isReviewMode && onReturnToDraft && (
                            <button
                                onClick={handleReturnToDraft}
                                disabled={saving}
                                className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-700 shadow-sm transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:text-slate-400"
                            >
                                Return to draft
                            </button>
                        )}

                        {/* Lock & Confirm -- final step in review mode */}
                        {isLast && isReviewMode && (
                            <button
                                onClick={handleLockAndConfirm}
                                disabled={!canProceed || saving}
                                className={primaryButtonClasses(
                                    !canProceed || saving,
                                    "bg-blue-600 hover:bg-blue-700"
                                )}
                            >
                                {saving ? "Processing…" : "Lock & Confirm"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    /* =====================================================
       🔹 RENDER
    ===================================================== */

    return (
        <div className="flex flex-1 flex-col min-w-0">
            {renderNavigation()}

            {/* Grows with step content instead of scrolling internally --
                the page itself scrolls, with the sidebar and nav bar above
                staying pinned via `sticky`. */}
            <div className="flex-1 px-8 py-8">
                <div className="mx-auto max-w-5xl">
                    {children}

                    {locked && (
                        <div className="mt-8 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm text-emerald-800">
                            <Lock size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
                            <span>
                                This {modelLabel} is confirmed and locked.
                                Structural changes require cloning.
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <Modal
                isOpen={showCancelModal}
                onClose={() => setShowCancelModal(false)}
                onConfirm={confirmCancel}
                title="Discard changes?"
                message="You have unsaved changes on this step. Leaving now will discard them."
                cancelLabel="Continue Editing"
                confirmLabel="Discard & Exit"
                confirmClass="bg-red-600 hover:bg-red-700 text-white"
            />
        </div>
    );
}
