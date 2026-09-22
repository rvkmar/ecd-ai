// src/components/rubrics/RubricBuilder.jsx
//
// D122 library: rubrics with dimensions, levels, and exemplars.
// Replaces the abandoned RubricManager.jsx.backup (deleted deliberately —
// it bound a rubric to one observation; reusable rubrics bind via EM
// evaluationProcedures.rubricId instead).

import React, { useMemo, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/api/apiClient";
import {
  useRubrics,
  useCreateRubric,
  useUpdateRubric,
  useConfirmRubric,
  useDeleteRubric,
} from "@/api/queries/rubrics";
import { useEvidenceModels } from "@/api/queries/evidenceModels";

export function consumersForRubric(evidenceModels, rubricId) {
  if (!rubricId) return [];
  return (evidenceModels || []).filter((em) =>
    (em?.evaluationProcedures || []).some((p) => p?.rubricId === rubricId)
  );
}

const blankDimension = () => ({
  id: `dim_${Math.random().toString(36).slice(2, 8)}`,
  name: "Criterion",
  levels: [
    { value: 0, label: "Low", descriptor: "", exemplar: "" },
    { value: 1, label: "High", descriptor: "", exemplar: "" },
  ],
  activatesAt: 1,
  exemplars: {},
});

const emptyForm = () => ({
  name: "",
  description: "",
  dimensions: [blankDimension()],
});

function formFromRow(row) {
  return {
    name: row.name || "",
    description: row.description || "",
    dimensions: Array.isArray(row.dimensions) && row.dimensions.length
      ? row.dimensions.map((d) => ({
          id: d.id,
          name: d.name || "",
          levels: (d.levels || []).map((l) =>
            typeof l === "object" && l != null
              ? {
                  value: l.value,
                  label: l.label || String(l.value),
                  descriptor: l.descriptor || "",
                  exemplar: l.exemplar || (d.exemplars && d.exemplars[l.value]) || "",
                }
              : {
                  value: l,
                  label: String(l),
                  descriptor: "",
                  exemplar: (d.exemplars && d.exemplars[l]) || "",
                }
          ),
          activatesAt: d.activatesAt ?? 1,
          exemplars: d.exemplars || {},
        }))
      : [blankDimension()],
  };
}

function buildPayload(form, status = "draft") {
  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    status,
    dimensions: form.dimensions.map((d) => ({
      id: d.id,
      name: d.name,
      levels: d.levels.map((l) => ({
        value: Number.isFinite(Number(l.value)) ? Number(l.value) : l.value,
        label: l.label,
        descriptor: l.descriptor,
        exemplar: l.exemplar,
      })),
      activatesAt: d.activatesAt,
      exemplars: Object.fromEntries(
        d.levels
          .filter((l) => l.exemplar && String(l.exemplar).trim())
          .map((l) => [String(l.value), l.exemplar])
      ),
    })),
  };
}

