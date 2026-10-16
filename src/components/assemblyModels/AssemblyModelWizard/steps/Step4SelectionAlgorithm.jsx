// steps/Step4SelectionAlgorithm.jsx -- D54 Step 4: selectionAlgorithm is a
// POINTER to an existing `policies` record, not a duplicated copy of its
// type (see schema.js's assemblyModels header comment: "one pointer,
// validated on both sides"). A validated Combobox, same component
// QMatrixEditor.jsx uses for its competency-model picker.

import React from "react";
import { Combobox } from "@/components/ui/combobox";
import { useAssemblyModelWizard } from "../AssemblyModelWizardContext";

export default function Step4SelectionAlgorithm() {
  const { draft, policies, setSelectionPolicy } = useAssemblyModelWizard();
  const locked = draft.locked;
  const selectedPolicy = policies.find((p) => p.id === draft.selectionAlgorithm?.policyId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Selection Algorithm</h2>
        <p className="mt-1 text-sm text-slate-500">
          Bind this Assembly Model to the policy that governs item selection
          for sessions built on it (fixed / IRT / Bayesian Network / Markov
          Chain).
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600">Policy</label>
        <Combobox
          options={policies.map((p) => ({ value: p.id, label: `${p.name} (${p.type})` }))}
          value={draft.selectionAlgorithm?.policyId}
          onValueChange={setSelectionPolicy}
          placeholder="Select a policy…"
          disabled={locked}
        />
      </div>

      {selectedPolicy && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <p>
            <span className="font-medium text-slate-800">{selectedPolicy.name}</span> — type{" "}
            {selectedPolicy.type}
          </p>
          {selectedPolicy.description && (
            <p className="mt-1 text-xs text-slate-500">{selectedPolicy.description}</p>
          )}
        </div>
      )}

      {!draft.selectionAlgorithm?.policyId && (
        <p className="text-sm text-amber-600">
          A selection algorithm policy is required before this model can be
          saved for review.
        </p>
      )}

      {policies.length === 0 && (
        <p className="text-sm text-red-600">
          No policies exist yet. Create one under Policies → Selection policies
          before returning to this step.
        </p>
      )}
    </div>
  );
}
