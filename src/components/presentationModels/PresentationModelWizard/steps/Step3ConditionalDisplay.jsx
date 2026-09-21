// steps/Step3ConditionalDisplay.jsx — D113 Step 3: feedback timing + flags.

import React from "react";
import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { usePresentationModelWizard } from "../PresentationModelWizardContext";
import { PRESENTATION_FEEDBACK_TIMINGS } from "@/utils/ecdVocabulary";

export default function Step3ConditionalDisplay() {
  const { draft, patchConditionalDisplay } = usePresentationModelWizard();
  const locked = draft.locked;
  const cd = draft.conditionalDisplay || {};

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Conditional display</h2>
        <p className="mt-1 text-sm text-slate-500">
          When feedback is shown and whether skip, review, and progress are
          offered. Feedback timing is required before confirmation.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600">Feedback timing</label>
        <Combobox
          options={PRESENTATION_FEEDBACK_TIMINGS.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
          value={cd.showFeedback}
          onValueChange={(showFeedback) => patchConditionalDisplay({ showFeedback })}
          placeholder="Select feedback timing…"
          disabled={locked}
        />
        <p className="mt-1 text-xs text-slate-400">
          {PRESENTATION_FEEDBACK_TIMINGS.find((o) => o.value === cd.showFeedback)?.hint}
        </p>
      </div>

      <label className="flex items-center gap-2">
        <Checkbox
          checked={Boolean(cd.allowSkip)}
          disabled={locked}
          onCheckedChange={(v) => patchConditionalDisplay({ allowSkip: Boolean(v) })}
        />
        <span className="text-sm text-slate-700">Allow skip</span>
      </label>

      <label className="flex items-center gap-2">
        <Checkbox
          checked={Boolean(cd.allowReview)}
          disabled={locked}
          onCheckedChange={(v) => patchConditionalDisplay({ allowReview: Boolean(v) })}
        />
        <span className="text-sm text-slate-700">Allow review of previous items</span>
      </label>

      <label className="flex items-center gap-2">
        <Checkbox
          checked={Boolean(cd.showProgress)}
          disabled={locked}
          onCheckedChange={(v) => patchConditionalDisplay({ showProgress: Boolean(v) })}
        />
        <span className="text-sm text-slate-700">Show progress</span>
      </label>
    </div>
  );
}
