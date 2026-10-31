// Alternative explanations on the Toulmin argument. Each row is optional
// on a draft. From review onward it needs text and the observable or task
// model variable that addresses it. additionalKsaRef is optional.

import { Plus, Trash2 } from "lucide-react";
import { useEvidenceWizardContext } from "../EvidenceWizardContext";
import {
  listAdditionalKsaOptions,
  listAddressedByOptions,
} from "@/utils/evidenceArgument";

const fieldClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400";

export default function AlternativeExplanationsEditor({
  locked = false,
  patterns = [],
  taskModelVariables = [],
  errors = [],
  warnings = [],
}) {
  const { draftModel, updateField } = useEvidenceWizardContext();
  const rows = Array.isArray(draftModel?.alternativeExplanations)
    ? draftModel.alternativeExplanations
    : [];
  const ksaOptions = listAdditionalKsaOptions(patterns);
  const addressedOptions = listAddressedByOptions(draftModel, taskModelVariables);

  function write(next) {
    updateField("alternativeExplanations", next);
  }

  function patchRow(index, patch) {
    write(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    write([...rows, { text: "", additionalKsaRef: "", addressedBy: "" }]);
  }

  function removeRow(index) {
    write(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Alternative explanations</h3>
          <p className="mt-1 text-sm text-slate-500">
            Name another way the observation could arise, and what rules it out.
            A draft may leave this empty. From review onward each row needs text
            and an observable or task model variable that addresses it.
          </p>
        </div>
        {!locked && (
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"
            onClick={addRow}
          >
            <Plus size={14} strokeWidth={2.25} />
            Add explanation
          </button>
        )}
      </div>

      {warnings.map((message) => (
        <p key={message} className="text-sm text-amber-800">
          {message}
        </p>
      ))}
      {errors.map((message) => (
        <p key={message} className="text-sm text-red-700">
          {message}
        </p>
      ))}

      {rows.length === 0 && (
        <p className="text-sm text-slate-500">No alternative explanations yet.</p>
      )}

      {rows.map((row, index) => (
        <div key={index} className="rounded-lg border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Explanation {index + 1}
            </span>
            {!locked && (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                onClick={() => removeRow(index)}
              >
                <Trash2 size={14} strokeWidth={2} />
                Remove
              </button>
            )}
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Text
            <textarea
              className={`${fieldClass} mt-1.5`}
              rows={2}
              disabled={locked}
              value={row.text || ""}
              onChange={(event) => patchRow(index, { text: event.target.value })}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Additional KSA
            <select
              className={`${fieldClass} mt-1.5`}
              disabled={locked}
              value={row.additionalKsaRef || ""}
              onChange={(event) => patchRow(index, { additionalKsaRef: event.target.value })}
            >
              <option value="">None</option>
              {ksaOptions.map((option) => (
                <option key={option.ref} value={option.ref}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Addressed by
            <select
              className={`${fieldClass} mt-1.5`}
              disabled={locked}
              value={row.addressedBy || ""}
              onChange={(event) => patchRow(index, { addressedBy: event.target.value })}
            >
              <option value="">Select an observable or task model variable</option>
              {addressedOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ))}
    </div>
  );
}
