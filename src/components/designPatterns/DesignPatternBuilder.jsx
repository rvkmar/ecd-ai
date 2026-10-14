// src/components/designPatterns/DesignPatternBuilder.jsx
//
// D133–D134 / W27: narrative plus menus of possibilities.
// Confirming still authorises no student delivery (ADR 0009).

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
import { useWorkProducts } from "@/api/queries/workProducts";
import { useRubrics } from "@/api/queries/rubrics";
import { useTaskModelVariables } from "@/api/queries/taskModelVariables";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { designPatternReadiness } from "@/utils/designPatternReadiness";

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

/**
 * What each narrative attribute is for. Roles follow the PADI design-pattern
 * attributes (the argument a designer selects), including this project's
 * reading of Rationale and Additional KSAs. Not a second schema.
 */
export const DESIGN_PATTERN_NARRATIVE_GUIDANCE = Object.freeze({
  title:
    "A short name for the pattern a designer selects. It names the argument, not one task or one item.",
  summary:
    "An overview of the family of assessment situations this pattern is about, so a designer can see whether it fits before reading the rest.",
  rationale:
    "Why these KSAs are worth assessing, and what else could give evidence about them. A later copy of the pattern keeps this reasoning. Without it, the pattern is only a prior choice.",
  focalKsas:
    "The knowledge, skills, and abilities this pattern is meant to produce evidence about. They are the construct, not every skill a task happens to use.",
  additionalKsas:
    "Other knowledge, skills, or abilities a task from this pattern may also demand, which are not the target. They are construct-irrelevant demands the designer is choosing to notice. They are not the Task Model fairness notes.",
});

export const DESIGN_PATTERN_MENU_GUIDANCE = Object.freeze({
  framing:
    "These lists are possibilities a later designer chooses from. Listing several does not commit a seeded Evidence Model or Task Model to using all of them.",
  potentialObservations:
    "Kinds of evidence this pattern could produce. They are options, not a promise that every seeded model will use every one.",
  potentialWorkProducts:
    "Work products from the library that a task from this pattern might produce. Choose the object, not a type name.",
  potentialRubrics:
    "Rubrics from the library that could score those work products. Choosing them here does not attach them to an Evidence Model.",
  characteristicFeatures:
    "Features that stay the same across tasks from this pattern. They describe the family; they are not a Task Model yet.",
  variableFeatures:
    "Task Model Variables that can change from one task to another in this family. They are variation, not a single spec.",
});

export function observationChoicesFromModels(evidenceModels = []) {
  const choices = [];
  for (const model of evidenceModels) {
    for (const observable of model.observables || []) {
      if (!observable?.id) continue;
      choices.push({
        id: observable.id,
        name: observable.statement || observable.id,
        source: model.name || model.id,
      });
    }
  }
  return choices;
}

const hintClass = "text-xs leading-5 text-slate-500";

function labelledEntries(entries) {
  return (entries || [])
    .map((entry) => ({ label: String(entry?.label || "").trim() }))
    .filter((entry) => entry.label);
}

function observationEntries(entries) {
  return (entries || [])
    .map((entry) => {
      const label = String(entry?.label || "").trim();
      const observationId = String(entry?.observationId || "").trim();
      if (!label) return null;
      return observationId ? { label, observationId } : { label };
    })
    .filter(Boolean);
}

function libraryEntries(entries, idKey) {
  return (entries || [])
    .map((entry) => {
      const id = String(entry?.[idKey] || "").trim();
      if (!id) return null;
      const row = { label: String(entry?.label || "").trim() || id, [idKey]: id };
      if (idKey === "workProductId" && entry?.workProductType) {
        row.workProductType = entry.workProductType;
      }
      return row;
    })
    .filter(Boolean);
}

