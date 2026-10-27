// src/components/designPatterns/DesignPatternBuilder.jsx
//
// D133–D134 / W27: narrative plus menus of possibilities.
// D137: a confirmed pattern can seed draft Evidence and Task Models.
// Confirming still authorises no student delivery (ADR 0009).
//
// Off-calendar (not D146): the authoring form is the shared wizard shell
// (convention C). Payload, formFromRow, and readiness are unchanged.
// Lifecycle stays draft | confirmed. Create draft / Save and Confirm live
// in the toolbar slot. The shell promote pair stays hidden.
//
// The default export is the three-tab shell (Dashboard / Design Pattern
// Structure / Manage Design Pattern). Manage is the list console.
// New, Edit, and Duplicate open DesignPatternLibraryView. A focus id
// in the URL opens Manage on that pattern.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ADDITIONAL_KSA_RELATIONSHIPS,
  additionalKsaFocalOverlap,
} from "@/utils/additionalKsaAdvisory";

import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/Modal";
import { openActionLabel } from "@/utils/modelActionLabel";
import ModelManageList, {
  manageDangerButtonClass,
  manageOpenButtonClass,
  manageQuietButtonClass,
} from "@/components/shared/ModelManageList";
import WizardSidebar from "@/components/wizard/WizardSidebar";
import WizardStepContainer from "@/components/wizard/WizardStepContainer";
import {
  DESIGN_PATTERN_WIZARD_STEPS,
  canNavigateDesignPatternRail,
  designPatternBlockersCopy,
  designPatternStepComplete,
} from "./designPatternWizardContract.js";
import { apiErrorMessage, apiFetch } from "@/api/apiClient";
import { useAuth } from "@/auth/AuthProvider";
import { useDomainAnalyses } from "@/api/queries/domainAnalyses";
import {
  readDesignPatternPerspective,
  perspectiveReadout,
} from "@/utils/perspectiveInheritance";
import {
  useDesignPatterns,
  useCreateDesignPattern,
  useUpdateDesignPattern,
  useConfirmDesignPattern,
  useDeleteDesignPattern,
  useSeedDesignPattern,
} from "@/api/queries/designPatterns";
import { useCompetencies, useCompetencyModels } from "@/api/queries/competencies";
import { useWorkProducts } from "@/api/queries/workProducts";
import { useRubrics } from "@/api/queries/rubrics";
import { useTaskModelVariables } from "@/api/queries/taskModelVariables";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useTaskModels } from "@/api/queries/taskModels";
import { useTemplates, useUpdateTemplate } from "@/api/queries/templates";
import { designPatternReadiness } from "@/utils/designPatternReadiness";
import {
  copyKsaLinks,
  focalKsaUnlinkedWarnings,
  suggestSeedFromFocalKsas,
} from "@/utils/ksaStudentModelLink";
import { DESIGN_PATTERN_PADI_ATTRIBUTES } from "@/utils/schema";
import PatternNeighbourhood from "./PatternNeighbourhood.jsx";
import ModelTabShell from "@/components/shared/ModelTabShell";
import DesignPatternDashboard from "./DesignPatternDashboard";
import DesignPatternTable from "./DesignPatternTable";

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

export const DESIGN_PATTERN_EXAMPLES = Object.freeze({
  title: "Name a plant part from a diagram",
  summary: "The student names a plant part marked on a familiar diagram.",
  rationale:
    "Naming the part is the claim. A selected response can give evidence for one binary attribute.",
  focalKsas: "Names the indicated plant part",
  additionalKsas: "Reads a printed label",
  potentialObservations: "The chosen name matches the indicated part",
  potentialWorkProducts: "Selected plant-part name, from Work Products",
  potentialRubrics: "Plant-part naming, from Rubrics",
  characteristicFeatures: "The diagram shows a familiar plant",
  variableFeatures: "Diagram familiarity, from Task Model Variables",
});

function FieldExample({ text }) {
  return <p className="text-xs text-slate-500">Example: {text}</p>;
}

function listIsBlank(values) {
  return !(values || []).some((entry) => String(entry?.label || "").trim());
}

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

