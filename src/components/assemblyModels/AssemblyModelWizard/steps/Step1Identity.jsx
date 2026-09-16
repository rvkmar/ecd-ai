// steps/Step1Identity.jsx -- D54 Step 1: name, description, bound
// Student Model. Mirrors QMatrixEditor.jsx's identity fields: the
// Student Model picker locks once a record exists (it's a structural
// reference, not editable metadata) same as QMatrixEditor's Combobox
// `disabled={locked || Boolean(draft.id)}`.

import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { useAssemblyModelWizard } from "../AssemblyModelWizardContext";

export default function Step1Identity() {
  const { draft, competencyModels, updateField, selectCompetencyModel } =
    useAssemblyModelWizard();

  const locked = draft.locked;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Identity</h2>
        <p className="mt-1 text-sm text-slate-500">
          Name this Assembly Model and bind it to the Student Model it is a
          test specification for.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600">Name</label>
        <Input
          value={draft.name}
          disabled={locked}
          onChange={(e) => updateField("name", e.target.value)}
          placeholder="e.g. Fractions Diagnostic Assembly Model"
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
        <label className="text-sm font-medium text-slate-600">Student Model</label>
        <Combobox
          options={competencyModels.map((m) => ({ value: m.id, label: m.name }))}
          value={draft.competencyModelId}
          onValueChange={selectCompetencyModel}
          placeholder="Select a Student Model…"
          disabled={locked || Boolean(draft.id)}
        />
        {draft.id && (
          <p className="mt-1 text-xs text-slate-400">
            The bound Student Model cannot be changed once this Assembly
            Model has been saved.
          </p>
        )}
        {!draft.competencyModelId && (
          <p className="mt-1 text-xs text-amber-600">
            Select a Student Model to declare Student Model Variable
            targets in the next step.
          </p>
        )}
      </div>
    </div>
  );
}