export function RubricLibraryView({
  rubrics = [],
  evidenceModels = [],
  onCreate,
  onUpdate,
  onConfirm,
  onDelete,
  createPending = false,
  updatePending = false,
  confirmPending = false,
  deletePending = false,
}) {
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const editing = useMemo(
    () => (editingId ? rubrics.find((v) => v.id === editingId) : null),
    [editingId, rubrics]
  );

  function startEdit(row) {
    setEditingId(row.id);
    setForm(formFromRow(row));
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = buildPayload(form, editing?.status || "draft");
    if (editingId) {
      await onUpdate?.({ id: editingId, payload });
      cancelEdit();
    } else {
      await onCreate?.(payload);
      setForm(emptyForm());
    }
  }

  function updateDim(idx, patch) {
    setForm((f) => ({
      ...f,
      dimensions: f.dimensions.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    }));
  }

  function updateLevel(dimIdx, lvlIdx, patch) {
    setForm((f) => ({
      ...f,
      dimensions: f.dimensions.map((d, i) => {
        if (i !== dimIdx) return d;
        return {
          ...d,
          levels: d.levels.map((l, j) => (j === lvlIdx ? { ...l, ...patch } : l)),
        };
      }),
    }));
  }

  return (
    <div className="space-y-6 p-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Rubrics</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Reusable scoring rubrics with exemplars per level. Bind on an Evidence
          Model evaluation procedure via rubricId. Confirm before binding.
          Inline EM rubric artifacts remain valid; this collection is the
          shared definition.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40"
      >
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {editingId ? `Edit ${editing?.name || editingId}` : "New rubric"}
        </h3>

        {editingId && (
          <div
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            data-testid="rubric-consumers-before-edit"
          >
            <span className="font-medium">Citing Evidence Models: </span>
            {(() => {
              const consumers = consumersForRubric(evidenceModels, editingId);
              if (!consumers.length) return "none.";
              return consumers.map((em) => em.name || em.id).join("; ");
            })()}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Name</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="font-medium">Description</span>
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
        </div>

        {form.dimensions.map((dim, di) => (
          <div key={dim.id} className="rounded border border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-2 flex gap-2">
              <input
                className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950"
                value={dim.name}
                onChange={(e) => updateDim(di, { name: e.target.value })}
                placeholder="Dimension name"
              />
              <input
                className="w-24 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950"
                value={dim.id}
                onChange={(e) => updateDim(di, { id: e.target.value })}
                placeholder="id"
              />
            </div>
            {dim.levels.map((lvl, li) => (
              <div key={li} className="mb-2 grid gap-2 md:grid-cols-4">
                <input
                  className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950"
                  type="number"
                  value={lvl.value}
                  onChange={(e) => updateLevel(di, li, { value: e.target.value })}
                  placeholder="value"
                />
                <input
                  className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950"
                  value={lvl.label}
                  onChange={(e) => updateLevel(di, li, { label: e.target.value })}
                  placeholder="label"
                />
                <input
                  className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950 md:col-span-2"
                  value={lvl.exemplar}
                  onChange={(e) => updateLevel(di, li, { exemplar: e.target.value })}
                  placeholder="exemplar (required to confirm)"
                />
              </div>
            ))}
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setForm((f) => ({ ...f, dimensions: [...f.dimensions, blankDimension()] }))
            }
          >
            Add dimension
          </Button>
          <Button type="submit" disabled={createPending || updatePending}>
            {editingId ? "Save" : "Create draft"}
          </Button>
          {editingId && (
            <Button type="button" variant="outline" onClick={cancelEdit}>
              Cancel
            </Button>
          )}
        </div>
      </form>

      <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Used by</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rubrics.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-slate-500">
                  No rubrics yet.
                </td>
              </tr>
            )}
            {rubrics.map((row) => {
              const consumers = consumersForRubric(evidenceModels, row.id);
              return (
                <tr key={row.id} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">
                    {consumers.length ? `${consumers.length} EM(s)` : "—"}
                  </td>
                  <td className="space-x-2 px-3 py-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => startEdit(row)}>
                      Edit
                    </Button>
                    {row.status !== "confirmed" && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={confirmPending}
                        onClick={() => onConfirm?.(row.id)}
                      >
                        Confirm
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={deletePending}
                      onClick={() => {
                        if (consumers.length) {
                          toast.error(
                            `Cannot delete: cited by ${consumers.length} Evidence Model(s).`
                          );
                          return;
                        }
                        onDelete?.(row.id);
                      }}
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
    </div>
  );
}

export default function RubricBuilder() {
  const { data: rubrics = [], isLoading, error } = useRubrics();
  const { data: evidenceModels = [] } = useEvidenceModels();
  const createMut = useCreateRubric();
  const updateMut = useUpdateRubric();
  const confirmMut = useConfirmRubric();
  const deleteMut = useDeleteRubric();

  if (isLoading) {
    return <p className="p-4 text-sm text-slate-500">Loading rubrics…</p>;
  }
  if (error) {
    return (
      <p className="p-4 text-sm text-red-600">
        {apiErrorMessage(error, "Failed to load rubrics")}
      </p>
    );
  }

  return (
    <RubricLibraryView
      rubrics={rubrics}
      evidenceModels={evidenceModels}
      createPending={createMut.isPending}
      updatePending={updateMut.isPending}
      confirmPending={confirmMut.isPending}
      deletePending={deleteMut.isPending}
      onCreate={async (payload) => {
        try {
          await createMut.mutateAsync(payload);
          toast.success("Rubric draft created");
        } catch (err) {
          toast.error(apiErrorMessage(err, "Create failed"));
          throw err;
        }
      }}
      onUpdate={async ({ id, payload }) => {
        try {
          await updateMut.mutateAsync({ id, payload });
          toast.success("Rubric updated");
        } catch (err) {
          toast.error(apiErrorMessage(err, "Update failed"));
          throw err;
        }
      }}
      onConfirm={async (id) => {
        try {
          await confirmMut.mutateAsync(id);
          toast.success("Rubric confirmed");
        } catch (err) {
          toast.error(apiErrorMessage(err, "Confirm failed"));
        }
      }}
      onDelete={async (id) => {
        try {
          await deleteMut.mutateAsync(id);
          toast.success("Rubric deleted");
        } catch (err) {
          toast.error(apiErrorMessage(err, "Delete failed"));
        }
      }}
    />
  );
}
