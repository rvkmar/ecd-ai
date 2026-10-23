// src/components/workProducts/WorkProductBuilder.jsx
//
// D121 library: Work Products as typed reusable records. Items bind via
// interaction.workProductId. Evidence models cite the same id on
// evaluation procedures. Design patterns list it under potential work
// products. No CAF lifecycle.
//
// The default export is the three-tab shell (Dashboard, Work Product
// Structure, Manage Work Products). WorkProductLibraryView is the create
// and edit form. Manage opens that form for New, Edit, and Duplicate.
// There is no clone route, so Duplicate prefills a new record whose name
// is unique case-insensitively.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/Modal";
import WorkedExample from "@/components/authoring/WorkedExample";
import { apiErrorMessage } from "@/api/apiClient";
import {
  useWorkProducts,
  useCreateWorkProduct,
  useUpdateWorkProduct,
  useDeleteWorkProduct,
} from "@/api/queries/workProducts";
import { useItems } from "@/api/queries/items";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { WORK_PRODUCT_TYPES } from "@/utils/ecdVocabulary";
import ModelManageList, {
  manageOpenButtonClass,
  manageQuietButtonClass,
  manageDangerButtonClass,
  manageSecondaryButtonClass,
} from "@/components/shared/ModelManageList";
import ModelTabShell from "@/components/shared/ModelTabShell";
import WorkProductDashboard from "./WorkProductDashboard";
import WorkProductTable from "./WorkProductTable";
import {
  consumersForWorkProduct,
  nameList,
  readinessText,
  recordLabel,
  uniqueWorkProductCopyName,
  usageCounts,
  usageSummary,
  workProductDeleteBlockedMessage,
  workProductReadinessValue,
  workProductTypeText,
} from "./workProductUsage";

export { consumersForWorkProduct } from "./workProductUsage";

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

const TYPE_FACET = {
  ariaLabel: "Filter by type",
  allLabel: "All types",
  options: WORK_PRODUCT_TYPES.map((type) => ({ value: type.value, label: type.label })),
  valueOf: (record) => record.type || "",
};

const emptyForm = () => ({
  name: "",
  description: "",
  type: "selected_response",
});

function formFromRow(row) {
  return {
    name: row.name || "",
    description: row.description || "",
    type: row.type || "",
  };
}

function WorkProductExample() {
  return (
    <WorkedExample
      title="Selected plant-part name"
      lines={[
        "Type: selected response.",
        "The name the student chooses for the indicated part on a diagram.",
      ]}
      citedBy="an Item, as interaction.workProductId. A Design Pattern may also list it as a possible work product"
    />
  );
}

function TypeBadge({ record }) {
  return (
    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
      {workProductTypeText(record.type)}
    </span>
  );
}

