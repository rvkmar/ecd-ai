// src/components/itemBank/ItemWizard/ItemWizard.jsx
// ------------------------------------------------------------
// Item Wizard shell — same chrome as the Competency / Evidence / Task
// Model wizards.
//
// The nav bar used to read `isStepValid` out of ItemWizardContext, which
// never provided it. `!undefined` is true, so Next and Save were disabled
// on every step of every editable item, permanently. The context provides
// it now, and it is computed per step rather than from a global gate.
//
// The lifecycle bar also carried only Save / Confirm / Activate. The
// lifecycle matrix declares six more transitions — reviewer rejection,
// suspension, reactivation and archival — none of which had a control
// anywhere in the product, so an item that reached `operational` could
// never be taken out of service from the UI. All of them are here, and
// each is offered exactly when canTransition() allows it.
// ------------------------------------------------------------

import React, { useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Lock,
  X,
  AlertTriangle,
} from "lucide-react";
import { ItemWizardProvider, useItemWizard } from "./ItemWizardContext";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import Modal from "@/components/ui/Modal";

import Step1Instantiation from "./steps/Step1Instantiation";
import Step2Blueprint from "./steps/Step2Blueprint";
import Step3Stimulus from "./steps/Step3Stimulus";
import Step4Interaction from "./steps/Step4Interaction";
import Step5Scoring from "./steps/Step5Scoring";
import Step6Metadata from "./steps/Step6Metadata";
import Step7Operations from "./steps/Step7Operations";
import Step8Review from "./steps/Step8Review";

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-600",
  reviewed: "bg-amber-100 text-amber-700",
  confirmed: "bg-blue-100 text-blue-700",
  operational: "bg-emerald-100 text-emerald-700",
  suspended: "bg-orange-100 text-orange-700",
  archived: "bg-slate-800 text-white",
};

const STATUS_DOT_COLORS = {
  draft: "bg-slate-400",
  reviewed: "bg-amber-500",
  confirmed: "bg-blue-500",
  operational: "bg-emerald-500",
  suspended: "bg-orange-500",
  archived: "bg-slate-800",
};

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

