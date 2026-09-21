// steps/Step4Accessibility.jsx — D113 Step 4: profile, font scale, time.

import React from "react";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { usePresentationModelWizard } from "../PresentationModelWizardContext";
import { PRESENTATION_ACCESSIBILITY_PROFILES } from "@/utils/ecdVocabulary";

export default function Step4Accessibility() {
  const { draft, patchAccessibility } = usePresentationModelWizard();
  const locked = draft.locked;
  const a11y = draft.accessibility || {};

  function toNumberOrUndefined(value) {
    return value === "" ? undefined : Number(value);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Accessibility</h2>
        <p className="mt-1 text-sm text-slate-500">
          Delivery profile applied when SessionPlayer later obeys this model.
          A profile is required before confirmation.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600">Profile</label>
        <Combobox
          options={PRESENTATION_ACCESSIBILITY_PROFILES.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
          value={a11y.profile}
          onValueChange={(profile) => patchAccessibility({ profile })}
          placeholder="Select accessibility profile…"
          disabled={locked}
        />
        <p className="mt-1 text-xs text-slate-400">
          {PRESENTATION_ACCESSIBILITY_PROFILES.find((o) => o.value === a11y.profile)?.hint}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-slate-600">Font scale (1–2)</label>
          <Input
            type="number"
            min="1"
            max="2"
            step="0.1"
            disabled={locked}
            value={a11y.fontScale ?? ""}
            onChange={(e) => patchAccessibility({ fontScale: toNumberOrUndefined(e.target.value) })}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Time multiplier (1–3)</label>
          <Input
            type="number"
            min="1"
            max="3"
            step="0.25"
            disabled={locked}
            value={a11y.timeMultiplier ?? ""}
            onChange={(e) =>
              patchAccessibility({ timeMultiplier: toNumberOrUndefined(e.target.value) })
            }
          />
        </div>
      </div>
    </div>
  );
}
