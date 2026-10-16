// src/components/itemBank/ItemWizard/steps/Step6Metadata.jsx
// ------------------------------------------------------------
// Step 6 — Domain & Metadata
//
// EVERY FIELD HERE IS NOW A FIELD THE SCHEMA DECLARES. The step it
// replaces wrote six keys that appear in no schema and that nothing ever
// read back —
//
//     metadata.gradeLevel        (schema declares metadata.grade)
//     metadata.subTopic
//     metadata.estimatedTimeSeconds
//     metadata.language
//     metadata.calculatorAllowed
//     metadata.toolsRequired
//     cognitiveDemand.depthOfKnowledge  (schema declares soloLevel)
//
// — while leaving three declared fields with no authoring path at all:
// metadata.difficulty, metadata.difficultyJustification and
// metadata.source. The admin dashboard's Grade chart read
// `metadata.gradeLevel` to match the wizard, so both halves agreed on a
// field the store did not declare; the DOK chart read
// `depthOfKnowledge` for the same reason. The Competency coverage chart
// read `metadata.competencyId`, which NOTHING has ever written — that
// chart has been empty since it shipped, and the competency is derivable
// through the Task Model, so it is derived rather than re-typed.
//
// Delivery constraints (time limit, tools, calculator) are deliberately
// NOT authored here: taskModel.taskStructure.timingConstraint and
// .resourceConstraints already own them, for every item that instantiates
// the model. Duplicating them per item would let one item quietly grant
// a calculator the Task Model forbids.
// ------------------------------------------------------------

import React from "react";
import { Lock, Info } from "lucide-react";
import { useItemWizard } from "../ItemWizardContext";
import { toolsAllowedList } from "@/utils/schema";
import {
  LEARNING_DOMAINS,
  BLOOM_LEVELS,
  SOLO_LEVELS,
  REASONING_TYPES,
  ITEM_SOURCES,
} from "../../itemConstants";
import { intendedDifficultyPlacement } from "@/utils/intendedDifficulty";

const inputClasses =
  "w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed";