const emptyForm = () => ({
  name: "",
  summary: "",
  rationale: "",
  focalKsas: [],
  additionalKsas: [],
  potentialObservations: [],
  potentialWorkProducts: [],
  potentialRubrics: [],
  characteristicFeatures: [],
  variableFeatures: [],
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
    potentialObservations: (row.potentialObservations || []).map((entry) => ({
      label: entry.label || "",
      observationId: entry.observationId || "",
    })),
    potentialWorkProducts: (row.potentialWorkProducts || []).map((entry) => ({
      label: entry.label || "",
      workProductId: entry.workProductId || "",
      workProductType: entry.workProductType || "",
    })),
    potentialRubrics: (row.potentialRubrics || []).map((entry) => ({
      label: entry.label || "",
      rubricId: entry.rubricId || "",
    })),
    characteristicFeatures: (row.characteristicFeatures || []).map((entry) => ({
      label: entry.label || "",
    })),
    variableFeatures: (row.variableFeatures || []).map((entry) => ({
      label: entry.label || "",
      taskModelVariableId: entry.taskModelVariableId || "",
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
    potentialObservations: observationEntries(form.potentialObservations),
    potentialWorkProducts: libraryEntries(form.potentialWorkProducts, "workProductId"),
    potentialRubrics: libraryEntries(form.potentialRubrics, "rubricId"),
    characteristicFeatures: labelledEntries(form.characteristicFeatures),
    variableFeatures: libraryEntries(form.variableFeatures, "taskModelVariableId"),
  };
}

function LabelList({ legend, hint, hintId, values, onChange }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm text-slate-700">{legend}</legend>
      <p id={hintId} className={hintClass}>
        {hint}
      </p>
      {values.map((entry, index) => (
        <div key={`${legend}-${index}`} className="flex gap-2">
          <input
            className={inputClass}
            aria-label={`${legend} ${index + 1}`}
            aria-describedby={hintId}
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

function optionLabel(option) {
  return option.source ? `${option.name} (${option.source})` : option.name;
}

function RefList({
  legend,
  hint,
  hintId,
  values,
  onChange,
  options,
  idKey,
  emptyOption,
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm text-slate-700">{legend}</legend>
      <p id={hintId} className={hintClass}>
        {hint}
      </p>
      {values.map((entry, index) => (
        <div key={`${legend}-${index}`} className="flex gap-2">
          <select
            className={inputClass}
            aria-label={`${legend} ${index + 1}`}
            aria-describedby={hintId}
            value={entry[idKey] || ""}
            onChange={(event) => {
              const id = event.target.value;
              const option = options.find((row) => row.id === id);
              const next = values.slice();
              next[index] = {
                ...entry,
                [idKey]: id,
                label: option ? option.name : entry.label,
                ...(idKey === "workProductId"
                  ? { workProductType: option?.type || "" }
                  : {}),
              };
              onChange(next);
            }}
          >
            <option value="">{emptyOption}</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {optionLabel(option)}
              </option>
            ))}
          </select>
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
        onClick={() => onChange([...values, { label: "", [idKey]: "" }])}
      >
        Add {legend}
      </Button>
    </fieldset>
  );
}

function ObservationList({ values, onChange, options }) {
  const hintId = "dp-observation-guidance";
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm text-slate-700">Potential Observations</legend>
      <p id={hintId} className={hintClass}>
        {DESIGN_PATTERN_MENU_GUIDANCE.potentialObservations}
      </p>
      {values.map((entry, index) => (
        <div key={`obs-${index}`} className="grid gap-2 sm:grid-cols-2">
          <input
            className={inputClass}
            aria-label={`Potential Observations label ${index + 1}`}
            aria-describedby={hintId}
            placeholder="Label"
            value={entry.label}
            onChange={(event) => {
              const next = values.slice();
              next[index] = { ...entry, label: event.target.value };
              onChange(next);
            }}
          />
          <div className="flex gap-2">
            <select
              className={inputClass}
              aria-label={`Potential Observations ${index + 1}`}
              value={entry.observationId || ""}
              onChange={(event) => {
                const observationId = event.target.value;
                const option = options.find((row) => row.id === observationId);
                const next = values.slice();
                next[index] = {
                  ...entry,
                  observationId,
                  label: entry.label || option?.name || "",
                };
                onChange(next);
              }}
            >
              <option value="">Optional existing observable</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {optionLabel(option)}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={() => onChange(values.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() => onChange([...values, { label: "", observationId: "" }])}
      >
        Add Potential Observations
      </Button>
    </fieldset>
  );
}

/** Presentational — tests drive this without API hooks. */
export function DesignPatternLibraryView({
  patterns = [],
  workProducts = [],
  rubrics = [],
  taskModelVariables = [],
  observationChoices = [],
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
          It does not authorise a student session.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          {DESIGN_PATTERN_MENU_GUIDANCE.framing}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium text-slate-800">
            {editingId ? `Edit ${editing?.name || editingId}` : "New design pattern"}
          </h3>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <label className="block text-sm" htmlFor="dp-title">
              <span className="mb-1 block text-slate-700">Title</span>
            </label>
            <p id="dp-title-guidance" className={hintClass}>
              {DESIGN_PATTERN_NARRATIVE_GUIDANCE.title}
            </p>
            <input
              id="dp-title"
              className={inputClass}
              aria-describedby="dp-title-guidance"
              value={form.name}
              onChange={(event) => patchForm({ name: event.target.value })}
              required
            />
            <label className="block text-sm" htmlFor="dp-summary">
              <span className="mb-1 block text-slate-700">Summary</span>
            </label>
            <p id="dp-summary-guidance" className={hintClass}>
              {DESIGN_PATTERN_NARRATIVE_GUIDANCE.summary}
            </p>
            <textarea
              id="dp-summary"
              className={inputClass}
              rows={3}
              aria-describedby="dp-summary-guidance"
              value={form.summary}
              onChange={(event) => patchForm({ summary: event.target.value })}
            />
            <label className="block text-sm" htmlFor="dp-rationale">
              <span className="mb-1 block text-slate-700">Rationale</span>
            </label>
            <p id="dp-rationale-guidance" className={hintClass}>
              {DESIGN_PATTERN_NARRATIVE_GUIDANCE.rationale}
            </p>
            <textarea
              id="dp-rationale"
              className={inputClass}
              rows={4}
              aria-describedby="dp-rationale-guidance"
              value={form.rationale}
              onChange={(event) => patchForm({ rationale: event.target.value })}
            />
            <LabelList
              legend="Focal KSAs"
              hint={DESIGN_PATTERN_NARRATIVE_GUIDANCE.focalKsas}
              hintId="dp-focal-guidance"
              values={form.focalKsas}
              onChange={(focalKsas) => patchForm({ focalKsas })}
            />
            <LabelList
              legend="Additional KSAs"
              hint={DESIGN_PATTERN_NARRATIVE_GUIDANCE.additionalKsas}
              hintId="dp-additional-guidance"
              values={form.additionalKsas}
              onChange={(additionalKsas) => patchForm({ additionalKsas })}
            />
            <ObservationList
              values={form.potentialObservations}
              onChange={(potentialObservations) =>
                patchForm({ potentialObservations })
              }
              options={observationChoices}
            />
            <RefList
              legend="Potential Work Products"
              hint={DESIGN_PATTERN_MENU_GUIDANCE.potentialWorkProducts}
              hintId="dp-wp-guidance"
              values={form.potentialWorkProducts}
              onChange={(potentialWorkProducts) =>
                patchForm({ potentialWorkProducts })
              }
              options={workProducts.map((row) => ({
                id: row.id,
                name: row.name || row.id,
                type: row.type,
              }))}
              idKey="workProductId"
              emptyOption="Choose a work product"
            />
            <RefList
              legend="Potential Rubrics"
              hint={DESIGN_PATTERN_MENU_GUIDANCE.potentialRubrics}
              hintId="dp-rubric-guidance"
              values={form.potentialRubrics}
              onChange={(potentialRubrics) => patchForm({ potentialRubrics })}
              options={rubrics.map((row) => ({
                id: row.id,
                name: row.name || row.id,
              }))}
              idKey="rubricId"
              emptyOption="Choose a rubric"
            />
            <LabelList
              legend="Characteristic Features"
              hint={DESIGN_PATTERN_MENU_GUIDANCE.characteristicFeatures}
              hintId="dp-cf-guidance"
              values={form.characteristicFeatures}
              onChange={(characteristicFeatures) =>
                patchForm({ characteristicFeatures })
              }
            />
            <RefList
              legend="Variable Features"
              hint={DESIGN_PATTERN_MENU_GUIDANCE.variableFeatures}
              hintId="dp-vf-guidance"
              values={form.variableFeatures}
              onChange={(variableFeatures) => patchForm({ variableFeatures })}
              options={taskModelVariables.map((row) => ({
                id: row.id,
                name: row.name || row.id,
              }))}
              idKey="taskModelVariableId"
              emptyOption="Choose a task model variable"
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
  const { data: workProducts = [] } = useWorkProducts();
  const { data: rubrics = [] } = useRubrics();
  const { data: taskModelVariables = [] } = useTaskModelVariables();
  const { data: evidenceModels = [] } = useEvidenceModels();
  const observationChoices = useMemo(
    () => observationChoicesFromModels(evidenceModels),
    [evidenceModels]
  );
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
      workProducts={workProducts}
      rubrics={rubrics}
      taskModelVariables={taskModelVariables}
      observationChoices={observationChoices}
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
