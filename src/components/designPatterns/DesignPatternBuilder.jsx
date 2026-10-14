// src/components/designPatterns/DesignPatternBuilder.jsx
//
// D133–D134 / W27: narrative plus menus of possibilities.
// D137: a confirmed pattern can seed draft Evidence and Task Models.
// Confirming still authorises no student delivery (ADR 0009).

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { apiErrorMessage, apiFetch } from "@/api/apiClient";
import { useAuth } from "@/auth/AuthProvider";
import {
  useDesignPatterns,
  useCreateDesignPattern,
  useUpdateDesignPattern,
  useConfirmDesignPattern,
  useDeleteDesignPattern,
  useSeedDesignPattern,
} from "@/api/queries/designPatterns";
import { useCompetencies } from "@/api/queries/competencies";
import { useWorkProducts } from "@/api/queries/workProducts";
import { useRubrics } from "@/api/queries/rubrics";
import { useTaskModelVariables } from "@/api/queries/taskModelVariables";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useTemplates, useUpdateTemplate } from "@/api/queries/templates";
import { designPatternReadiness } from "@/utils/designPatternReadiness";
import { DESIGN_PATTERN_PADI_ATTRIBUTES } from "@/utils/schema";
import PatternNeighbourhood from "./PatternNeighbourhood.jsx";

