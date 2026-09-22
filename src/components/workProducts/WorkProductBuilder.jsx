// src/components/workProducts/WorkProductBuilder.jsx
//
// D121 library: Work Products as typed reusable records. Items bind via
// interaction.workProductId. No CAF lifecycle.

import React, { useMemo, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/api/apiClient";
import {
  useWorkProducts,
  useCreateWorkProduct,
  useUpdateWorkProduct,
  useDeleteWorkProduct,
} from "@/api/queries/workProducts";
import { useItems } from "@/api/queries/items";
import {
  WORK_PRODUCT_TYPES,
  workProductTypeLabel,
} from "@/utils/ecdVocabulary";

export function consumersForWorkProduct(items, workProductId) {
  if (!workProductId) return [];
  return (items || []).filter(
    (item) => item?.interaction?.workProductId === workProductId
  );
}

const emptyForm = () => ({
  name: "",
  description: "",
  type: "selected_response",
});

function formFromRow(row) {
  return {
    name: row.name || "",
    description: row.description || "",
    type: row.type || "selected_response",
  };
}

/** Presentational library — Storybook / tests drive without API hooks. */
export function WorkProductLibraryView({
  workProducts = [],
  items = [],
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
    () => (editingId ? workProducts.find((v) => v.id === editingId) : null),
    [editingId, workProducts]
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
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      type: form.type,
    };
    if (editingId) {
      await onUpdate?.({ id: editingId, payload });
      cancelEdit();
    } else {
      await onCreate?.(payload);
      setForm(emptyForm());
    }
  }

  function handleDelete(row) {
    const consumers = consumersForWorkProduct(items, row.id);
    if (consumers.length) {
      const names = consumers
        .map((it) => it.name || it.id)
        .slice(0, 8)
        .join(", ");
      toast.error(
        `Cannot delete: bound by ${consumers.length} item(s) — ${names}${
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
          Work Products
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          What the examinee produces (PADI). Distinct from the interaction
          widget that captures it. Type vocabulary is the observable response
          modes — one definition. Bind on an item via interaction.workProductId.
          No CAF lifecycle on these records.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40"
      >
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {editingId ? `Edit ${editing?.name || editingId}` : "New Work Product"}
        </h3>

        {editingId && (
          <div
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
            data-testid="wp-consumers-before-edit"
          >
            <span className="font-medium">Bound items: </span>
            {(() => {
              const consumers = consumersForWorkProduct(items, editingId);
              if (!consumers.length) return "none — safe to edit type.";
              return consumers.map((it) => it.name || it.id).join("; ");
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
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              required
            >
              {WORK_PRODUCT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Description</span>
          <textarea
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </label>

        <div className="flex gap-2">
          <Button type="submit" disabled={createPending || updatePending}>
            {editingId ? "Save" : "Create"}
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
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Used by</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {workProducts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-slate-500">
                  No Work Products yet.
                </td>
              </tr>
            )}
            {workProducts.map((row) => {
              const consumers = consumersForWorkProduct(items, row.id);
              return (
                <tr
                  key={row.id}
                  className="border-t border-slate-200 dark:border-slate-700"
                >
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">{workProductTypeLabel(row.type)}</td>
                  <td className="px-3 py-2">
                    {consumers.length
                      ? `${consumers.length} item(s)`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 space-x-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => startEdit(row)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
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
    </div>
  );
}

export default function WorkProductBuilder() {
  const { data: workProducts = [], isLoading, error } = useWorkProducts();
  const { data: items = [] } = useItems();
  const createMut = useCreateWorkProduct();
  const updateMut = useUpdateWorkProduct();
  const deleteMut = useDeleteWorkProduct();

  if (isLoading) {
    return (
      <p className="p-4 text-sm text-slate-500">Loading Work Products…</p>
    );
  }
  if (error) {
    return (
      <p className="p-4 text-sm text-red-600">
        {apiErrorMessage(error, "Failed to load Work Products")}
      </p>
    );
  }

  return (
    <WorkProductLibraryView
      workProducts={workProducts}
      items={items}
      createPending={createMut.isPending}
      updatePending={updateMut.isPending}
      deletePending={deleteMut.isPending}
      onCreate={async (payload) => {
        try {
          await createMut.mutateAsync(payload);
          toast.success("Work Product created");
        } catch (err) {
          toast.error(apiErrorMessage(err, "Create failed"));
          throw err;
        }
      }}
      onUpdate={async ({ id, payload }) => {
        try {
          await updateMut.mutateAsync({ id, payload });
          toast.success("Work Product updated");
        } catch (err) {
          toast.error(apiErrorMessage(err, "Update failed"));
          throw err;
        }
      }}
      onDelete={async (id) => {
        try {
          await deleteMut.mutateAsync(id);
          toast.success("Work Product deleted");
        } catch (err) {
          toast.error(apiErrorMessage(err, "Delete failed"));
        }
      }}
    />
  );
}
