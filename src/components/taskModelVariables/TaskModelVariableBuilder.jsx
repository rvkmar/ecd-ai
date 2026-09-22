// src/components/taskModelVariables/TaskModelVariableBuilder.jsx
//
// D117 — library surface for Task Model Variables (W24). Create / list /
// delete shared design-feature records. No CAF status machine. Binding
// those records onto a Task Model is the Task Model Wizard "Variables" step.

import React, { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/api/apiClient";
import {
  useTaskModelVariables,
  useCreateTaskModelVariable,
  useDeleteTaskModelVariable,
} from "@/api/queries/taskModelVariables";
import {
  TMV_TYPES,
  TMV_VALUE_SET_KEYS,
  tmvTypeLabel,
  taskModelVariableValueIds,
} from "@/utils/ecdVocabulary";

const emptyForm = () => ({
  name: "",
  description: "",
  type: "categorical",
  valueSet: "bloomLevel",
  possibleValuesText: "",
  rangeMin: "",
  rangeMax: "",
});

export default function TaskModelVariableBuilder() {
  const { data: rows = [], isLoading } = useTaskModelVariables();
  const createMutation = useCreateTaskModelVariable();
  const deleteMutation = useDeleteTaskModelVariable();
  const [form, setForm] = useState(emptyForm);

  const usesValueSet = form.type === "categorical" && form.valueSet;
  const usesAuthorList = form.type === "categorical" || form.type === "ordinal"
    ? !usesValueSet
    : false;

  async function handleCreate(e) {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      type: form.type,
    };
    if (form.type === "numeric") {
      const min = Number(form.rangeMin);
      const max = Number(form.rangeMax);
      payload.range = { min, max };
    } else if (form.type === "boolean") {
      // levels are fixed
    } else if (usesValueSet) {
      payload.valueSet = form.valueSet;
    } else {
      payload.possibleValues = form.possibleValuesText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((value) => ({ value, label: value }));
    }

    try {
      await createMutation.mutateAsync(payload);
      toast.success("Task Model Variable created.");
      setForm(emptyForm());
    } catch (err) {
      toast.error(apiErrorMessage(err, "Create failed."));
    }
  }

  async function handleDelete(id) {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Task Model Variable deleted.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Delete failed."));
    }
  }

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading Task Model Variables…</p>;
  }

  return (
    <div className="space-y-6 p-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Task Model Variables</h2>
        <p className="mt-1 text-sm text-slate-500">
          Shared design features (PADI Fig. 11). Define a variable once; bind
          it on any number of Task Models. Levels stay in vocabulary when a
          value set is named — not copied. No CAF lifecycle on these records.
        </p>
      </div>

      <form
        onSubmit={handleCreate}
        className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4"
      >
        <h3 className="text-sm font-semibold text-slate-800">New variable</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Name</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Type</span>
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={form.type}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  type: e.target.value,
                  valueSet: e.target.value === "categorical" ? f.valueSet || "bloomLevel" : "",
                }))
              }
            >
              {TMV_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {form.type === "categorical" && (
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Value set (vocabulary)</span>
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={form.valueSet}
              onChange={(e) => setForm((f) => ({ ...f, valueSet: e.target.value }))}
            >
              <option value="">Author-supplied levels</option>
              {TMV_VALUE_SET_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
        )}

        {usesAuthorList && (
          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              Possible values (comma or newline)
            </span>
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              rows={3}
              value={form.possibleValuesText}
              onChange={(e) =>
                setForm((f) => ({ ...f, possibleValuesText: e.target.value }))
              }
              required
            />
          </label>
        )}

        {form.type === "numeric" && (
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Range min</span>
              <input
                type="number"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={form.rangeMin}
                onChange={(e) => setForm((f) => ({ ...f, rangeMin: e.target.value }))}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Range max</span>
              <input
                type="number"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={form.rangeMax}
                onChange={(e) => setForm((f) => ({ ...f, rangeMax: e.target.value }))}
                required
              />
            </label>
          </div>
        )}

        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Creating…" : "Create Task Model Variable"}
        </Button>
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No Task Model Variables yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-600">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Levels</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const levels = taskModelVariableValueIds(row);
                return (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-800">
                      {row.name}
                      <div className="text-xs text-slate-400">{row.id}</div>
                    </td>
                    <td className="px-4 py-2">{tmvTypeLabel(row.type)}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {row.valueSet
                        ? `valueSet: ${row.valueSet}`
                        : row.type === "numeric"
                          ? `${row.range?.min} – ${row.range?.max}`
                          : levels.join(", ") || "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDelete(row.id)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