/** Presentational form. Storybook / tests drive it without API hooks. */
export function WorkProductLibraryView({
  workProducts = [],
  items = [],
  evidenceModels = [],
  designPatterns = [],
  onCreate,
  onUpdate,
  createPending = false,
  updatePending = false,
  onDismiss = null,
  initialForm = null,
  focusId = null,
}) {
  const [form, setForm] = useState(() =>
    initialForm ? { ...emptyForm(), ...initialForm } : emptyForm()
  );
  const [editingId, setEditingId] = useState(null);
  const appliedFocus = useRef(null);

  useEffect(() => {
    if (!focusId || appliedFocus.current === focusId) return;
    const row = workProducts.find((item) => item.id === focusId);
    if (!row) return;
    appliedFocus.current = focusId;
    setEditingId(row.id);
    setForm(formFromRow(row));
  }, [focusId, workProducts]);

  const editing = useMemo(
    () => (editingId ? workProducts.find((row) => row.id === editingId) : null),
    [editingId, workProducts]
  );

  const context = useMemo(
    () => ({ items, evidenceModels, designPatterns }),
    [items, evidenceModels, designPatterns]
  );
  const usage = editing ? usageCounts(editing, context) : null;
  const typeLocked = Boolean(usage && usage.items.length > 0);

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (typeLocked && editing && form.type !== (editing.type || "")) {
      toast.error(
        `Cannot change Work Product type while ${usage.items.length} item(s) bind it.`
      );
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      type: form.type,
    };
    try {
      if (editingId) {
        await onUpdate?.({ id: editingId, payload });
      } else {
        await onCreate?.(payload);
      }
      if (onDismiss) onDismiss();
      else if (editingId) cancelEdit();
      else setForm(emptyForm());
    } catch {
      // The container already toasted the server error.
    }
  }

  const embedded = Boolean(onDismiss);

  return (
    <div className={embedded ? "space-y-6 p-6" : "space-y-6 p-4"}>
      {embedded ? (
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              {editing?.name || form.name.trim() || "New Work Product"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              What the examinee produces. Type is the observable response mode.
              Items bind it on the interaction.
            </p>
          </div>
          <button type="button" onClick={onDismiss} className={manageSecondaryButtonClass}>
            Back to list
          </button>
        </div>
      ) : (
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Work Products
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            What the examinee produces (PADI). Distinct from the interaction
            widget that captures it. Type vocabulary is the observable response
            modes, one definition. Bind on an item via interaction.workProductId.
            No CAF lifecycle on these records.
          </p>
        </div>
      )}

      {workProducts.length === 0 && <WorkProductExample />}

      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40"
      >
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {editingId ? `Edit ${editing?.name || editingId}` : "New Work Product"}
        </h3>

        {editingId && usage && (
          <div
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
            data-testid="wp-consumers-before-edit"
          >
            <p>
              <span className="font-medium">Items: </span>
              {nameList(usage.items)}
            </p>
            <p>
              <span className="font-medium">Evidence models: </span>
              {nameList(usage.evidenceModels)}
            </p>
            <p>
              <span className="font-medium">Design patterns: </span>
              {nameList(usage.designPatterns)}
            </p>
            <p className="mt-1">
              {typeLocked
                ? "Type cannot change while items bind this work product."
                : "No items bind this work product. The type can change."}
            </p>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Name</span>
            <input
              className={inputClass}
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Type</span>
            <select
              className={inputClass}
              value={form.type}
              onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
              required
              disabled={typeLocked}
            >
              {!form.type ? <option value="">Select a type</option> : null}
              {WORK_PRODUCT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Description</span>
          <textarea
            className={inputClass}
            rows={2}
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
          />
        </label>

        <div className="flex gap-2">
          <Button type="submit" disabled={createPending || updatePending}>
            {editingId ? "Save" : "Create"}
          </Button>
          {(editingId || onDismiss) && (
            <Button
              type="button"
              variant="outline"
              onClick={() => (onDismiss ? onDismiss() : cancelEdit())}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function WorkProductManage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get("focus");
  const [screen, setScreen] = useState(focusId ? "edit" : "list");
  const [seedForm, setSeedForm] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const { data: workProducts = [], isLoading, error } = useWorkProducts();
  const { data: items = [] } = useItems();
  const { data: evidenceModels = [] } = useEvidenceModels();
  const { data: designPatterns = [] } = useDesignPatterns();
  const createMut = useCreateWorkProduct();
  const updateMut = useUpdateWorkProduct();
  const deleteMut = useDeleteWorkProduct();

  const context = useMemo(
    () => ({ items, evidenceModels, designPatterns }),
    [items, evidenceModels, designPatterns]
  );

  useEffect(() => {
    if (focusId) setScreen("edit");
  }, [focusId]);

  function clearFocus() {
    if (!searchParams.get("focus")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    setSearchParams(next, { replace: true });
  }

  function backToList() {
    clearFocus();
    setSeedForm(null);
    setScreen("list");
  }

  function openCreate() {
    clearFocus();
    setSeedForm(null);
    setScreen("create");
  }

  function openEdit(row) {
    const next = new URLSearchParams(searchParams);
    next.set("focus", row.id);
    setSearchParams(next);
    setSeedForm(null);
    setScreen("edit");
  }

  function openDuplicate(row) {
    clearFocus();
    setSeedForm({
      name: uniqueWorkProductCopyName(row.name, workProducts),
      description: row.description || "",
      type: row.type || "",
    });
    setScreen("create");
  }

  function askDelete(row) {
    const bound = consumersForWorkProduct(items, row.id);
    if (bound.length) {
      toast.error(workProductDeleteBlockedMessage(bound));
      return;
    }
    setPendingDelete(row);
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <h2 className="mb-4 text-2xl font-semibold">Manage Work Products</h2>
        <p className="text-sm text-slate-500">Loading work products...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h2 className="mb-4 text-2xl font-semibold">Manage Work Products</h2>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {apiErrorMessage(error, "Failed to load Work Products")}
        </div>
      </div>
    );
  }

  if (screen === "create" || screen === "edit") {
    return (
      <WorkProductLibraryView
        key={
          screen === "edit"
            ? `edit-${focusId || "record"}`
            : `create-${seedForm?.name || "blank"}`
        }
        workProducts={workProducts}
        items={items}
        evidenceModels={evidenceModels}
        designPatterns={designPatterns}
        focusId={screen === "edit" ? focusId : null}
        initialForm={screen === "create" ? seedForm : null}
        onDismiss={backToList}
        createPending={createMut.isPending}
        updatePending={updateMut.isPending}
        onCreate={async (payload) => {
          try {
            const created = await createMut.mutateAsync(payload);
            toast.success("Work Product created");
            return created;
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
      />
    );
  }

  return (
    <>
      {workProducts.length === 0 ? <div className="px-6 pt-6"><WorkProductExample /></div> : null}
      <ModelManageList
        title="Manage Work Products"
        description="What the examinee produces. Type is the observable response mode. Items bind a work product on the interaction. These records have no lifecycle status."
        newLabel="New Work Product"
        onCreate={openCreate}
        records={workProducts}
        emptyMessage="No Work Products defined yet."
        filteredEmptyMessage="No Work Products match the current filters."
        facet={TYPE_FACET}
        renderBadge={(row) => <TypeBadge record={row} />}
        searchLabel="Search work products"
        searchPlaceholder="Search work products..."
        searchText={(row) => {
          const counts = usageCounts(row, context);
          return [
            row.name,
            row.description,
            workProductTypeText(row.type),
            ...counts.items.map((item) => recordLabel(item)),
            ...counts.evidenceModels.map((model) => recordLabel(model)),
            ...counts.designPatterns.map((pattern) => recordLabel(pattern)),
          ]
            .filter(Boolean)
            .join(" ");
        }}
        readinessOf={workProductReadinessValue}
        renderMeta={(row) => {
          const ready = workProductReadinessValue(row) === "ready";
          return (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide ${
                  ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {ready ? "Ready" : "Not ready"}
              </span>
              <span>{usageSummary(row, context)}</span>
            </div>
          );
        }}
        renderDetails={(row) => {
          const counts = usageCounts(row, context);
          return (
            <>
              <p className="leading-relaxed text-slate-600">
                {String(row.description || "").trim() || "No description yet."}
              </p>
              <p className="leading-relaxed text-slate-600">
                Items: {nameList(counts.items)}. Evidence models:{" "}
                {nameList(counts.evidenceModels)}. Design patterns:{" "}
                {nameList(counts.designPatterns)}.
              </p>
              <p className="leading-relaxed text-slate-600">{readinessText(row)}.</p>
            </>
          );
        }}
        renderActions={(row) => {
          const bound = consumersForWorkProduct(items, row.id);
          return (
            <>
              <button type="button" onClick={() => openEdit(row)} className={manageOpenButtonClass}>
                Edit
              </button>
              <button
                type="button"
                onClick={() => openDuplicate(row)}
                className={manageQuietButtonClass}
                title="Open the create form with this work product copied"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => askDelete(row)}
                disabled={deleteMut.isPending || bound.length > 0}
                className={manageDangerButtonClass}
                title={
                  bound.length
                    ? "Unbind items before deleting"
                    : "Delete this work product"
                }
              >
                Delete
              </button>
            </>
          );
        }}
      />
      <Modal
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          const bound = consumersForWorkProduct(items, pendingDelete.id);
          if (bound.length) {
            toast.error(workProductDeleteBlockedMessage(bound));
            setPendingDelete(null);
            return;
          }
          try {
            await deleteMut.mutateAsync(pendingDelete.id);
            toast.success("Work Product deleted");
          } catch (err) {
            toast.error(apiErrorMessage(err, "Delete failed"));
          }
          setPendingDelete(null);
        }}
        title="Delete Work Product"
        message={
          pendingDelete
            ? `Delete "${pendingDelete.name || pendingDelete.id}"? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        confirmClass="bg-red-600 hover:bg-red-700 text-white"
      />
    </>
  );
}

export default function WorkProductBuilder() {
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get("focus");
  const [mode, setMode] = useState(focusId ? "manage" : "dashboard");

  useEffect(() => {
    if (focusId) setMode("manage");
  }, [focusId]);

  return (
    <ModelTabShell
      mode={mode}
      onModeChange={setMode}
      tabs={[
        { id: "dashboard", label: "Dashboard", panel: <WorkProductDashboard /> },
        { id: "structure", label: "Work Product Structure", panel: <WorkProductTable /> },
        { id: "manage", label: "Manage Work Products", panel: <WorkProductManage /> },
      ]}
    />
  );
}
