// src/components/designPatterns/DesignPatternBuilder.jsx
//
// D133 / W27: narrative half of the design-pattern wizard.
// Title, Summary, Rationale, Focal KSAs, Additional KSAs.
// Potential observations, work products, rubrics, and feature menus
// are D134. Confirming still authorises no student delivery (ADR 0009).

import React, { useMemo, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/api/apiClient";
import {
  useDesignPatterns,
  useCreateDesignPattern,
  useUpdateDesignPattern,
  useConfirmDesignPattern,
  useDeleteDesignPattern,
} from "@/api/queries/designPatterns";
import { designPatternReadiness } from "@/utils/designPatternReadiness";

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

function labelledEntries(entries) {
  return (entries || [])
    .map((entry) => ({ label: String(entry?.label || "").trim() }))
    .filter((entry) => entry.label);
}

const emptyForm = () => ({
  name: "",
  summary: "",
  rationale: "",
  focalKsas: [],
  additionalKsas: [],
});

function formFromRow(row) {
  return {
    name: row.name || "",
    summary: row.summary || "",
    rationale: row.rationale || "",
    focalKsas: (row.focalKsas || []).map((entry) => ({ label: entry.label || "" })),
    additionalKsas: (row.additionalKsas || []).map((entry) => ({
      label: entry.label || "",
    })),
  };
}

export function designPatternPayload(form) {
  return {
    name: form.name.trim(),
    summary: form.summary.trim(),
    rationale: form.rationale.trim(),
    focalKsas: labelledEntries(form.focalKsas),
    additionalKsas: labelledEntries(form.additionalKsas),
  };
}

function LabelList({ legend, values, onChange }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm text-slate-700">{legend}</legend>
      {values.map((entry, index) => (
        <div key={`${legend}-${index}`} className="flex gap-2">
          <input
            className={inputClass}
            aria-label={`${legend} ${index + 1}`}
            value={entry.label}
            onChange={(event) => {
              const next = values.slice();
              next[index] = { label: event.target.value };
              onChange(next);
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange(values.filter((_, i) => i !== index))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() => onChange([...values, { label: "" }])}
      >
        Add {legend}
      </Button>
    </fieldset>
  );
}

/** Presentational — tests drive this without API hooks. */
export function DesignPatternLibraryView({
  patterns = [],
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
  const [serverError, setServerError] = useState("");

  const editing = useMemo(
    () => (editingId ? patterns.find((row) => row.id === editingId) : null),
    [editingId, patterns]
  );

  const payload = designPatternPayload(form);
  const draftCheck = designPatternReadiness(
    { ...payload, status: "draft" },
    { strict: false }
  );
  const confirmCheck = designPatternReadiness(
    { ...payload, status: editing?.status || "draft" },
    { strict: true }
  );

  function patchForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
    setServerError("");
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm(formFromRow(row));
    setServerError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setServerError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setServerError("");
    if (!draftCheck.ready) {
      setServerError(draftCheck.errors[0] || "Save failed");
      return;
    }
    try {
      if (editingId) {
        await onUpdate({ id: editingId, payload });
      } else {
        const created = await onCreate(payload);
        if (created?.id) {
          setEditingId(created.id);
          setForm(formFromRow(created));
        }
      }
    } catch (err) {
      setServerError(apiErrorMessage(err, "Save failed"));
    }
  }

  async function handleConfirm() {
    if (!editingId || !confirmCheck.ready) return;
    setServerError("");
    try {
      await onUpdate({ id: editingId, payload });
      await onConfirm(editingId);
      cancelEdit();
    } catch (err) {
      setServerError(apiErrorMessage(err, "Confirm failed"));
    }
  }

  const busy = createPending || updatePending || confirmPending;

  return (
    <div className="space-y-6 p-4">
      <header>
        <h2 className="text-lg font-semibold text-slate-900">Design Patterns</h2>
        <p className="mt-1 text-sm text-slate-600">
          Write the argument: title, summary, rationale, and the KSAs it
          centres. A confirmed pattern may be referenced by later seeding.
          It does not authorise a student session. Observation, work-product,
          rubric, and feature menus come next.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium text-slate-800">
            {editingId ? `Edit ${editing?.name || editingId}` : "New design pattern"}
          </h3>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">Title</span>
              <input
                className={inputClass}
                value={form.name}
                onChange={(event) => patchForm({ name: event.target.value })}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">Summary</span>
              <textarea
                className={inputClass}
                rows={3}
                value={form.summary}
                onChange={(event) => patchForm({ summary: event.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">Rationale</span>
              <textarea
                className={inputClass}
                rows={4}
                value={form.rationale}
                onChange={(event) => patchForm({ rationale: event.target.value })}
              />
            </label>
            <LabelList
              legend="Focal KSAs"
              values={form.focalKsas}
              onChange={(focalKsas) => patchForm({ focalKsas })}
            />
            <LabelList
              legend="Additional KSAs"
              values={form.additionalKsas}
              onChange={(additionalKsas) => patchForm({ additionalKsas })}
            />
            {serverError ? (
              <p className="text-sm text-red-600" role="alert">
                {serverError}
              </p>
            ) : null}
            {!confirmCheck.ready ? (
              <ul className="list-disc pl-5 text-sm text-slate-600">
                {confirmCheck.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || !draftCheck.ready}>
                {editingId ? "Save" : "Create draft"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!editingId || busy || !confirmCheck.ready}
                onClick={handleConfirm}
              >
                Confirm
              </Button>
              {editingId ? (
                <Button type="button" variant="outline" onClick={cancelEdit}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium text-slate-800">Library</h3>
          {patterns.length === 0 ? (
            <p className="text-sm text-slate-500">No design patterns yet.</p>
          ) : (
            <ul className="space-y-3">
              {patterns.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{row.name}</p>
                    <p className="text-xs text-slate-500">{row.status}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => startEdit(row)}>
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={deletePending}
                      onClick={async () => {
                        try {
                          await onDelete(row.id);
                          if (editingId === row.id) cancelEdit();
                        } catch {
                          /* toast in container */
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default function DesignPatternBuilder() {
  const { data: patterns = [], isLoading, error } = useDesignPatterns();
  const createMut = useCreateDesignPattern();
  const updateMut = useUpdateDesignPattern();
  const confirmMut = useConfirmDesignPattern();
  const deleteMut = useDeleteDesignPattern();

  if (isLoading) {
    return <p className="p-4 text-sm text-slate-500">Loading design patterns…</p>;
  }
  if (error) {
    return (
      <p className="p-4 text-sm text-red-600">
        {apiErrorMessage(error, "Failed to load design patterns")}
      </p>
    );
  }

  return (
    <DesignPatternLibraryView
      patterns={patterns}
      createPending={createMut.isPending}
      updatePending={updateMut.isPending}
      confirmPending={confirmMut.isPending}
      deletePending={deleteMut.isPending}
      onCreate={async (payload) => {
        try {
          const created = await createMut.mutateAsync(payload);
          toast.success("Design pattern created");
          return created;
        } catch (err) {
          toast.error(apiErrorMessage(err, "Create failed"));
          throw err;
        }
      }}
      onUpdate={async ({ id, payload }) => {
        try {
          await updateMut.mutateAsync({ id, payload });
          toast.success("Design pattern saved");
        } catch (err) {
          toast.error(apiErrorMessage(err, "Save failed"));
          throw err;
        }
      }}
      onConfirm={async (id) => {
        try {
          await confirmMut.mutateAsync(id);
          toast.success("Design pattern confirmed");
        } catch (err) {
          toast.error(apiErrorMessage(err, "Confirm failed"));
          throw err;
        }
      }}
      onDelete={async (id) => {
        try {
          await deleteMut.mutateAsync(id);
          toast.success("Design pattern deleted");
        } catch (err) {
          toast.error(apiErrorMessage(err, "Delete failed"));
          throw err;
        }
      }}
    />
  );
}
