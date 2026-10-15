// src/components/domainAnalyses/DomainAnalysisEditor.jsx
//
// D142. A correction form for a Domain Analysis that was uploaded as
// JSON. Not a wizard. Confirm still authorises no student delivery.

import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/api/apiClient";
import {
  useDomainAnalyses,
  useCreateDomainAnalysis,
  useUpdateDomainAnalysis,
  useConfirmDomainAnalysis,
} from "@/api/queries/domainAnalyses";
import { domainAnalysisReadiness } from "@/utils/domainAnalysisReadiness";
import { DOMAIN_ANALYSIS_ENTITIES } from "@/utils/schema";
import { PSYCHOLOGICAL_PERSPECTIVES } from "@/utils/ecdVocabulary";
import { useQMatrixModels } from "@/api/queries/qMatrixModels";

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

const SECTION_HINT = {
  valuedWork: "Important things people do in this domain.",
  taskFeatures: "Features of situations that matter.",
  representationalForms: "Ways information is represented.",
  performanceOutcomes: "What good performance looks like.",
  valuedKnowledge: "Knowledge and skill the domain values. Not a curricular policy.",
  knowledgeStructure: "How that knowledge is organized.",
  knowledgeTaskRelationships: "How knowledge is brought to bear on tasks. Not a Q-matrix.",
};

function linesToRows(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((label) => ({ label }));
}

function rowsToLines(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => (row && row.label ? String(row.label) : ""))
    .filter(Boolean)
    .join("\n");
}

function emptyForm() {
  const sections = {};
  for (const { field } of DOMAIN_ANALYSIS_ENTITIES) sections[field] = "";
  return { name: "", psychologicalPerspective: "", ...sections };
}

function formFromRow(row) {
  const sections = {};
  for (const { field } of DOMAIN_ANALYSIS_ENTITIES) {
    sections[field] = rowsToLines(row[field]);
  }
  return {
    name: row.name || "",
    psychologicalPerspective: row.psychologicalPerspective || "",
    ...sections,
  };
}

function payloadFromForm(form) {
  const payload = {
    name: form.name.trim(),
    psychologicalPerspective: form.psychologicalPerspective || undefined,
  };
  for (const { field } of DOMAIN_ANALYSIS_ENTITIES) {
    payload[field] = linesToRows(form[field]);
  }
  return payload;
}

export default function DomainAnalysisEditor() {
  const { data: rows = [], isLoading } = useDomainAnalyses();
  const { data: qMatrices = [] } = useQMatrixModels();
  const [searchParams, setSearchParams] = useSearchParams();
  const createAnalysis = useCreateDomainAnalysis();
  const updateAnalysis = useUpdateDomainAnalysis();
  const confirmAnalysis = useConfirmDomainAnalysis();
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const payload = payloadFromForm(form);
  const confirmCheck = domainAnalysisReadiness(
    { ...payload, status: "confirmed" },
    { strict: true }
  );
  const saving = createAnalysis.isPending || updateAnalysis.isPending;

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startNew() {
    setEditingId(null);
    setForm(emptyForm());
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm(formFromRow(row));
  }

  async function save() {
    try {
      if (editingId) {
        await updateAnalysis.mutateAsync({ id: editingId, payload });
        toast.success("Domain Analysis saved.");
      } else {
        const created = await createAnalysis.mutateAsync(payload);
        setEditingId(created.id);
        toast.success("Domain Analysis draft saved.");
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not save the Domain Analysis."));
    }
  }

  async function confirm() {
    if (!editingId) return;
    try {
      await updateAnalysis.mutateAsync({ id: editingId, payload });
      await confirmAnalysis.mutateAsync(editingId);
      toast.success("Domain Analysis confirmed. It authorises no student delivery.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not confirm the Domain Analysis."));
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <section aria-label="Domain analyses">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Domain Analysis</h2>
          <Button type="button" variant="outline" onClick={startNew}>
            New
          </Button>
        </div>
        {isLoading ? <p className="text-sm text-slate-600">Loading…</p> : null}
        {!isLoading && rows.length === 0 ? (
          <p className="text-sm text-slate-600">
            No domain analyses yet. Upload a JSON file under Settings → Data, or start one here.
          </p>
        ) : null}
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm"
                onClick={() => startEdit(row)}
              >
                <span className="font-medium text-slate-900">{row.name}</span>
                <span className="mt-1 block text-xs text-slate-600">{row.status}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <p className="text-sm text-slate-600">
          One statement per line. Valued knowledge is not a curricular policy. Knowledge–task lines are not Q-matrix cells.
        </p>
        {editingId ? (
          <section aria-label="Q-matrices for this analysis" className="rounded-md border border-slate-200 p-3">
            <h3 className="text-sm font-medium text-slate-900">Q-matrices</h3>
            <p className="mt-1 text-sm text-slate-600">
              A Q-matrix keeps its own id and its competency model. It can name this analysis. It is not copied into the statements above.
            </p>
            <ul className="mt-2 space-y-1 text-sm text-slate-800">
              {qMatrices.filter((row) => row.domainAnalysisId === editingId).map((row) => (
                <li key={row.id}>{row.name}</li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.set("tab", "qmatrix");
                next.set("domainAnalysisId", editingId);
                setSearchParams(next);
              }}
            >
              Author a Q-matrix for this analysis
            </Button>
          </section>
        ) : null}
        <label className="block text-sm font-medium text-slate-900">
          Name
          <input
            className={`${inputClass} mt-1`}
            value={form.name}
            onChange={(event) => setField("name", event.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-slate-900">
          Psychological perspective
          <select
            className={`${inputClass} mt-1`}
            value={form.psychologicalPerspective}
            onChange={(event) => setField("psychologicalPerspective", event.target.value)}
          >
            <option value="">Not declared yet</option>
            {PSYCHOLOGICAL_PERSPECTIVES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {DOMAIN_ANALYSIS_ENTITIES.map((section) => (
          <label key={section.field} className="block text-sm font-medium text-slate-900">
            {section.padi}
            <span className="mt-0.5 block text-xs font-normal text-slate-600">
              {SECTION_HINT[section.field]}
            </span>
            <textarea
              className={`${inputClass} mt-1 min-h-24`}
              aria-label={section.padi}
              value={form[section.field]}
              onChange={(event) => setField(section.field, event.target.value)}
            />
          </label>
        ))}
        {!confirmCheck.ready ? (
          <ul className="list-disc pl-5 text-sm text-slate-700">
            {confirmCheck.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={saving || !form.name.trim()}>
            Save draft
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!editingId || !confirmCheck.ready || confirmAnalysis.isPending}
            onClick={confirm}
          >
            Confirm
          </Button>
        </div>
      </form>
    </div>
  );
}
