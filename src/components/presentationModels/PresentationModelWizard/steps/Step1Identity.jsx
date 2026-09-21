// steps/Step1Identity.jsx — D113 Step 1: name, description, bound Task Model.
// The Task Model picker locks once a record exists (structural reference).

import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { usePresentationModelWizard } from "../PresentationModelWizardContext";

export default function Step1Identity() {
  const { draft, taskModels, updateField, selectTaskModel } = usePresentationModelWizard();
  const locked = draft.locked;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Identity</h2>
        <p className="mt-1 text-sm text-slate-500">
          Name this Presentation Model and bind it to the Task Model whose
          materials it presents. PADI TR9 places Materials &amp; Presentation
          on the task template, not as a fifth CAF sibling.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600">Name</label>
        <Input
          value={draft.name}
          disabled={locked}
          onChange={(e) => updateField("name", e.target.value)}
          placeholder="e.g. Fractions linear presentation"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600">Description</label>
        <Textarea
          rows={3}
          value={draft.description || ""}
          disabled={locked}
          onChange={(e) => updateField("description", e.target.value)}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600">Task Model</label>
        <Combobox
          options={taskModels.map((m) => ({ value: m.id, label: m.name }))}
          value={draft.taskModelId}
          onValueChange={selectTaskModel}
          placeholder="Select a Task Model…"
          disabled={locked || Boolean(draft.id)}
        />
        {draft.id && (
          <p className="mt-1 text-xs text-slate-400">
            The bound Task Model cannot be changed once this Presentation
            Model has been saved.
          </p>
        )}
        {!draft.taskModelId && (
          <p className="mt-1 text-xs text-amber-600">
            Select a Task Model before laying out how its items are shown.
          </p>
        )}
      </div>
    </div>
  );
}
