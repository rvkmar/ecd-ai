// Empirical validity evidence for one evidence model.
// Response process, internal structure, relations, and consequences.
// TU4 fit results appear here as internal-structure rows.

import React, { useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { apiErrorMessage } from "@/api/apiClient";
import {
  useCreateValidityEvidence,
  useDeleteValidityEvidence,
  useUpdateValidityEvidence,
  useValidityEvidence,
} from "@/api/queries/validityEvidence";
import {
  TU4_FIT_SOURCE,
  VALIDITY_EVIDENCE_TYPES,
  VALIDITY_EVIDENCE_TYPE_LABELS,
} from "@/utils/validityEvidence";

const fieldClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400";

const EMPTY = {
  type: "response-process",
  summary: "",
  body: "",
  source: "",
  warrantIds: [],
  alternativeExplanationIndexes: [],
};

function formatWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

export default function ValidityEvidencePanel({ evidenceModel }) {
  const { auth } = useAuth() || {};
  const canAuthor = auth?.role === "admin" || auth?.role === "district";
  const evidenceModelId = evidenceModel?.id || "";
  const { data: rows = [], isLoading, error } = useValidityEvidence(evidenceModelId);
  const createRow = useCreateValidityEvidence(evidenceModelId);
  const updateRow = useUpdateValidityEvidence(evidenceModelId);
  const deleteRow = useDeleteValidityEvidence(evidenceModelId);
  const [draft, setDraft] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const warrants = Array.isArray(evidenceModel?.warrants) ? evidenceModel.warrants : [];
  const explanations = Array.isArray(evidenceModel?.alternativeExplanations)
    ? evidenceModel.alternativeExplanations
    : [];

  const grouped = useMemo(() => {
    const buckets = Object.fromEntries(VALIDITY_EVIDENCE_TYPES.map((type) => [type, []]));
    for (const row of rows || []) {
      if (!buckets[row.type]) buckets[row.type] = [];
      buckets[row.type].push(row);
    }
    return buckets;
  }, [rows]);

  function toggleWarrant(id) {
    setDraft((prev) => {
      const has = prev.warrantIds.includes(id);
      return {
        ...prev,
        warrantIds: has ? prev.warrantIds.filter((item) => item !== id) : [...prev.warrantIds, id],
      };
    });
  }

  function toggleExplanation(index) {
    setDraft((prev) => {
      const has = prev.alternativeExplanationIndexes.includes(index);
      return {
        ...prev,
        alternativeExplanationIndexes: has
          ? prev.alternativeExplanationIndexes.filter((item) => item !== index)
          : [...prev.alternativeExplanationIndexes, index],
      };
    });
  }

  function startEdit(row) {
    setEditingId(row.id);
    setFormError("");
    setDraft({
      type: row.type,
      summary: row.summary || "",
      body: row.body || "",
      source: row.source || "",
      warrantIds: Array.isArray(row.warrantIds) ? row.warrantIds : [],
      alternativeExplanationIndexes: Array.isArray(row.alternativeExplanationIndexes)
        ? row.alternativeExplanationIndexes
        : [],
    });
  }

  function resetForm() {
    setEditingId(null);
    setDraft(EMPTY);
    setFormError("");
  }

  async function onSubmit(event) {
    event.preventDefault();
    setFormError("");
    const payload = {
      evidenceModelId,
      type: draft.type,
      summary: draft.summary.trim(),
      body: draft.body,
      source: draft.source.trim(),
      warrantIds: draft.warrantIds,
      alternativeExplanationIndexes: draft.alternativeExplanationIndexes,
    };
    try {
      if (editingId) await updateRow.mutateAsync({ id: editingId, payload });
      else await createRow.mutateAsync(payload);
      resetForm();
    } catch (err) {
      setFormError(apiErrorMessage(err, "Could not save validity evidence."));
    }
  }

  if (!evidenceModelId) {
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">Validity evidence</h3>
        <p className="text-sm text-slate-600">
          Save the evidence model before recording response-process, internal-structure, relations, or consequences evidence.
        </p>
      </section>
    );
  }

  const busy = createRow.isPending || updateRow.isPending || deleteRow.isPending;

  return (
    <section className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Validity evidence</h3>
        <p className="mt-1 text-sm text-slate-600">
          Studies that back this evidence model: response processes, internal structure, relations to other variables, and consequences. Fit results from model criticism are linked here as internal structure.
        </p>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading validity evidence…</p>}
      {error && (
        <p className="text-sm text-red-700">{apiErrorMessage(error, "Could not load validity evidence.")}</p>
      )}

      {!isLoading && rows.length === 0 && (
        <p className="text-sm text-slate-600">No validity evidence is recorded for this model yet.</p>
      )}

      {VALIDITY_EVIDENCE_TYPES.map((type) => {
        const list = grouped[type] || [];
        if (!list.length) return null;
        return (
          <div key={type} className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {VALIDITY_EVIDENCE_TYPE_LABELS[type]}
            </h4>
            <ul className="space-y-3">
              {list.map((row) => (
                <li key={row.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
                  <div className="font-medium text-slate-900">{row.summary}</div>
                  {row.body && row.body !== row.summary && (
                    <p className="mt-1 whitespace-pre-wrap text-slate-700">{row.body}</p>
                  )}
                  <p className="mt-2 text-xs text-slate-500">
                    Source: {row.source || "unspecified"}
                    {row.source === TU4_FIT_SOURCE ? " (linked from model-criticism fit)" : ""}
                    {row.author ? ` · ${row.author}` : ""}
                    {row.createdAt ? ` · ${formatWhen(row.createdAt)}` : ""}
                  </p>
                  {Array.isArray(row.warrantIds) && row.warrantIds.length > 0 && (
                    <p className="mt-1 text-xs text-slate-600">Warrants: {row.warrantIds.join(", ")}</p>
                  )}
                  {canAuthor && (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
                        onClick={() => startEdit(row)}
                      >
                        Edit
                      </button>
                      {pendingDeleteId === row.id ? (
                        <button
                          type="button"
                          className="rounded bg-red-600 px-2 py-1 text-xs text-white"
                          onClick={async () => {
                            setFormError("");
                            try {
                              await deleteRow.mutateAsync(row.id);
                              if (editingId === row.id) resetForm();
                              setPendingDeleteId(null);
                            } catch (err) {
                              setFormError(apiErrorMessage(err, "Could not delete validity evidence."));
                            }
                          }}
                        >
                          Confirm delete
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-700"
                          onClick={() => setPendingDeleteId(row.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {canAuthor && (
        <form className="space-y-3 border-t border-slate-200 pt-4" onSubmit={onSubmit}>
          <h4 className="text-sm font-semibold text-slate-900">
            {editingId ? "Edit validity evidence" : "Add validity evidence"}
          </h4>
          <label className="block text-sm text-slate-700">
            Type
            <select
              className={`${fieldClass} mt-1`}
              value={draft.type}
              onChange={(event) => setDraft((prev) => ({ ...prev, type: event.target.value }))}
            >
              {VALIDITY_EVIDENCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {VALIDITY_EVIDENCE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-slate-700">
            Summary
            <input
              className={`${fieldClass} mt-1`}
              value={draft.summary}
              onChange={(event) => setDraft((prev) => ({ ...prev, summary: event.target.value }))}
              required
            />
          </label>
          <label className="block text-sm text-slate-700">
            Body
            <textarea
              className={`${fieldClass} mt-1`}
              rows={3}
              value={draft.body}
              onChange={(event) => setDraft((prev) => ({ ...prev, body: event.target.value }))}
            />
          </label>
          <label className="block text-sm text-slate-700">
            Source
            <input
              className={`${fieldClass} mt-1`}
              value={draft.source}
              onChange={(event) => setDraft((prev) => ({ ...prev, source: event.target.value }))}
              placeholder="Cognitive lab, criterion study, or fit run"
              required
            />
          </label>
          {warrants.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="text-sm text-slate-700">Warrants</legend>
              {warrants.map((warrant) => (
                <label key={warrant.id} className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={draft.warrantIds.includes(warrant.id)}
                    onChange={() => toggleWarrant(warrant.id)}
                  />
                  <span>{warrant.id}</span>
                </label>
              ))}
            </fieldset>
          )}
          {explanations.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="text-sm text-slate-700">Alternative explanations</legend>
              {explanations.map((row, index) => (
                <label key={index} className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={draft.alternativeExplanationIndexes.includes(index)}
                    onChange={() => toggleExplanation(index)}
                  />
                  <span>{row?.text || `Explanation ${index + 1}`}</span>
                </label>
              ))}
            </fieldset>
          )}
          {formError && <p className="text-sm text-red-700">{formError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {editingId ? "Save changes" : "Add evidence"}
            </button>
            {editingId && (
              <button type="button" className="rounded border border-slate-300 px-3 py-1.5 text-sm" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