function Select({ label, value, options, onChange, disabled, hint, placeholder = "— Select —" }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <select
        value={value || ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={inputClasses}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Text({ label, value, onChange, disabled, placeholder, hint, inherit }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        type="text"
        disabled={disabled}
        placeholder={placeholder}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className={inputClasses}
      />
      {inherit?.value && (
        <button
          type="button"
          onClick={inherit.onApply}
          className="mt-1.5 text-xs font-medium text-blue-600 transition hover:underline"
        >
          Use the blueprint's "{inherit.value}"
        </button>
      )}
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default function Step6Metadata() {
  const { item, ctx, updateField, updateNestedField, mergeObject, canEdit } =
    useItemWizard();

  const metadata = item.metadata || {};
  const cognitiveDemand = item.cognitiveDemand || {};
  const blueprint = ctx.blueprint || {};
  const toolList = toolsAllowedList(
    ctx.taskModel?.taskStructure?.resourceConstraints
  );

  const setMeta = (key) => (value) => updateNestedField("metadata", key, value);
  const setDemand = (key) => (value) =>
    updateNestedField("cognitiveDemand", key, value);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Domain &amp; Metadata
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Cognitive demand, curricular placement and provenance. These drive
          blueprint coverage reporting, so what is entered here is what the
          bank can be balanced against.
        </p>
      </div>

      {!canEdit && (
        <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-600">
          <Lock size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
          Metadata is frozen on a confirmed item.
        </div>
      )}

      {/* --- Cognitive demand --- */}
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Cognitive demand</h3>

        {(blueprint.cognitiveDemand?.bloomLevel ||
          blueprint.cognitiveDemand?.reasoningType) && (
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <Info size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
            <span>
              The Task Model blueprint targets{" "}
              {[
                blueprint.cognitiveDemand?.bloomLevel,
                blueprint.cognitiveDemand?.reasoningType,
              ]
                .filter(Boolean)
                .join(" · ")}
              . Departing from it is allowed and sometimes right — it is
              reported, not blocked.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select
            label="Bloom's level"
            value={cognitiveDemand.bloomLevel}
            options={BLOOM_LEVELS}
            onChange={setDemand("bloomLevel")}
            disabled={!canEdit}
          />
          <Select
            label="SOLO level"
            value={cognitiveDemand.soloLevel}
            options={SOLO_LEVELS}
            onChange={setDemand("soloLevel")}
            disabled={!canEdit}
            hint="Structure of the observed learning outcome."
          />
          <Select
            label="Reasoning type"
            value={cognitiveDemand.reasoningType}
            options={REASONING_TYPES}
            onChange={setDemand("reasoningType")}
            disabled={!canEdit}
          />
        </div>

        <Select
          label="Learning domain"
          value={item.learningDomain}
          options={LEARNING_DOMAINS}
          onChange={(v) => updateField("learningDomain", v)}
          disabled={!canEdit}
          placeholder="— Select —"
        />
      </section>

      {/* --- Curricular placement --- */}
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">
          Curricular placement
        </h3>

        {(blueprint.domainAlignment?.subject ||
          blueprint.domainAlignment?.gradeBand) && (
          <p className="text-xs text-slate-500">
            Blueprint target:{" "}
            {[blueprint.domainAlignment?.subject, blueprint.domainAlignment?.gradeBand]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Seeded from the blueprint on bind. The placeholders here used
              to show the blueprint's values greyed out, which reads as
              "this is already set" while the field was in fact empty and
              would save as empty. Placeholder is an example now; the
              blueprint value is offered as a click. */}
          <Text
            label="Subject"
            value={metadata.subject}
            onChange={setMeta("subject")}
            disabled={!canEdit}
            placeholder="e.g. Mathematics"
            inherit={
              canEdit && blueprint.domainAlignment?.subject !== metadata.subject
                ? {
                    value: blueprint.domainAlignment?.subject,
                    onApply: () => setMeta("subject")(blueprint.domainAlignment.subject),
                  }
                : null
            }
          />
          <Text
            label="Grade"
            value={metadata.grade}
            onChange={setMeta("grade")}
            disabled={!canEdit}
            placeholder="e.g. 8"
            inherit={
              canEdit && blueprint.domainAlignment?.gradeBand !== metadata.grade
                ? {
                    value: blueprint.domainAlignment?.gradeBand,
                    onApply: () => setMeta("grade")(blueprint.domainAlignment.gradeBand),
                  }
                : null
            }
          />
          <Text
            label="Topic"
            value={metadata.topic}
            onChange={setMeta("topic")}
            disabled={!canEdit}
            placeholder="Linear equations"
          />
        </div>

        <Text
          label="Tags"
          value={(metadata.tags || []).join(", ")}
          onChange={(v) =>
            mergeObject("metadata", {
              tags: v
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
          disabled={!canEdit}
          placeholder="comma, separated"
          hint="Free-text tags. Searchable from the Item Bank list."
        />
      </section>

      {/* --- Difficulty & provenance --- */}
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">
          Difficulty &amp; provenance
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="intended-difficulty">
              Intended difficulty
            </label>
            <input
              id="intended-difficulty"
              type="number"
              step="any"
              disabled={!canEdit}
              value={
                intendedDifficultyPlacement(metadata.difficulty, blueprint.difficultyRange).value ??
                (/^-?\d+(\.\d+)?$/.test(String(metadata.difficulty ?? "").trim())
                  ? metadata.difficulty
                  : "")
              }
              onChange={(e) => setMeta("difficulty")(e.target.value)}
              placeholder={
                typeof blueprint.difficultyRange?.min === "number"
                  ? String(blueprint.difficultyRange.min)
                  : "0"
              }
              className={inputClasses}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              {typeof blueprint.difficultyRange?.min === "number" &&
              typeof blueprint.difficultyRange?.max === "number"
                ? `A number inside the task range ${blueprint.difficultyRange.min} to ${blueprint.difficultyRange.max}.`
                : "A number on the task model's difficulty scale, once that range exists."}
            </p>
            {metadata.difficulty &&
              !/^-?\d+(\.\d+)?$/.test(String(metadata.difficulty).trim()) && (
                <p className="mt-1.5 text-xs text-amber-700">
                  Stored “{metadata.difficulty}” is not a number on the task scale.
                </p>
              )}
          </div>
          <Select
            label="Source"
            value={metadata.source}
            options={ITEM_SOURCES}
            onChange={setMeta("source")}
            disabled={!canEdit}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Commentary
          </label>
          <textarea
            rows={3}
            disabled={!canEdit}
            value={metadata.difficultyJustification || ""}
            onChange={(e) => setMeta("difficultyJustification")(e.target.value)}
            placeholder="What makes this item as hard as it is? Read alongside the calibrated parameters once they exist — a large gap between the two is the signal that the construct is not doing the work."
            className={inputClasses}
          />
        </div>
      </section>

      {/* --- Delivery constraints, inherited --- */}
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-6">
        <h3 className="text-sm font-semibold text-slate-800">
          Delivery constraints
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Inherited from the Task Model and not authored per item — one item
          must not quietly grant a resource the Task Model forbids.
        </p>
        <div className="mt-3 space-y-1 text-sm text-slate-700">
          <div>
            <span className="font-medium text-slate-900">Time limit:</span>{" "}
            {ctx.taskModel?.taskStructure?.timingConstraint?.timeLimitSeconds
              ? `${ctx.taskModel.taskStructure.timingConstraint.timeLimitSeconds}s`
              : "not set"}
          </div>
          <div>
            <span className="font-medium text-slate-900">Tools allowed:</span>{" "}
            {/* Read through toolsAllowedList, never off the field. The
                previous `?.length ? ....join(", ")` was truthy for a
                non-empty STRING, which is what the Task Model editor
                actually stored -- so binding a Task Model that named a
                tool threw a TypeError out of this render and unmounted
                the admin console. */}
            {toolList.length ? toolList.join(", ") : "none declared"}
          </div>
        </div>
      </section>
    </div>
  );
}
