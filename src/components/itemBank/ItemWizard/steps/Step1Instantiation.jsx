// src/components/itemBank/ItemWizard/steps/Step1Instantiation.jsx
// ------------------------------------------------------------
// Step 1 — Instantiation
//
// The item's single governing link: which Task Model it instantiates and
// which of that model's DECLARED observations it elicits. Everything
// downstream is derived from these two choices, and the derived chain is
// shown here read-only so the author can see what the binding commits
// them to before they build anything on top of it.
//
// Two fixes worth naming:
//
//  * The Task Model picker filtered on `status === "confirmed" && locked`,
//    so the moment a Task Model was activated it vanished from the list
//    and no new item could be authored against the very blueprint that
//    was live. isInstantiableTaskModel() is the predicate the server
//    actually enforces.
//
//  * The selected model was held in LOCAL state, set only by the change
//    handler. Reopening a saved item therefore rendered no observation
//    picker and no summary -- the binding existed on the record but the
//    step showed an empty form. It is derived from the item now.
// ------------------------------------------------------------

import React, { useMemo } from "react";
import { Lock, Link2, AlertTriangle, Info } from "lucide-react";
import { useItemWizard } from "../ItemWizardContext";
import { useTaskModels } from "@/api/queries/taskModels";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useCompetencies } from "@/api/queries/competencies";
import { isInstantiableTaskModel } from "@/utils/schema";
import { versionLabel, interactionLabel } from "../../itemConstants";