function WizardLayout({ onClose }) {
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
    stepCompletion,
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
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [confirmTransition, setConfirmTransition] = useState(null);

  const isLastStep = currentStep === steps.length - 1;
  const status = item.status || "draft";

  const progressPercent = Math.min(
    100,
    Math.round(((currentStep + 1) / steps.length) * 100)
  );

  const StepComponent = STEP_COMPONENTS[currentStepKey];

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

  function handleCancelClick() {
    if (canEdit && isDirty) setShowCancelModal(true);
    else onClose?.();
  }

  const btn = (tone) =>
    `inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none ${tone}`;

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* ---------- Sidebar ---------- */}
      <aside
        className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-all duration-200 ease-in-out ${
          collapsed ? "w-[72px]" : "w-72"
        }`}
      >
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-8 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
        >
          {collapsed ? (
            <ChevronRight size={13} strokeWidth={2.5} />
          ) : (
            <ChevronLeft size={13} strokeWidth={2.5} />
          )}
        </button>

        <div className={`border-b border-slate-100 py-6 ${collapsed ? "px-3" : "px-6"}`}>
          <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
              I
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-slate-900">
                  Item Wizard
                </h3>
                <p className="truncate text-xs text-slate-500">
                  {item.id || "New item"}
                </p>
              </div>
            )}
          </div>

          <div className={`mt-4 ${collapsed ? "flex justify-center" : ""}`}>
            {collapsed ? (
              <span
                title={status}
                className={`h-2.5 w-2.5 rounded-full ${
                  STATUS_DOT_COLORS[status] || "bg-slate-400"
                }`}
              />
            ) : (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  STATUS_COLORS[status] || STATUS_COLORS.draft
                }`}
              >
                {status}
                {item.versionNumber ? ` · v${item.versionNumber}` : ""}
              </span>
            )}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4" tabIndex={0} aria-label="Wizard steps">
          {steps.map((step, index) => {
            const active = index === currentStep;
            // Real completion, not cursor position. `index < currentStep`
            // meant walking back to step 1 un-ticked steps 2 and 3 even
            // though nothing about them had changed, and a step could show
            // a green tick while its own readiness checks were failing.
            const done = stepCompletion[step.key] === true;
            const clickable = isLocked || index <= currentStep;

            return (
              <button
                key={step.key}
                type="button"
                disabled={!clickable}
                onClick={() => clickable && goToStep(index)}
                title={collapsed ? step.label : undefined}
                className={`flex w-full items-start gap-3 px-6 py-2.5 text-left transition ${
                  collapsed ? "justify-center px-3" : ""
                } ${
                  active
                    ? "bg-slate-50"
                    : clickable
                    ? "hover:bg-slate-50"
                    : "cursor-not-allowed opacity-50"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    active
                      ? "bg-slate-900 text-white"
                      : done
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {done ? <Check size={12} strokeWidth={3} /> : index + 1}
                </span>

                {!collapsed && (
                  <span className="min-w-0">
                    <span
                      className={`block truncate text-sm ${
                        active ? "font-semibold text-slate-900" : "text-slate-600"
                      }`}
                    >
                      {step.label}
                    </span>
                    {active && (
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {step.blurb}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ---------- Main ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-4 px-8 py-4">
            <button
              type="button"
              onClick={handleCancelClick}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <X size={15} strokeWidth={2.25} />
              Close
            </button>

            <div className="min-w-[12rem] flex-1">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  Step {currentStep + 1} of {steps.length} — {steps[currentStep].label}
                </span>
                <span>{progressPercent}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-slate-900 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {currentStep > 0 && (
                <button
                  type="button"
                  onClick={prevStep}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                >
                  <ChevronLeft size={15} strokeWidth={2.25} />
                  Back
                </button>
              )}

              {!isLastStep && (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={busy || !isStepValid}
                  className={btn("bg-slate-900 text-white hover:bg-slate-800")}
                >
                  {busy ? "Saving…" : "Next"}
                  <ChevronRight size={15} strokeWidth={2.25} />
                </button>
              )}

              {/* --- Lifecycle actions --- */}
              {canReject && (
                <button
                  type="button"
                  onClick={() => runTransition("draft")}
                  disabled={busy}
                  className={btn("bg-white text-amber-700 border border-amber-300 hover:bg-amber-50")}
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
                  Review &amp; confirm
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
                  className={btn("bg-white text-slate-700 border border-slate-300 hover:bg-slate-50")}
                >
                  Archive
                </button>
              )}

              {canClone && (
                <button
                  type="button"
                  onClick={cloneItem}
                  disabled={busy}
                  className={btn("bg-white text-slate-700 border border-slate-300 hover:bg-slate-50")}
                >
                  Clone
                </button>
              )}
            </div>
          </div>

          {/* Why Next is disabled, named. A disabled control with no
              explanation is what made the previous wizard read as broken
              rather than as blocked. */}
          {!isStepValid && stepBlockers.length > 0 && (
            <div className="flex items-start gap-2 border-t border-amber-100 bg-amber-50 px-8 py-2.5 text-xs text-amber-800">
              <AlertTriangle size={14} strokeWidth={2.25} className="mt-0.5 shrink-0" />
              <span>
                {stepBlockers.map((b) => b.label).join(" · ")}
                {stepBlockers[0]?.detail ? ` — ${stepBlockers[0].detail}` : ""}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 px-8 py-8">
          <div className="mx-auto max-w-5xl">
            {/* Per-step, not per-app. A step that throws costs the reader
                that step; the rail, the nav bar and Close keep working.
                resetKey is the step key so moving away and back retries
                the render rather than latching the error forever. */}
            <ErrorBoundary
              resetKey={currentStepKey}
              label={steps[currentStep].label}
            >
              {StepComponent ? <StepComponent /> : null}
            </ErrorBoundary>

            {isLocked && (
              <div className="mt-8 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm text-emerald-800">
                <Lock size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
                <span>
                  This item is {status} and locked. Structural changes require
                  cloning.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={() => onClose?.()}
        title="Discard changes?"
        message="You have unsaved changes on this step. Leaving now will discard them."
        cancelLabel="Continue editing"
        confirmLabel="Discard & exit"
        confirmClass="bg-red-600 hover:bg-red-700 text-white"
      />

      <Modal
        isOpen={!!confirmTransition}
        onClose={() => setConfirmTransition(null)}
        onConfirm={() => runTransition(confirmTransition)}
        title={confirmTransition === "archived" ? "Archive this item?" : "Suspend this item?"}
        message={
          confirmTransition === "archived"
            ? "Archiving retires the item permanently. It can never be cloned or returned to service, and any Task Model relying on it for activation loses that support."
            : "Suspending removes the item from delivery. It can be reactivated later, subject to its reactivation ceiling."
        }
        cancelLabel="Cancel"
        confirmLabel={busy ? "Working…" : confirmTransition === "archived" ? "Archive" : "Suspend"}
        confirmClass="bg-slate-900 hover:bg-slate-800 text-white"
      >
        <p className="text-xs text-slate-500">
          If a live session depends on this item the server will refuse.
          Forcing past that closes those sessions and is an admin action.
        </p>
      </Modal>
    </div>
  );
}

export default function ItemWizard({ item, onClose }) {
  return (
    <ItemWizardProvider initialItem={item}>
      <WizardLayout onClose={onClose} />
    </ItemWizardProvider>
  );
}
