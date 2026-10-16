// src/components/taskModelVariables/TaskModelVariableBuilder.jsx
//
// D117 library + D118 residuals: consumers visible before edit/delete;
// vocabulary valueSet levels are read-only with an explicit note.

import React, { useMemo, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/api/apiClient";
import {
  useTaskModelVariables,
  useCreateTaskModelVariable,
  useUpdateTaskModelVariable,
  useDeleteTaskModelVariable,
} from "@/api/queries/taskModelVariables";
import { useTaskModels } from "@/api/queries/taskModels";
import {
  TMV_TYPES,
  TMV_VALUE_SET_KEYS,
  tmvTypeLabel,
  taskModelVariableValueIds,
} from "@/utils/ecdVocabulary";
import WorkedExample from "@/components/authoring/WorkedExample";

export function consumersForVariable(taskModels, variableId) {
  if (!variableId) return [];
  return (taskModels || []).filter(
    (tm) =>
      Array.isArray(tm?.taskModelVariableIds) &&
      tm.taskModelVariableIds.includes(variableId)
  );
}

const emptyForm = () => ({
  name: "",
  description: "",
  type: "categorical",
  valueSet: "bloomLevel",
  possibleValuesText: "",
  rangeMin: "",
  rangeMax: "",
});

function formFromVariable(row) {
  return {
    name: row.name || "",
    description: row.description || "",
    type: row.type || "categorical",
    valueSet: row.valueSet || "",
    possibleValuesText: Array.isArray(row.possibleValues)
      ? row.possibleValues
          .map((p) => (typeof p === "string" ? p : p?.value || ""))
          .filter(Boolean)
          .join(", ")
      : "",
    rangeMin: row.range?.min ?? "",
    rangeMax: row.range?.max ?? "",
  };
}

function buildPayload(form) {
  const payload = {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    type: form.type,
  };
  const usesValueSet = form.type === "categorical" && form.valueSet;
  if (form.type === "numeric") {
    payload.range = { min: Number(form.rangeMin), max: Number(form.rangeMax) };
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
  return payload;
}

/** Presentational library — Storybook and tests drive this without API hooks. */
export function TaskModelVariableLibraryView({
  variables = [],
  taskModels = [],
  onCreate,
  onUpdate,
  onDelete,
  createPending = false,
  updatePending = false,
  deletePending = false,
}) {
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const editing = useMemo(
    () => (editingId ? variables.find((v) => v.id === editingId) : null),
    [editingId, variables]
  );

  const usesValueSet = form.type === "categorical" && !!form.valueSet;
  const usesAuthorList =
    form.type === "categorical" || form.type === "ordinal" ? !usesValueSet : false;
  const editingValueSetLocked = Boolean(editing?.valueSet);

  function startEdit(row) {
    setEditingId(row.id);
    setForm(formFromVariable(row));
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = buildPayload(form);
    if (editingId) {
      // Never re-point valueSet / type from the edit form when vocabulary-backed.
      if (editingValueSetLocked) {
        payload.type = editing.type;
        payload.valueSet = editing.valueSet;
        delete payload.possibleValues;
      }
      await onUpdate?.({ id: editingId, payload });
      cancelEdit();
    } else {
      await onCreate?.(payload);
      setForm(emptyForm());
    }
  }

  function handleDelete(row) {
    const consumers = consumersForVariable(taskModels, row.id);
    if (consumers.length) {
      const names = consumers
        .map((tm) => tm.name || tm.id)
        .slice(0, 8)
        .join(", ");
      toast.error(
        `Cannot delete: used by ${consumers.length} Task Model(s) — ${names}${
          consumers.length > 8 ? "…" : ""
        }. Unbind them first.`
      );
      return;
    }
    onDelete?.(row.id);
  }

  return (
    <div className="space-y-6 p-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Task Model Variables
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Shared design features (PADI Fig. 11). Define a variable once; bind
          it on any number of Task Models. Levels stay in vocabulary when a
          value set is named — not copied. No CAF lifecycle on these records.
        </p>
      </div>

      {variables.length === 0 && (
        <WorkedExample
          title="Diagram familiarity"
          lines={[
            "Type: categorical.",
            "Values: familiar, unfamiliar.",
            "Whether the plant in the diagram is one the student has already studied.",
          ]}
          citedBy="a Task Model, in taskModelVariableIds. A Design Pattern may list it as a variable feature"
        />
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40"
      >
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {editingId ? `Edit ${editing?.name || editingId}` : "New variable"}
        </h3>

        {editingId && (
          <div
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
            data-testid="tmv-consumers-before-edit"
          >
            <span className="font-medium">Consuming Task Models: </span>
            {(() => {
              const consumers = consumersForVariable(taskModels, editingId);
              if (!consumers.length) return "none — safe to edit levels.";
              return consumers
                .map((tm) => `${tm.name || tm.id}${tm.status ? ` (${tm.status})` : ""}`)
                .join("; ");
            })()}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Name</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Type</span>
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              value={form.type}
              disabled={Boolean(editingId)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  type: e.target.value,
                  valueSet:
                    e.target.value === "categorical" ? f.valueSet || "bloomLevel" : "",
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

        <label className="block text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            Description
          </span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </label>

        {form.type === "categorical" && !editingValueSetLocked && (
          <label className="block text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Value set (vocabulary)
            </span>
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              value={form.valueSet}
              disabled={Boolean(editingId)}
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

        {editingValueSetLocked && (
          <div
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"
            data-testid="tmv-valueset-readonly"
          >
            <p className="font-medium">
              Levels from vocabulary ({editing.valueSet}) — read-only
            </p>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              These values are defined in ecdVocabulary.js via valueSet. They are
              not copied onto the record and cannot be edited here.
            </p>
            <p className="mt-2 font-mono text-xs">
              {taskModelVariableValueIds(editing).join(", ")}
            </p>
          </div>
        )}

        {usesAuthorList && !editingValueSetLocked && (
          <label className="block text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Possible values (comma or newline)
            </span>
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              rows={3}
              value={form.possibleValuesText}
              onChange={(e) =>
                setForm((f) => ({ ...f, possibleValuesText: e.target.value }))
              }
              required={!editingId}
            />
          </label>
        )}

        {form.type === "numeric" && (
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Range min
              </span>
              <input
                type="number"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
                value={form.rangeMin}
                onChange={(e) => setForm((f) => ({ ...f, rangeMin: e.target.value }))}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Range max
              </span>
              <input
                type="number"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
                value={form.rangeMax}
                onChange={(e) => setForm((f) => ({ ...f, rangeMax: e.target.value }))}
                required
              />
            </label>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={editingId ? updatePending : createPending}
          >
            {editingId
              ? updatePending
                ? "Saving…"
                : "Save changes"
              : createPending
                ? "Creating…"
                : "Create Task Model Variable"}
          </Button>
          {editingId && (
            <Button type="button" variant="outline" onClick={cancelEdit}>
              Cancel
            </Button>
          )}
        </div>
      </form>

      {variables.length === 0 ? (
        <p className="text-sm text-slate-500">No Task Model Variables yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Levels</th>
                <th className="px-4 py-2">Used by</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {variables.map((row) => {
                const levels = taskModelVariableValueIds(row);
                const consumers = consumersForVariable(taskModels, row.id);
                return (
                  <tr
                    key={row.id}
                    className="border-t border-slate-100 dark:border-slate-800"
                    data-testid={`tmv-row-${row.id}`}
                  >
                    <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-100">
                      {row.name}
                      <div className="text-xs text-slate-400">{row.id}</div>
                    </td>
                    <td className="px-4 py-2">{tmvTypeLabel(row.type)}</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                      {row.valueSet
                        ? `valueSet: ${row.valueSet}`
                        : row.type === "numeric"
                          ? `${row.range?.min} – ${row.range?.max}`
                          : levels.join(", ") || "—"}
                    </td>
                    <td
                      className="px-4 py-2 text-slate-600 dark:text-slate-300"
                      data-testid={`tmv-consumers-${row.id}`}
                    >
                      {consumers.length === 0
                        ? "—"
                        : consumers.map((tm) => tm.name || tm.id).join(", ")}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(row)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        disabled={deletePending}
                        onClick={() => handleDelete(row)}
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

export default function TaskModelVariableBuilder() {
  const { data: rows = [], isLoading } = useTaskModelVariables();
  const { data: taskModels = [] } = useTaskModels();
  const createMutation = useCreateTaskModelVariable();
  const updateMutation = useUpdateTaskModelVariable();
  const deleteMutation = useDeleteTaskModelVariable();

  async function handleCreate(payload) {
    try {
      await createMutation.mutateAsync(payload);
      toast.success("Task Model Variable created.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Create failed."));
      throw err;
    }
  }

  async function handleUpdate({ id, payload }) {
    try {
      await updateMutation.mutateAsync({ id, payload });
      toast.success("Task Model Variable updated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Update failed."));
      throw err;
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
    return (
      <p className="text-sm text-slate-500">Loading Task Model Variables…</p>
    );
  }

  return (
    <TaskModelVariableLibraryView
      variables={rows}
      taskModels={taskModels}
      onCreate={handleCreate}
      onUpdate={handleUpdate}
      onDelete={handleDelete}
      createPending={createMutation.isPending}
      updatePending={updateMutation.isPending}
      deletePending={deleteMutation.isPending}
    />
  );
}