function ksaEntries(entries, { relationship = false } = {}) {
  return (entries || [])
    .map((entry) => {
      const label = String(entry?.label || "").trim();
      const relation = relationship ? String(entry?.relationship || "").trim() : "";
      const links = copyKsaLinks(entry);
      if (!label && !relation && Object.keys(links).length === 0) return null;
      const row = { label, ...links };
      if (relation) row.relationship = relation;
      return row;
    })
    .filter(Boolean);
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
  domainAnalysisId: "",
});

export function formFromRow(row) {
  return {
    name: row.name || "",
    summary: row.summary || "",
    rationale: row.rationale || "",
    focalKsas: (row.focalKsas || []).map((entry) => ({
      label: entry.label || "",
      competencyId: entry.competencyId || "",
      competencyModelId: entry.competencyModelId || "",
      smvId: entry.smvId || "",
    })),
    additionalKsas: (row.additionalKsas || []).map((entry) => ({
      label: entry.label || "",
      relationship: entry.relationship || "",
      competencyId: entry.competencyId || "",
      competencyModelId: entry.competencyModelId || "",
      smvId: entry.smvId || "",
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
    domainAnalysisId: row.domainAnalysisId || "",
  };
}

export function designPatternPayload(form) {
  const payload = {
    name: form.name.trim(),
    summary: form.summary.trim(),
    rationale: form.rationale.trim(),
    focalKsas: ksaEntries(form.focalKsas),
    additionalKsas: ksaEntries(form.additionalKsas, { relationship: true }),
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
  if (Object.prototype.hasOwnProperty.call(form, "domainAnalysisId")) {
    payload.domainAnalysisId = String(form.domainAnalysisId || "").trim();
  }
  return payload;
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

function LabelList({ legend, hint, hintId, values, onChange, example }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm text-slate-700">{legend}</legend>
      <p id={hintId} className={hintClass}>
        {hint}
      </p>
      {example && listIsBlank(values) ? <FieldExample text={example} /> : null}
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

export const KSA_LINK_GUIDANCE =
  "Link a competency, a student model variable, or both. Leave both unset to keep the label only. Confirm warns when a focal KSA is unlinked. It does not block.";

function smvOptionKey(modelId, smvId) {
  return `${modelId}::${smvId}`;
}

function parseSmvOptionKey(value) {
  const index = String(value || "").indexOf("::");
  if (index < 0) return { competencyModelId: "", smvId: "" };
  return {
    competencyModelId: value.slice(0, index),
    smvId: value.slice(index + 2),
  };
}

function smvOptions(competencyModels) {
  const options = [];
  for (const model of competencyModels || []) {
    for (const smv of model?.smVariables || []) {
      if (!model?.id || !smv?.id) continue;
      options.push({
        key: smvOptionKey(model.id, smv.id),
        competencyModelId: model.id,
        smvId: smv.id,
        label: `${model.name || model.id}: ${smv.label || smv.id}`,
      });
    }
  }
  return options;
}

function KsaLinkFields({ legend, index, entry, competencies, competencyModels, onChange }) {
  const options = smvOptions(competencyModels);
  const selectedKey =
    entry.competencyModelId && entry.smvId
      ? smvOptionKey(entry.competencyModelId, entry.smvId)
      : "";
  const competencyKnown = (competencies || []).some((row) => row.id === entry.competencyId);
  const smvKnown = options.some((option) => option.key === selectedKey);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <select
        className={inputClass}
        aria-label={`${legend} ${index + 1} competency`}
        value={entry.competencyId || ""}
        onChange={(event) => onChange({ ...entry, competencyId: event.target.value })}
      >
        <option value="">Not linked</option>
        {entry.competencyId && !competencyKnown ? (
          <option value={entry.competencyId}>{entry.competencyId} (not found)</option>
        ) : null}
        {(competencies || []).map((row) => (
          <option key={row.id} value={row.id}>
            {row.name || row.id}
          </option>
        ))}
      </select>
      <select
        className={inputClass}
        aria-label={`${legend} ${index + 1} student model variable`}
        value={selectedKey}
        onChange={(event) => {
          const next = parseSmvOptionKey(event.target.value);
          onChange({
            ...entry,
            competencyModelId: next.competencyModelId,
            smvId: next.smvId,
          });
        }}
      >
        <option value="">Not linked</option>
        {selectedKey && !smvKnown ? (
          <option value={selectedKey}>{selectedKey} (not found)</option>
        ) : null}
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FocalKsaList({ values, onChange, competencies, competencyModels, warnings }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm text-slate-700">Focal KSAs</legend>
      <p id="dp-focal-guidance" className={hintClass}>
        {DESIGN_PATTERN_NARRATIVE_GUIDANCE.focalKsas}
      </p>
      <p className={hintClass}>{KSA_LINK_GUIDANCE}</p>
      {listIsBlank(values) ? <FieldExample text={DESIGN_PATTERN_EXAMPLES.focalKsas} /> : null}
      {values.map((entry, index) => (
        <div key={`focal-${index}`} className="space-y-2 rounded-md border border-slate-200 p-2">
          <div className="flex gap-2">
            <input
              className={inputClass}
              aria-label={`Focal KSAs ${index + 1}`}
              aria-describedby="dp-focal-guidance"
              value={entry.label}
              onChange={(event) => {
                const next = values.slice();
                next[index] = { ...entry, label: event.target.value };
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
          <KsaLinkFields
            legend="Focal KSAs"
            index={index}
            entry={entry}
            competencies={competencies}
            competencyModels={competencyModels}
            onChange={(nextEntry) => {
              const next = values.slice();
              next[index] = nextEntry;
              onChange(next);
            }}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          onChange([
            ...values,
            { label: "", competencyId: "", competencyModelId: "", smvId: "" },
          ])
        }
      >
        Add Focal KSAs
      </Button>
      {(warnings || []).map((warning) => (
        <p key={warning} role="note" className="text-xs text-amber-800">
          {warning}
        </p>
      ))}
    </fieldset>
  );
}

function AdditionalKsaList({
  values,
  onChange,
  overlaps,
  competencies,
  competencyModels,
}) {
  return (
    <div className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="text-sm text-slate-700">Additional KSAs</legend>
        <p id="dp-additional-guidance" className={hintClass}>
          {DESIGN_PATTERN_NARRATIVE_GUIDANCE.additionalKsas}
        </p>
        <p className={hintClass}>{KSA_LINK_GUIDANCE}</p>
        {listIsBlank(values) ? (
          <FieldExample text={DESIGN_PATTERN_EXAMPLES.additionalKsas} />
        ) : null}
        {values.map((entry, index) => (
          <div key={`additional-${index}`} className="space-y-2 rounded-md border border-slate-200 p-2">
            <div className="flex gap-2">
              <input
                className={inputClass}
                aria-label={`Additional KSAs ${index + 1}`}
                aria-describedby="dp-additional-guidance"
                value={entry.label}
                onChange={(event) => {
                  const next = values.slice();
                  next[index] = { ...entry, label: event.target.value };
                  onChange(next);
                }}
              />
              <select
                className={inputClass}
                aria-label={`Additional KSAs ${index + 1} relationship`}
                value={entry.relationship || ""}
                onChange={(event) => {
                  const next = values.slice();
                  next[index] = { ...entry, relationship: event.target.value };
                  onChange(next);
                }}
              >
                <option value="">Choose a relationship</option>
                {ADDITIONAL_KSA_RELATIONSHIPS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
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
            <KsaLinkFields
              legend="Additional KSAs"
              index={index}
              entry={entry}
              competencies={competencies}
              competencyModels={competencyModels}
              onChange={(nextEntry) => {
                const next = values.slice();
                next[index] = nextEntry;
                onChange(next);
              }}
            />
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onChange([
              ...values,
              {
                label: "",
                relationship: "",
                competencyId: "",
                competencyModelId: "",
                smvId: "",
              },
            ])
          }
        >
          Add Additional KSAs
        </Button>
      </fieldset>
      {overlaps.map((hit) => (
        <p
          key={`${hit.patternId}-${hit.label}`}
          role="note"
          className="text-xs text-amber-800"
        >
          “{hit.label}” is a Focal KSA of {hit.patternName}. This is advisory, not blocking.
        </p>
      ))}
    </div>
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
  example,
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm text-slate-700">{legend}</legend>
      <p id={hintId} className={hintClass}>
        {hint}
      </p>
      {example && listIsBlank(values) ? <FieldExample text={example} /> : null}
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
      {listIsBlank(values) ? (
        <FieldExample text={DESIGN_PATTERN_EXAMPLES.potentialObservations} />
      ) : null}
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

function initialSeedChoice(pattern) {
  const suggestion = suggestSeedFromFocalKsas(pattern);
  return {
    competencyId: suggestion.competencyIds.length === 1 ? suggestion.competencyIds[0] : "",
    smvKey: suggestion.smvs.length === 1 ? suggestion.smvs[0].key : "",
  };
}

function SeedFromPattern({
  pattern,
  competencies = [],
  competencyModels = [],
  onSeed,
  pending = false,
}) {
  const [choice, setChoice] = useState(() => initialSeedChoice(pattern));
  const [picked, setPicked] = useState({});
  const [seedError, setSeedError] = useState("");
  const suggestion = suggestSeedFromFocalKsas(pattern);
  const competencyId = choice.competencyId;
  const parsedSmv = parseSmvOptionKey(choice.smvKey);

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
      await onSeed({
        id: pattern.id,
        competencyId,
        competencyModelId: parsedSmv.competencyModelId,
        smvId: parsedSmv.smvId,
        selections,
      });
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
        does not supply. A linked focal KSA pre-fills the competency and
        the student model variable. You can choose different ones.
      </p>
      {suggestion.competencyIds.length > 1 ? (
        <p className="mt-2 text-xs text-amber-800" role="note">
          Focal KSAs cite more than one competency. Choose which competency to seed.
        </p>
      ) : null}
      <label className="mt-3 block text-sm" htmlFor="dp-seed-competency">
        <span className="mb-1 block text-slate-700">Competency</span>
        <select
          id="dp-seed-competency"
          className={inputClass}
          value={competencyId}
          onChange={(event) =>
            setChoice((current) => ({ ...current, competencyId: event.target.value }))
          }
        >
          <option value="">Select a competency</option>
          {competencies.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name || row.id}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-sm" htmlFor="dp-seed-smv">
        <span className="mb-1 block text-slate-700">Student model variable</span>
        <select
          id="dp-seed-smv"
          className={inputClass}
          value={choice.smvKey}
          onChange={(event) =>
            setChoice((current) => ({ ...current, smvKey: event.target.value }))
          }
        >
          <option value="">Not linked</option>
          {smvOptions(competencyModels).map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
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
  domainAnalyses = [],
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
  competencyModels = [],
  onSeed,
  seedPending = false,
  descendantReport = null,
  onLoadDescendants,
  focusId = null,
  createPending = false,
  updatePending = false,
  confirmPending = false,
  deletePending = false,
  onDismiss = null,
  initialForm = null,
}) {
  const [form, setForm] = useState(() =>
    initialForm ? { ...emptyForm(), ...initialForm } : emptyForm()
  );
  const [editingId, setEditingId] = useState(null);
  const [serverError, setServerError] = useState("");
  const [linkTemplateId, setLinkTemplateId] = useState("");
  const [descendantTick, setDescendantTick] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const appliedFocus = useRef(null);
  const steps = DESIGN_PATTERN_WIZARD_STEPS;

  useEffect(() => {
    if (!focusId || appliedFocus.current === focusId) return;
    const row = patterns.find((item) => item.id === focusId);
    if (!row) return;
    appliedFocus.current = focusId;
    setEditingId(row.id);
    setForm(formFromRow(row));
    setServerError("");
    setStepIndex(0);
  }, [focusId, patterns]);

  const editing = useMemo(
    () => (editingId ? patterns.find((row) => row.id === editingId) : null),
    [editingId, patterns]
  );

  const payload = designPatternPayload(form);
  const focalOverlaps = additionalKsaFocalOverlap(
    { id: editingId, additionalKsas: payload.additionalKsas },
    patterns
  );
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
    setStepIndex(0);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setServerError("");
    setStepIndex(0);
  }

  function goToStep(index) {
    if (!canNavigateDesignPatternRail(index, steps.length)) return;
    setStepIndex(index);
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
      if (onDismiss) {
        onDismiss();
        return;
      }
      cancelEdit();
    } catch (err) {
      setServerError(apiErrorMessage(err, "Confirm failed"));
    }
  }

  const busy = createPending || updatePending || confirmPending;
  const status = editing?.status || "draft";
  const blockersCopy = designPatternBlockersCopy(confirmCheck.errors);
  const workProductOptions = workProducts.map((row) => ({
    id: row.id,
    name: row.name || row.id,
    type: row.type,
  }));
  const rubricOptions = rubrics.map((row) => ({
    id: row.id,
    name: row.name || row.id,
  }));
  const variableOptions = taskModelVariables.map((row) => ({
    id: row.id,
    name: row.name || row.id,
  }));

  function renderStep() {
    switch (steps[stepIndex].id) {
      case "identity":
        return (
          <div className="space-y-3">
            <label className="block text-sm" htmlFor="dp-title">
              <span className="mb-1 block text-slate-700">Title</span>
            </label>
            <p id="dp-title-guidance" className={hintClass}>
              {DESIGN_PATTERN_NARRATIVE_GUIDANCE.title}
            </p>
            {!form.name.trim() ? <FieldExample text={DESIGN_PATTERN_EXAMPLES.title} /> : null}
            <input
              id="dp-title"
              className={inputClass}
              aria-describedby="dp-title-guidance"
              value={form.name}
              onChange={(event) => patchForm({ name: event.target.value })}
              required
            />
            <label className="block text-sm" htmlFor="dp-domain-analysis">
              <span className="mb-1 block text-slate-700">Domain Analysis</span>
              <select
                id="dp-domain-analysis"
                className={inputClass}
                value={form.domainAnalysisId || ""}
                onChange={(event) => patchForm({ domainAnalysisId: event.target.value })}
              >
                <option value="">No Domain Analysis cited</option>
                {domainAnalyses.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-slate-600">
              {perspectiveReadout(readDesignPatternPerspective(form, domainAnalyses)) ||
                "The psychological perspective is read from the Domain Analysis. This pattern does not store one."}
            </p>
            <label className="block text-sm" htmlFor="dp-summary">
              <span className="mb-1 block text-slate-700">Summary</span>
            </label>
            <p id="dp-summary-guidance" className={hintClass}>
              {DESIGN_PATTERN_NARRATIVE_GUIDANCE.summary}
            </p>
            {!form.summary.trim() ? <FieldExample text={DESIGN_PATTERN_EXAMPLES.summary} /> : null}
            <textarea
              id="dp-summary"
              className={inputClass}
              rows={3}
              aria-describedby="dp-summary-guidance"
              value={form.summary}
              onChange={(event) => patchForm({ summary: event.target.value })}
            />
          </div>
        );
      case "rationale":
        return (
          <div className="space-y-3">
            <label className="block text-sm" htmlFor="dp-rationale">
              <span className="mb-1 block text-slate-700">Rationale</span>
            </label>
            <p id="dp-rationale-guidance" className={hintClass}>
              {DESIGN_PATTERN_NARRATIVE_GUIDANCE.rationale}
            </p>
            {!form.rationale.trim() ? (
              <FieldExample text={DESIGN_PATTERN_EXAMPLES.rationale} />
            ) : null}
            <textarea
              id="dp-rationale"
              className={inputClass}
              rows={4}
              aria-describedby="dp-rationale-guidance"
              value={form.rationale}
              onChange={(event) => patchForm({ rationale: event.target.value })}
            />
          </div>
        );
      case "focalKsas":
        return (
          <FocalKsaList
            values={form.focalKsas}
            competencies={competencies}
            competencyModels={competencyModels}
            warnings={focalKsaUnlinkedWarnings(payload)}
            onChange={(focalKsas) => patchForm({ focalKsas })}
          />
        );
      case "additionalKsas":
        return (
          <AdditionalKsaList
            values={form.additionalKsas}
            overlaps={focalOverlaps}
            competencies={competencies}
            competencyModels={competencyModels}
            onChange={(additionalKsas) => patchForm({ additionalKsas })}
          />
        );
      case "observations":
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{DESIGN_PATTERN_MENU_GUIDANCE.framing}</p>
            <ObservationList
              values={form.potentialObservations}
              onChange={(potentialObservations) => patchForm({ potentialObservations })}
              options={observationChoices}
            />
          </div>
        );
      case "workProducts":
        return (
          <div className="space-y-6">
            <RefList
              legend="Potential Work Products"
              hint={DESIGN_PATTERN_MENU_GUIDANCE.potentialWorkProducts}
              hintId="dp-wp-guidance"
              values={form.potentialWorkProducts}
              onChange={(potentialWorkProducts) => patchForm({ potentialWorkProducts })}
              options={workProductOptions}
              idKey="workProductId"
              emptyOption="Choose a work product"
              example={DESIGN_PATTERN_EXAMPLES.potentialWorkProducts}
            />
            <RefList
              legend="Potential Rubrics"
              hint={DESIGN_PATTERN_MENU_GUIDANCE.potentialRubrics}
              hintId="dp-rubric-guidance"
              values={form.potentialRubrics}
              onChange={(potentialRubrics) => patchForm({ potentialRubrics })}
              options={rubricOptions}
              idKey="rubricId"
              emptyOption="Choose a rubric"
              example={DESIGN_PATTERN_EXAMPLES.potentialRubrics}
            />
          </div>
        );
      case "features":
        return (
          <div className="space-y-6">
            <LabelList
              legend="Characteristic Features"
              hint={DESIGN_PATTERN_MENU_GUIDANCE.characteristicFeatures}
              hintId="dp-cf-guidance"
              example={DESIGN_PATTERN_EXAMPLES.characteristicFeatures}
              values={form.characteristicFeatures}
              onChange={(characteristicFeatures) => patchForm({ characteristicFeatures })}
            />
            <RefList
              legend="Variable Features"
              hint={DESIGN_PATTERN_MENU_GUIDANCE.variableFeatures}
              hintId="dp-vf-guidance"
              values={form.variableFeatures}
              onChange={(variableFeatures) => patchForm({ variableFeatures })}
              options={variableOptions}
              idKey="taskModelVariableId"
              emptyOption="Choose a task model variable"
              example={DESIGN_PATTERN_EXAMPLES.variableFeatures}
            />
          </div>
        );
      case "relations":
        return (
          <PatternRelations
            patternId={editingId}
            patterns={patterns}
            relationships={form.relationships}
            references={form.references}
            onChange={patchForm}
          />
        );
      case "review":
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-slate-800">Review</h3>
              <p className={hintClass}>
                Confirming records the argument. It does not authorise a student session.
              </p>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-slate-500">Title</dt>
                  <dd className="text-slate-900">{form.name.trim() || "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Summary</dt>
                  <dd className="text-slate-900">{form.summary.trim() || "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Rationale</dt>
                  <dd className="text-slate-900">{form.rationale.trim() || "—"}</dd>
                </div>
              </dl>
            </div>
            {editingId ? (
              <PatternTemplateLinks
                patternId={editingId}
                templates={templates}
                linkTemplateId={linkTemplateId}
                onLinkTemplateId={setLinkTemplateId}
                onLinkTemplate={onLinkTemplate}
              />
            ) : (
              <p className="text-sm text-slate-600">
                Save a draft before linking a template or seeding models.
              </p>
            )}
            {(confirmCheck.warnings || []).length > 0 ? (
              <div className="space-y-1">
                {confirmCheck.warnings.map((warning) => (
                  <p key={warning} role="note" className="text-xs text-amber-800">
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}
            {editing?.status === "confirmed" && onSeed ? (
              <SeedFromPattern
                key={`${editing.id}:${suggestSeedFromFocalKsas(editing).competencyIds.join(",")}:${suggestSeedFromFocalKsas(editing).smvs.map((row) => row.key).join(",")}`}
                pattern={editing}
                competencies={competencies}
                competencyModels={competencyModels}
                onSeed={async (seedPayload) => {
                  const seeded = await onSeed(seedPayload);
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
          </div>
        );
      default:
        return null;
    }
  }

  const embedded = Boolean(onDismiss);

  return (
    <div className="space-y-6 p-4">
      {embedded ? null : (
        <header>
          <h2 className="text-lg font-semibold text-slate-900">Design Patterns</h2>
          <p className="mt-1 text-sm text-slate-600">
            Write the argument: title, summary, rationale, and the KSAs it
            centres. A confirmed pattern may be referenced by later seeding.
            It does not authorise a student session.
          </p>
        </header>
      )}

      <div className={embedded ? "space-y-6" : "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"}>
        <div className="flex min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <WizardSidebar
            steps={steps}
            currentStepIndex={stepIndex}
            onStepClick={goToStep}
            canNavigateTo={(index) => canNavigateDesignPatternRail(index, steps.length)}
            isStepComplete={(railStep) =>
              designPatternStepComplete(railStep.id, form, {
                confirmReady: confirmCheck.ready,
              })
            }
            locked={false}
            status={status}
            title="Design Pattern"
            subtitle={editingId ? editing?.name || editingId : "New design pattern"}
            brandInitial="D"
            footerLabel="Design Pattern"
          />
          <WizardStepContainer
            step={stepIndex + 1}
            totalSteps={steps.length}
            onNext={() => goToStep(stepIndex + 1)}
            onBack={() => goToStep(stepIndex - 1)}
            onCancel={onDismiss || cancelEdit}
            canProceed
            isLast={stepIndex === steps.length - 1}
            locked={false}
            status={status}
            isDirty={false}
            modelLabel="Design pattern"
            hidePromoteActions
            editable
            stepTitle={steps[stepIndex].label}
            showProgressPercent
            blockersBanner={blockersCopy || null}
            toolbarActions={
              <div className="flex flex-wrap gap-2" data-testid="design-pattern-toolbar">
                <Button type="button" disabled={busy || !draftCheck.ready} onClick={handleSubmit}>
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
              </div>
            }
          >
            {serverError ? (
              <p className="mb-4 text-sm text-red-600" role="alert">
                {serverError}
              </p>
            ) : null}
            {renderStep()}
          </WizardStepContainer>
        </div>

        {embedded ? (
          editingId ? (
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-medium text-slate-800">Neighbourhood</h3>
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
            </section>
          ) : null
        ) : (
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
        )}
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

function duplicatePatternForm(row) {
  const form = formFromRow(row);
  const name = form.name.trim();
  form.name = name ? `${name} copy` : "copy";
  return form;
}

function patternReadinessValue(row) {
  return designPatternReadiness(row, { strict: true }).ready ? "ready" : "not-ready";
}

function DesignPatternManage() {
  const { auth } = useAuth() || {};
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get("focus");
  const [screen, setScreen] = useState(focusId ? "edit" : "list");
  const [seedForm, setSeedForm] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const { data: patterns = [], isLoading, error } = useDesignPatterns();
  const { data: domainAnalyses = [] } = useDomainAnalyses();
  const { data: templates = [] } = useTemplates();
  const { data: competencies = [] } = useCompetencies();
  const { data: competencyModels = [] } = useCompetencyModels();
  const seedMut = useSeedDesignPattern();
  const updateTemplate = useUpdateTemplate();
  const { data: workProducts = [] } = useWorkProducts();
  const { data: rubrics = [] } = useRubrics();
  const { data: taskModelVariables = [] } = useTaskModelVariables();
  const { data: evidenceModels = [] } = useEvidenceModels();
  const { data: taskModels = [] } = useTaskModels();
  const observationChoices = useMemo(
    () => observationChoicesFromModels(evidenceModels),
    [evidenceModels]
  );
  const createMut = useCreateDesignPattern();
  const updateMut = useUpdateDesignPattern();
  const confirmMut = useConfirmDesignPattern();
  const deleteMut = useDeleteDesignPattern();

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
    setSeedForm(duplicatePatternForm(row));
    setScreen("create");
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <h2 className="mb-4 text-2xl font-semibold">Manage Design Pattern</h2>
        <p className="text-sm text-slate-500">Loading design patterns…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6">
        <h2 className="mb-4 text-2xl font-semibold">Manage Design Pattern</h2>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {apiErrorMessage(error, "Failed to load design patterns")}
        </div>
      </div>
    );
  }

  const library = (
    <DesignPatternLibraryView
      key={screen === "edit" ? `edit-${focusId || "record"}` : `create-${seedForm?.name || "blank"}`}
      patterns={patterns}
      domainAnalyses={domainAnalyses}
      templates={templates}
      competencies={competencies}
      competencyModels={competencyModels}
      seedPending={seedMut.isPending}
      onLoadDescendants={(id) =>
        apiFetch(`/api/designPatterns/${id}/descendants`, {}, auth)
      }
      focusId={screen === "edit" ? focusId : null}
      initialForm={screen === "create" ? seedForm : null}
      onDismiss={backToList}
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

  if (screen === "create" || screen === "edit") return library;

  return (
    <>
      <ModelManageList
        title="Manage Design Pattern"
        description="Author, review and confirm Design Patterns. A confirmed pattern may be referenced by later seeding. It does not authorise a student session."
        newLabel="New Design Pattern"
        onCreate={openCreate}
        records={patterns}
        emptyMessage="No Design Patterns defined yet."
        filteredEmptyMessage="No Design Patterns match the current filters."
        searchLabel="Search design patterns"
        searchPlaceholder="Search patterns…"
        searchText={(row) => `${row.name || ""} ${row.summary || ""}`}
        readinessOf={patternReadinessValue}
        renderMeta={(row) => {
          const ready = patternReadinessValue(row) === "ready";
          const focal = (row.focalKsas || []).length;
          const linked = templatesForPattern(templates, row.id).length;
          const seeded =
            evidenceModels.filter((item) => item?.seededFrom?.designPatternId === row.id).length +
            taskModels.filter((item) => item?.seededFrom?.designPatternId === row.id).length;
          const domainId = String(row.domainAnalysisId || "").trim();
          const domain = domainId
            ? domainAnalyses.find((item) => item.id === domainId)?.name || domainId
            : "Not linked";
          return (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide ${
                  ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {ready ? "Ready" : "Not ready"}
              </span>
              <span>
                {focal} focal KSA{focal === 1 ? "" : "s"}
              </span>
              <span>{domain}</span>
              <span>
                {linked} template{linked === 1 ? "" : "s"}
              </span>
              <span>
                {seeded} seeded model{seeded === 1 ? "" : "s"}
              </span>
            </div>
          );
        }}
        renderDetails={(row) => (
          <>
            <p className="leading-relaxed text-slate-600">
              {String(row.summary || "").trim() || "No summary yet."}
            </p>
            <p className="leading-relaxed text-slate-600">
              {String(row.rationale || "").trim() || "No rationale yet."}
            </p>
          </>
        )}
        renderActions={(row) => {
          const linked = templatesForPattern(templates, row.id);
          return (
            <>
              <button type="button" onClick={() => openEdit(row)} className={manageOpenButtonClass}>
                {openActionLabel(row)}
              </button>
              <button
                type="button"
                onClick={() => openDuplicate(row)}
                className={manageQuietButtonClass}
                title="Open the create wizard with a copy of this pattern"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(row)}
                disabled={linked.length > 0 || deleteMut.isPending}
                title={
                  linked.length > 0
                    ? "Unlink templates before deleting."
                    : undefined
                }
                className={manageDangerButtonClass}
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
          try {
            await deleteMut.mutateAsync(pendingDelete.id);
            toast.success("Design pattern deleted");
          } catch (err) {
            toast.error(apiErrorMessage(err, "Delete failed"));
          }
          setPendingDelete(null);
        }}
        title="Delete Design Pattern"
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

export default function DesignPatternBuilder() {
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
        { id: "dashboard", label: "Dashboard", panel: <DesignPatternDashboard /> },
        {
          id: "structure",
          label: "Design Pattern Structure",
          panel: <DesignPatternTable />,
        },
        {
          id: "manage",
          label: "Manage Design Pattern",
          panel: <DesignPatternManage />,
        },
      ]}
    />
  );
}