const SEED_FIELDS = [
  "potentialObservations",
  "potentialWorkProducts",
  "potentialRubrics",
  "characteristicFeatures",
  "variableFeatures",
];

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
  relationships: [],
  references: [],
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
    relationships: (row.relationships || []).map((entry) => ({
      type: entry.type || "kind-of",
      targetPatternId: entry.targetPatternId || "",
    })),
    references: (row.references || []).map((entry) => ({
      label: entry.label || "",
      url: entry.url || "",
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
    relationships: (form.relationships || [])
      .map((entry) => ({
        type: entry.type,
        targetPatternId: String(entry.targetPatternId || "").trim(),
      }))
      .filter((entry) => entry.targetPatternId),
    references: (form.references || [])
      .map((entry) => ({
        label: String(entry.label || "").trim(),
        url: String(entry.url || "").trim(),
      }))
      .filter((entry) => entry.label),
  };
}

function PatternRelations({ patternId, patterns, relationships, references, onChange }) {
  const others = (patterns || []).filter((row) => row.id !== patternId);
  return (
    <div className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="text-sm text-slate-700">Relations</legend>
        <p className={hintClass}>
          A kind-of or part-of link cites another pattern. It does not copy
          that pattern&apos;s menus, and editing the parent does not change
          this one.
        </p>
        {relationships.map((entry, index) => (
          <div key={`rel-${index}`} className="flex gap-2">
            <select
              className={inputClass}
              aria-label={`Relation type ${index + 1}`}
              value={entry.type}
              onChange={(event) => {
                const next = relationships.slice();
                next[index] = { ...entry, type: event.target.value };
                onChange({ relationships: next });
              }}
            >
              <option value="kind-of">kind-of</option>
              <option value="part-of">part-of</option>
            </select>
            <select
              className={inputClass}
              aria-label={`Related pattern ${index + 1}`}
              value={entry.targetPatternId}
              onChange={(event) => {
                const next = relationships.slice();
                next[index] = { ...entry, targetPatternId: event.target.value };
                onChange({ relationships: next });
              }}
            >
              <option value="">Choose a pattern</option>
              {others.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name || row.id}
                </option>
              ))}
            </select>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onChange({
              relationships: [...relationships, { type: "kind-of", targetPatternId: "" }],
            })
          }
        >
          Add relation
        </Button>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm text-slate-700">References</legend>
        <p className={hintClass}>
          A label and an address. This is not a curricular policy and not a
          rubric exemplar.
        </p>
        {references.map((entry, index) => (
          <div key={`ref-${index}`} className="flex gap-2">
            <input
              className={inputClass}
              aria-label={`Reference label ${index + 1}`}
              value={entry.label}
              onChange={(event) => {
                const next = references.slice();
                next[index] = { ...entry, label: event.target.value };
                onChange({ references: next });
              }}
            />
            <input
              className={inputClass}
              aria-label={`Reference address ${index + 1}`}
              value={entry.url}
              onChange={(event) => {
                const next = references.slice();
                next[index] = { ...entry, url: event.target.value };
                onChange({ references: next });
              }}
            />
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange({ references: [...references, { label: "", url: "" }] })}
        >
          Add reference
        </Button>
      </fieldset>
    </div>
  );
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
export function patternTemplateHref(templateId) {
  return `/admin?tab=templates&focus=${encodeURIComponent(templateId)}`;
}

export function templatesForPattern(templates = [], patternId) {
  if (!patternId) return [];
  return templates.filter((row) => row.designPatternId === patternId);
}

function SeedFromPattern({ pattern, competencies = [], onSeed, pending = false }) {
  const [competencyId, setCompetencyId] = useState("");
  const [picked, setPicked] = useState({});
  const [seedError, setSeedError] = useState("");

  function toggle(field, index) {
    setPicked((current) => {
      const next = new Set(current[field] || []);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return { ...current, [field]: [...next] };
    });
  }

  async function handleSeed() {
    setSeedError("");
    const selections = {};
    for (const field of SEED_FIELDS) selections[field] = picked[field] || [];
    try {
      await onSeed({ id: pattern.id, competencyId, selections });
      setPicked({});
    } catch (err) {
      setSeedError(apiErrorMessage(err, "Seed failed"));
    }
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <h4 className="text-sm font-medium text-slate-800">Seed draft models</h4>
      <p className={hintClass}>
        Pick the menu rows to copy. Unchecked rows stay on the back-link.
        This writes a draft Evidence Model and a draft Task Model. Confirm
        still requires the claim, warrants, and evidence rules this pattern
        does not supply.
      </p>
      <label className="mt-3 block text-sm" htmlFor="dp-seed-competency">
        <span className="mb-1 block text-slate-700">Competency</span>
        <select
          id="dp-seed-competency"
          className={inputClass}
          value={competencyId}
          onChange={(event) => setCompetencyId(event.target.value)}
        >
          <option value="">Select a competency</option>
          {competencies.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name || row.id}
            </option>
          ))}
        </select>
      </label>
      {competencies.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          A competency is required before seeding. This library has none.
        </p>
      ) : null}
      {SEED_FIELDS.map((field) => {
        const rows = Array.isArray(pattern[field]) ? pattern[field] : [];
        const label =
          DESIGN_PATTERN_PADI_ATTRIBUTES.find((row) => row.field === field)?.padi || field;
        if (rows.length === 0) return null;
        return (
          <fieldset key={field} className="mt-3">
            <legend className="text-xs font-medium text-slate-700">{label}</legend>
            <ul className="mt-1 space-y-1">
              {rows.map((row, index) => (
                <li key={`${field}-${index}`}>
                  <label className="flex items-start gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={(picked[field] || []).includes(index)}
                      onChange={() => toggle(field, index)}
                    />
                    <span>{row.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        );
      })}
      {seedError ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {seedError}
        </p>
      ) : null}
      <Button
        type="button"
        className="mt-3"
        disabled={!competencyId || pending || !onSeed}
        onClick={handleSeed}
      >
        Seed draft models
      </Button>
    </div>
  );
}

function PatternDescendantReport({ patternId, report, onLoad, refreshKey = 0 }) {
  const [data, setData] = useState(report);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (report) {
      setData(report);
      return undefined;
    }
    if (!onLoad || !patternId) return undefined;
    let cancelled = false;
    onLoad(patternId)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, "Could not list seeded models"));
      });
    return () => {
      cancelled = true;
    };
  }, [patternId, report, onLoad, refreshKey]);

  const descendants = data?.descendants || [];
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <h4 className="text-sm font-medium text-slate-800">Seeded models</h4>
      <p className={hintClass}>
        Drift from the rows accepted at seed time is advisory. It does not
        block confirm. A Focal KSA is not an observable.
      </p>
      {loadError ? (
        <p className="mt-2 text-sm text-red-600" role="alert">{loadError}</p>
      ) : null}
      {descendants.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">No seeded models yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {descendants.map((row) => (
            <li key={`${row.kind}-${row.id}`}>
              <p className="text-sm text-slate-800">
                {row.name} <span className="text-xs text-slate-500">{row.kind}</span>
              </p>
              {(row.divergences || []).length === 0 ? (
                <p className="text-xs text-slate-500">Matches the seed snapshot.</p>
              ) : (
                <ul className="list-disc pl-5 text-xs text-slate-700">
                  {row.divergences.map((flag) => (
                    <li key={`${flag.menu}-${flag.label}-${flag.reason}`}>{flag.detail}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DesignPatternLibraryView({
  patterns = [],
  templates = [],
  workProducts = [],
  rubrics = [],
  taskModelVariables = [],
  observationChoices = [],
  onCreate,
  onUpdate,
  onConfirm,
  onDelete,
  onLinkTemplate,
  competencies = [],
  onSeed,
  seedPending = false,
  descendantReport = null,
  onLoadDescendants,
  focusId = null,
  createPending = false,
  updatePending = false,
  confirmPending = false,
  deletePending = false,
}) {
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [serverError, setServerError] = useState("");
  const [linkTemplateId, setLinkTemplateId] = useState("");
  const [descendantTick, setDescendantTick] = useState(0);
  const appliedFocus = useRef(null);

  useEffect(() => {
    if (!focusId || appliedFocus.current === focusId) return;
    const row = patterns.find((item) => item.id === focusId);
    if (!row) return;
    appliedFocus.current = focusId;
    setEditingId(row.id);
    setForm(formFromRow(row));
    setServerError("");
  }, [focusId, patterns]);

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
            <PatternRelations
              patternId={editingId}
              patterns={patterns}
              relationships={form.relationships}
              references={form.references}
              onChange={patchForm}
            />
            {editingId ? (
              <PatternTemplateLinks
                patternId={editingId}
                templates={templates}
                linkTemplateId={linkTemplateId}
                onLinkTemplateId={setLinkTemplateId}
                onLinkTemplate={onLinkTemplate}
              />
            ) : null}
            {editing?.status === "confirmed" && onSeed ? (
              <SeedFromPattern
                pattern={editing}
                competencies={competencies}
                onSeed={async (payload) => {
                  const seeded = await onSeed(payload);
                  setDescendantTick((tick) => tick + 1);
                  return seeded;
                }}
                pending={seedPending}
              />
            ) : null}
            {editingId ? (
              <PatternDescendantReport
                patternId={editingId}
                report={descendantReport}
                onLoad={onLoadDescendants}
                refreshKey={descendantTick}
              />
            ) : null}
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
          {editingId ? (
            <PatternNeighbourhood
              patternId={editingId}
              patterns={patterns}
              report={descendantReport}
              onLoad={onLoadDescendants}
              refreshKey={descendantTick}
              onOpen={(id) => {
                const row = patterns.find((item) => item.id === id);
                if (row) startEdit(row);
              }}
            />
          ) : null}
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
                    <PatternTemplateList patternId={row.id} templates={templates} />
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

function PatternTemplateList({ patternId, templates }) {
  const linked = templatesForPattern(templates, patternId);
  if (linked.length === 0) return null;
  return (
    <ul className="mt-1 space-y-1">
      {linked.map((row) => (
        <li key={row.id}>
          <a className="text-xs text-slate-800 underline" href={patternTemplateHref(row.id)}>
            {row.name || row.id}
          </a>
        </li>
      ))}
    </ul>
  );
}

function PatternTemplateLinks({
  patternId,
  templates,
  linkTemplateId,
  onLinkTemplateId,
  onLinkTemplate,
}) {
  const linked = templatesForPattern(templates, patternId);
  const available = (templates || []).filter(
    (row) => !row.designPatternId || row.designPatternId === patternId
  );
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <h4 className="text-sm font-medium text-slate-800">Templates</h4>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        This pattern offers structure to these templates. Linking does not
        confirm them, and a template with no pattern stays valid.
      </p>
      {linked.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">No templates linked yet.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {linked.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2">
              <a className="text-sm text-slate-800 underline" href={patternTemplateHref(row.id)}>
                {row.name || row.id}
              </a>
              {onLinkTemplate ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onLinkTemplate({ id: row.id, designPatternId: null })}
                >
                  Unlink
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {onLinkTemplate ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block min-w-48 flex-1 text-sm" htmlFor="dp-link-template">
            <span className="mb-1 block text-slate-700">Link a template</span>
            <select
              id="dp-link-template"
              className={inputClass}
              value={linkTemplateId}
              onChange={(event) => onLinkTemplateId(event.target.value)}
            >
              <option value="">Select a template</option>
              {available.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name || row.id}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={!linkTemplateId}
            onClick={() => {
              onLinkTemplate({ id: linkTemplateId, designPatternId: patternId });
              onLinkTemplateId("");
            }}
          >
            Link template
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default function DesignPatternBuilder() {
  const { auth } = useAuth() || {};
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get("focus");
  const { data: patterns = [], isLoading, error } = useDesignPatterns();
  const { data: templates = [] } = useTemplates();
  const { data: competencies = [] } = useCompetencies();
  const seedMut = useSeedDesignPattern();
  const updateTemplate = useUpdateTemplate();
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
      templates={templates}
      competencies={competencies}
      seedPending={seedMut.isPending}
      onLoadDescendants={(id) =>
        apiFetch(`/api/designPatterns/${id}/descendants`, {}, auth)
      }
      focusId={focusId}
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
      onSeed={async (payload) => {
        try {
          const seeded = await seedMut.mutateAsync(payload);
          toast.success(
            `Drafts created: ${seeded.evidenceModel?.name || "evidence model"} and ${seeded.taskModel?.name || "task model"}`
          );
          return seeded;
        } catch (err) {
          toast.error(apiErrorMessage(err, "Seed failed"));
          throw err;
        }
      }}
      onLinkTemplate={async ({ id, designPatternId }) => {
        try {
          await updateTemplate.mutateAsync({ id, payload: { designPatternId } });
          toast.success(designPatternId ? "Template linked" : "Template unlinked");
        } catch (err) {
          toast.error(apiErrorMessage(err, "Link failed"));
          throw err;
        }
      }}
    />
  );
}