function Field({ label, value, mono = false }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div
        className={`mt-0.5 break-words text-sm text-slate-900 ${
          mono ? "font-mono text-[13px]" : ""
        }`}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

export default function Step1Instantiation() {
  const {
    item,
    ctx,
    taskModel,
    evidenceModel,
    chainLoading,
    bindTaskModel,
    bindObservation,
    canEdit,
  } = useItemWizard();

  const { data: allTaskModels = [], isLoading } = useTaskModels();

  /* The observation picker needs each observable's STATEMENT to be
     readable, and the statement lives on the Evidence Model. The wizard
     context resolves an Evidence Model from `item.evidenceModelId`, which
     is only set once an observation has been chosen -- so before the first
     selection every option rendered as its raw id ("o3 — weight 0.5"),
     and after a selection they all snapped to full descriptions. The
     author had to choose blind, then re-read what they had chosen.

     A Task Model's expectedObservations name their Evidence Models, so
     the whole set is knowable the moment the Task Model is bound. The
     list is already in React Query's cache for the Evidence Model
     builder, so this usually costs no request.

     Competencies likewise: the derived chain showed a raw construct id.  */
  const { data: evidenceModels = [] } = useEvidenceModels();
  const { data: competencies = [] } = useCompetencies();

  const taskModels = useMemo(
    () => (allTaskModels || []).filter(isInstantiableTaskModel),
    [allTaskModels]
  );

  const observations = taskModel?.expectedObservations || [];

  // A locked item may reference a Task Model that has since been
  // archived and so is not in the selectable list. Show it anyway --
  // otherwise a confirmed item's own binding renders as "-- Select --".
  const options = useMemo(() => {
    if (!taskModel || taskModels.some((t) => t.id === taskModel.id)) {
      return taskModels;
    }
    return [taskModel, ...taskModels];
  }, [taskModels, taskModel]);

  /* Resolved across ALL evidence models the Task Model references, not
     just the one the current selection happens to point at. */
  const observableFor = (observationId) => {
    const declared = observations.find((eo) => eo.observationId === observationId);
    if (!declared) return null;

    const em = evidenceModels.find((e) => e.id === declared.evidenceModelId);
    return (em?.observables || []).find((o) => o.id === observationId) || null;
  };

  const competencyName = useMemo(() => {
    const emId = item.evidenceModelId;
    const em = evidenceModels.find((e) => e.id === emId) || evidenceModel;
    if (!em?.competencyId) return null;

    const competency = competencies.find((c) => c.id === em.competencyId);
    // Fall back to the id rather than showing nothing -- but the id is the
    // fallback, not the default, which is how it used to render.
    return competency?.name || em.competencyId;
  }, [item.evidenceModelId, evidenceModels, evidenceModel, competencies]);

  const selectClasses =
    "w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Instantiation</h2>
        <p className="mt-1 text-sm text-slate-500">
          An Item exists only as an instantiation of a Task Model. Bind one,
          then choose which of its declared observations this item elicits.
        </p>
      </div>

      {!canEdit && (
        <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-600">
          <Lock size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
          Structural bindings are frozen once an item is confirmed. Clone the
          item to bind it differently.
        </div>
      )}

      {/* --- Task Model --- */}
      <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <label htmlFor="item-wizard-task-model" className="mb-1.5 block text-sm font-medium text-slate-700">
          Task Model
        </label>

        <select
          id="item-wizard-task-model"
          value={item.taskModelId || ""}
          disabled={!canEdit || isLoading}
          onChange={(e) => {
            const tm = options.find((t) => t.id === e.target.value) || null;
            bindTaskModel(tm);
          }}
          className={selectClasses}
        >
          <option value="">
            {isLoading ? "Loading Task Models…" : "— Select a Task Model —"}
          </option>
          {options.map((tm) => (
            <option key={tm.id} value={tm.id}>
              {tm.name || tm.id} ({versionLabel(tm.versionNumber)} · {tm.status})
            </option>
          ))}
        </select>

        {!isLoading && taskModels.length === 0 && (
          <div className="mt-3 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
            <span>
              No Task Model is ready to be instantiated. Items can be authored
              against confirmed, operational or suspended Task Models — confirm
              one first.
            </span>
          </div>
        )}

        {taskModel && (
          <p className="mt-2 text-xs text-slate-500">
            {taskModel.description || "No description recorded on this Task Model."}
          </p>
        )}
      </div>

      {/* --- Observation --- */}
      {taskModel && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <label htmlFor="item-wizard-observation" className="mb-1.5 block text-sm font-medium text-slate-700">
            Observation elicited
          </label>

          <select
            id="item-wizard-observation"
            value={item.observationId || ""}
            disabled={!canEdit}
            onChange={(e) => bindObservation(e.target.value || null)}
            className={selectClasses}
          >
            <option value="">— Select an observation —</option>
            {observations.map((obs) => {
              const observable = observableFor(obs.observationId);
              return (
                <option key={obs.observationId} value={obs.observationId}>
                  {/* The statement, not the raw id. The picker used to read
                      "obs_1755…  — Weight: 0.4", which tells an author
                      nothing about what they are choosing. */}
                  {observable?.statement || obs.observationId}
                  {typeof obs.weight === "number"
                    ? ` — weight ${obs.weight}`
                    : ""}
                  {obs.required ? " · required" : ""}
                </option>
              );
            })}
          </select>

          {observations.length === 0 && (
            <div className="mt-3 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
              This Task Model declares no expected observations, so there is
              nothing for an item to elicit. Add one on the Task Model first.
            </div>
          )}
        </div>
      )}

      {/* --- Derived chain --- */}
      {item.taskModelId && item.observationId && (
        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Link2 size={15} strokeWidth={2.25} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-800">
              Derived evidence chain
            </h3>
          </div>

          <p className="text-xs text-slate-500">
            These are computed from the binding above and recomputed on every
            save. They are not authored, and cannot disagree with the Task
            Model that produces them.
          </p>

          {chainLoading && (
            <div className="text-sm text-slate-500">Resolving chain…</div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Task Model"
              value={`${taskModel?.name || item.taskModelId} · ${versionLabel(
                item.taskModelVersion
              )}`}
            />
            <Field
              label="Evidence Model"
              value={
                evidenceModel
                  ? `${evidenceModel.name || evidenceModel.id} · ${versionLabel(
                      evidenceModel.versionNumber
                    )} · ${evidenceModel.status}`
                  : item.evidenceModelId || "—"
              }
            />
            <Field label="Observable" value={ctx.observable?.statement} />
            <Field
              label="Response mode"
              value={ctx.observable?.type}
              mono
            />
            <Field
              label="Statistical model"
              value={
                ctx.activeStatisticalModel
                  ? `${ctx.activeStatisticalModel.type}${
                      ctx.activeStatisticalModel.subtype
                        ? ` (${ctx.activeStatisticalModel.subtype})`
                        : ""
                    }`
                  : "none active"
              }
            />
            <Field label="Construct" value={competencyName} />
          </div>

          {ctx.observable && ctx.observableInteractions.length === 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
              <span>
                This observable captures a <strong>{ctx.observable.type}</strong>,
                which is rated or logged rather than answered on screen. No item
                can capture it yet — choose an observation with a selected,
                constructed or numeric response mode.
              </span>
            </div>
          )}

          {ctx.observable && ctx.observableInteractions.length > 0 && (
            ctx.allowedInteractionTypes.length > 0 ? (
              <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <Info size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
                <span>
                  A <strong>{ctx.observable.type}</strong> observation can be
                  elicited by{" "}
                  {/* Labels, not raw codes. Step 1 read "elicited by: mcq"
                      while step 4 read "Numeric Input" for the same kind of
                      sentence. */}
                  <strong>
                    {ctx.allowedInteractionTypes.map(interactionLabel).join(", ")}
                  </strong>
                  .
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertTriangle size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
                <span>
                  {/* Previously: "...can be elicited by: nothing, once the
                      Task Model blueprint is applied." A bare "nothing"
                      dropped into a sentence, describing a contradiction
                      the author cannot fix from this screen. */}
                  A <strong>{ctx.observable.type}</strong> observation can be
                  elicited by{" "}
                  {ctx.observableInteractions.map(interactionLabel).join(", ")},
                  but this Task Model's blueprint permits none of those. The
                  blueprint and the observation contradict each other, so no
                  item can satisfy both — one of them has to change on the
                  Task Model.
                </span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
