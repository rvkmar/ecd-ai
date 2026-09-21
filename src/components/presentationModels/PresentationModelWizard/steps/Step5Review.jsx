// steps/Step5Review.jsx — D113 Step 5: readiness panel.
// Rows come from presentationModelReadiness.js (same gates as canProceed /
// validatePresentationModelLifecycle).

import React from "react";
import { Check, X } from "lucide-react";
import { usePresentationModelWizard } from "../PresentationModelWizardContext";
import {
  meetsPresentationReviewedGates,
  meetsPresentationConfirmedGates,
} from "../../presentationModelReadiness";
import {
  presentationItemOrderLabel,
  presentationNavigationLabel,
  presentationFeedbackTimingLabel,
  presentationAccessibilityProfileLabel,
} from "@/utils/ecdVocabulary";

function ReadinessRow({ ok, label }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <Check size={15} className="shrink-0 text-emerald-600" />
      ) : (
        <X size={15} className="shrink-0 text-red-500" />
      )}
      <span className={ok ? "text-slate-700" : "text-slate-500"}>{label}</span>
    </div>
  );
}

export default function Step5Review() {
  const { draft, taskModel } = usePresentationModelWizard();
  const hasName = Boolean(draft.name);
  const hasTaskModel = Boolean(draft.taskModelId);
  const hasItemOrder = Boolean(draft.layout?.itemOrder);
  const hasNavigation = Boolean(draft.layout?.navigation);
  const hasFeedback = Boolean(draft.conditionalDisplay?.showFeedback);
  const hasProfile = Boolean(draft.accessibility?.profile);

  const reviewedReady = meetsPresentationReviewedGates(draft);
  const confirmedReady = meetsPresentationConfirmedGates(draft);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Review</h2>
        <p className="mt-1 text-sm text-slate-500">
          Everything below under &ldquo;Required before review&rdquo; must be
          checked off before this Presentation Model can be saved for review;
          feedback timing and an accessibility profile are additionally
          required before it can be locked and confirmed.
        </p>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Required before review
        </p>
        <ReadinessRow ok={hasName} label="Name is set" />
        <ReadinessRow ok={hasTaskModel} label="Bound to a Task Model" />
        <ReadinessRow ok={hasItemOrder} label="Item order declared" />
        <ReadinessRow ok={hasNavigation} label="Navigation declared" />

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Required before confirmation
        </p>
        <ReadinessRow ok={hasFeedback} label="Feedback timing declared" />
        <ReadinessRow ok={hasProfile} label="Accessibility profile declared" />
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <p className="font-medium text-slate-800">{draft.name || "(unnamed)"}</p>
        <p className="mt-1">
          Task Model {taskModel?.name || draft.taskModelId || "not bound"} · order{" "}
          {presentationItemOrderLabel(draft.layout?.itemOrder)} · navigation{" "}
          {presentationNavigationLabel(draft.layout?.navigation)} · feedback{" "}
          {presentationFeedbackTimingLabel(draft.conditionalDisplay?.showFeedback)} ·
          profile {presentationAccessibilityProfileLabel(draft.accessibility?.profile)}
        </p>
        <p className="mt-2 text-xs text-slate-400">
          SessionPlayer does not yet obey this object. Confirming it locks the
          authoring record; delivery wiring is a later W23 unit.
        </p>
      </div>

      {!reviewedReady && (
        <p className="text-sm text-red-600">
          Complete every item above under &ldquo;Required before review&rdquo;
          before saving.
        </p>
      )}
      {reviewedReady && !confirmedReady && (
        <p className="text-sm text-amber-600">
          Ready to save for review. Feedback timing and an accessibility
          profile are still required before this model can be locked and
          confirmed.
        </p>
      )}
      {confirmedReady && (
        <p className="text-sm text-emerald-700">
          Ready for review and, once reviewed, for confirmation.
        </p>
      )}
    </div>
  );
}
