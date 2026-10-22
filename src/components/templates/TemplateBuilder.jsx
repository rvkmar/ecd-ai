// src/components/templates/TemplateBuilder.jsx
//
// D127 / W26: Template authoring UI. Four CAF bindings + live family-size
// projection from the bound Task Model's D120 TMV settings (settings live
// on the Task Model — this UI edits a working copy and can write through
// to an unlocked TM; it does not store a second settings copy on the
// template). Binding coherence errors come from the server (apiErrorMessage).
//
// The default export is the three-tab shell (Dashboard, Template
// Structure, Manage Templates). TemplateLibraryView is the create and
// edit form. Manage opens that form for New, Edit, and Duplicate.
// There is no clone route, so Duplicate prefills a new draft.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/Modal";
import WorkedExample from "@/components/authoring/WorkedExample";
import { apiErrorMessage } from "@/api/apiClient";
import { openActionLabel } from "@/utils/modelActionLabel";
import ModelManageList, {
  manageOpenButtonClass,
  manageQuietButtonClass,
  manageDangerButtonClass,
  manageSecondaryButtonClass,
} from "@/components/shared/ModelManageList";
import ModelTabShell from "@/components/shared/ModelTabShell";
import TemplateDashboard from "./TemplateDashboard";
import TemplateTable, { boundName, familySizeForTemplate } from "./TemplateTable";
import {
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useConfirmTemplate,
  useDeleteTemplate,
} from "@/api/queries/templates";
import { useCompetencyModels, useCompetencies } from "@/api/queries/competencies";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useTaskModels, useUpdateTaskModel } from "@/api/queries/taskModels";
import { usePresentationModels } from "@/api/queries/presentationModels";
import { useTaskModelVariables } from "@/api/queries/taskModelVariables";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import {
  projectTaskSpecFamilySize,
  resolveSettingVariation,
} from "@/utils/taskModelVariableFamily";
import { taskModelVariableValueIds, tmvTypeLabel } from "@/utils/ecdVocabulary";
import { templateReadiness } from "@/utils/templateReadiness";
import { useDomainAnalyses } from "@/api/queries/domainAnalyses";
import PerspectiveAtDecision from "@/components/authoring/PerspectiveAtDecision";
import { readStudentPerspective } from "@/utils/perspectiveInheritance";

const selectClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const inputClass = selectClass;

export function evidenceModelsForCompetencyModel(
  evidenceModels,
  competencies,
  competencyModelId
) {
  if (!competencyModelId) return evidenceModels || [];
  const allowed = new Set(
    (competencies || [])
      .filter((c) => c.modelId === competencyModelId)
      .map((c) => c.id)
  );
  return (evidenceModels || []).filter((em) => allowed.has(em.competencyId));
}

export function taskModelsForEvidenceModel(taskModels, evidenceModelId) {
  if (!evidenceModelId) return taskModels || [];
  return (taskModels || []).filter((tm) =>
    (tm.evidenceModelIds || []).includes(evidenceModelId)
  );
}

export function presentationModelsForTaskModel(presentationModels, taskModelId) {
  if (!taskModelId) return presentationModels || [];
  return (presentationModels || []).filter((pm) => pm.taskModelId === taskModelId);
}

export function familySizeFromTaskModel(taskModel, variablesLibrary) {
  if (!taskModel) return 1;
  const ids = taskModel.taskModelVariableIds || [];
  const settings = taskModel.taskModelVariableSettings || [];
  const variables = ids
    .map((id) => (variablesLibrary || []).find((v) => v.id === id))
    .filter(Boolean);
  const boundSettings = ids.map(
    (id) =>
      settings.find((s) => s.taskModelVariableId === id) || {
        taskModelVariableId: id,
        variation: "varying",
      }
  );
  return projectTaskSpecFamilySize(boundSettings, variables);
}

function settingFor(settings, id) {
  return (
    (settings || []).find((s) => s.taskModelVariableId === id) || {
      taskModelVariableId: id,
      required: false,
      variation: "varying",
    }
  );
}

function settingsFromTaskModel(tm) {
  const ids = tm?.taskModelVariableIds || [];
  const settings = tm?.taskModelVariableSettings || [];
  return ids.map((id) => ({ ...settingFor(settings, id) }));
}

const emptyForm = () => ({
  name: "",
  description: "",
  competencyModelId: "",
  evidenceModelId: "",
  taskModelId: "",
  presentationModelId: "",
  designPatternId: "",
  tmvSettings: [],
});

function formFromRow(row, taskModels) {
  const tm = (taskModels || []).find((m) => m.id === row.taskModelId);
  return {
    name: row.name || "",
    description: row.description || "",
    competencyModelId: row.competencyModelId || "",
    evidenceModelId: row.evidenceModelId || "",
    taskModelId: row.taskModelId || "",
    presentationModelId: row.presentationModelId || "",
    designPatternId: row.designPatternId || "",
    tmvSettings: settingsFromTaskModel(tm),
  };
}

function templatePayload(form) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    competencyModelId: form.competencyModelId || undefined,
    evidenceModelId: form.evidenceModelId || undefined,
    taskModelId: form.taskModelId || undefined,
    presentationModelId: form.presentationModelId || undefined,
    designPatternId: form.designPatternId || null,
  };
}

export function templatePatternHref(patternId) {
  return `/admin?tab=designpatterns&focus=${encodeURIComponent(patternId)}`;
}

/** Presentational — Storybook / tests drive without API hooks. */
export function TemplateLibraryView({
  templates = [],
  competencyModels = [],
  competencies = [],
  evidenceModels = [],
  taskModels = [],
  presentationModels = [],
  taskModelVariables = [],
  designPatterns = [],
  domainAnalyses = [],
  focusId = null,
  onCreate,
  onUpdate,
  onConfirm,
  onDelete,
  onSaveTaskModelSettings,
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
  const appliedFocus = useRef(null);

  useEffect(() => {
    if (!focusId || appliedFocus.current === focusId) return;
    const row = templates.find((item) => item.id === focusId);
    if (!row) return;
    appliedFocus.current = focusId;
    setEditingId(row.id);
    setForm(formFromRow(row, taskModels));
    setServerError("");
  }, [focusId, templates, taskModels]);

  const editing = useMemo(
    () => (editingId ? templates.find((t) => t.id === editingId) : null),
    [editingId, templates]
  );

  const emOptions = useMemo(
    () =>
      evidenceModelsForCompetencyModel(
        evidenceModels,
        competencies,
        form.competencyModelId
      ),
    [evidenceModels, competencies, form.competencyModelId]
  );

  const tmOptions = useMemo(
    () => taskModelsForEvidenceModel(taskModels, form.evidenceModelId),
    [taskModels, form.evidenceModelId]
  );

  const pmOptions = useMemo(
    () =>
      presentationModelsForTaskModel(presentationModels, form.taskModelId),
    [presentationModels, form.taskModelId]
  );

  const boundTm = useMemo(
    () => taskModels.find((m) => m.id === form.taskModelId),
    [taskModels, form.taskModelId]
  );

  const boundVariables = useMemo(() => {
    const ids = boundTm?.taskModelVariableIds || [];
    return ids
      .map((id) => taskModelVariables.find((v) => v.id === id))
      .filter(Boolean);
  }, [boundTm, taskModelVariables]);

  const familySize = useMemo(() => {
    if (!boundTm) return null;
    const ids = boundTm.taskModelVariableIds || [];
    const settings = ids.map((id) => settingFor(form.tmvSettings, id));
    return projectTaskSpecFamilySize(settings, boundVariables);
  }, [boundTm, form.tmvSettings, boundVariables]);

  const readiness = templateReadiness(
    { ...templatePayload(form), status: editing?.status || "draft" },
    { strict: false }
  );

  const tmWritable =
    boundTm && !boundTm.locked && ["draft", "reviewed"].includes(boundTm.status);

  function patchForm(patch) {
    setForm((f) => ({ ...f, ...patch }));
    setServerError("");
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm(formFromRow(row, taskModels));
    setServerError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setServerError("");
  }

  function onCompetencyChange(competencyModelId) {
    patchForm({
      competencyModelId,
      evidenceModelId: "",
      taskModelId: "",
      presentationModelId: "",
      tmvSettings: [],
    });
  }

  function onEvidenceChange(evidenceModelId) {
    patchForm({
      evidenceModelId,
      taskModelId: "",
      presentationModelId: "",
      tmvSettings: [],
    });
  }

  function onTaskModelChange(taskModelId) {
    const tm = taskModels.find((m) => m.id === taskModelId);
    patchForm({
      taskModelId,
      presentationModelId: "",
      tmvSettings: settingsFromTaskModel(tm),
    });
  }

  function patchSetting(id, patch) {
    const ids = boundTm?.taskModelVariableIds || [];
    const next = ids.map((vid) => {
      const base = settingFor(form.tmvSettings, vid);
      return vid === id ? { ...base, ...patch } : base;
    });
    patchForm({ tmvSettings: next });
  }

  function setVariation(id, variation) {
    const current = settingFor(form.tmvSettings, id);
    const variable = boundVariables.find((v) => v.id === id);
    const levels = variable ? taskModelVariableValueIds(variable) : [];
    if (variation === "fixed") {
      const fixedValue =
        current.fixedValue ||
        (Array.isArray(current.allowedValues) && current.allowedValues[0]) ||
        levels[0] ||
        "";
      patchSetting(id, {
        variation: "fixed",
        fixedValue,
        allowedValues: undefined,
      });
    } else {
      patchSetting(id, {
        variation: "varying",
        fixedValue: undefined,
        allowedValues: current.allowedValues,
      });
    }
  }

  async function persistTaskModelSettingsIfNeeded() {
    if (!boundTm || !onSaveTaskModelSettings || !tmWritable) return;
    const nextSettings = (boundTm.taskModelVariableIds || []).map((id) =>
      settingFor(form.tmvSettings, id)
    );
    await onSaveTaskModelSettings({
      id: boundTm.id,
      payload: {
        ...boundTm,
        taskModelVariableSettings: nextSettings,
      },
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError("");
    const payload = templatePayload(form);
    try {
      await persistTaskModelSettingsIfNeeded();
      if (editingId) {
        await onUpdate({ id: editingId, payload });
      } else {
        const created = await onCreate(payload);
        if (created?.id) {
          setEditingId(created.id);
          setForm(formFromRow(created, taskModels));
        }
      }
    } catch (err) {
      setServerError(apiErrorMessage(err, "Save failed"));
    }
  }

  async function handleConfirm() {
    if (!editingId) return;
    setServerError("");
    try {
      await persistTaskModelSettingsIfNeeded();
      await onUpdate({ id: editingId, payload: templatePayload(form) });
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

  const embedded = Boolean(onDismiss);

  return (
    <div className={embedded ? "space-y-6 p-6" : "space-y-6 p-4"}>
      {embedded ? (
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              {editing?.name || form.name.trim() || "New Template"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Bind Student, Evidence, Task, and Presentation. Family size comes
              from the bound Task Model.
            </p>
          </div>
          <button type="button" onClick={onDismiss} className={manageSecondaryButtonClass}>
            Back to list
          </button>
        </div>
      ) : (
      <header>
        <h2 className="text-lg font-semibold text-slate-900">Templates</h2>
        <p className="mt-1 text-sm text-slate-600">
          Bind Student, Evidence, Task, and Presentation into a family-generating
          blueprint. Generation is later (W31); family size comes from the bound
          Task Model&apos;s TMV settings.
        </p>
      </header>
      )}

      {templates.length === 0 && (
        <WorkedExample
          title="Plant part naming"
          lines={[
            "Student Model: Plant part naming.",
            "Evidence Model: the claim that a selected name is evidence of that competency.",
            "Task Model: name the indicated part on a familiar diagram.",
            "Presentation Model: how that task is shown.",
          ]}
          citedBy="a Design Pattern, which can link this template once it is confirmed"
        />
      )}

      <div className={embedded ? "space-y-6" : "grid gap-6 lg:grid-cols-2"}>
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium text-slate-800">
            {editingId ? `Edit ${editing?.name || editingId}` : "New template"}
          </h3>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">Name</span>
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => patchForm({ name: e.target.value })}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">Description</span>
              <textarea
                className={inputClass}
                rows={2}
                value={form.description}
                onChange={(e) => patchForm({ description: e.target.value })}
              />
            </label>

            <p id="tpl-pattern-guidance" className="text-xs leading-5 text-slate-500">
              A pattern offers structure to this template. It does not own it.
              Leaving this blank is valid, and Confirm does not require a pattern.
            </p>
            <label className="block text-sm" htmlFor="tpl-design-pattern">
              <span className="mb-1 block text-slate-700">Design pattern</span>
              <select
                id="tpl-design-pattern"
                className={selectClass}
                aria-describedby="tpl-pattern-guidance"
                value={form.designPatternId}
                onChange={(e) => patchForm({ designPatternId: e.target.value })}
              >
                <option value="">None</option>
                {designPatterns.map((pattern) => (
                  <option key={pattern.id} value={pattern.id}>
                    {pattern.name || pattern.id}
                  </option>
                ))}
              </select>
            </label>
            {form.designPatternId ? (
              <a
                className="text-sm text-slate-800 underline"
                href={templatePatternHref(form.designPatternId)}
              >
                Open{" "}
                {designPatterns.find((pattern) => pattern.id === form.designPatternId)
                  ?.name || "design pattern"}
              </a>
            ) : null}

            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">Student Model</span>
              <select
                className={selectClass}
                value={form.competencyModelId}
                onChange={(e) => onCompetencyChange(e.target.value)}
              >
                <option value="">Select…</option>
                {competencyModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.id}
                  </option>
                ))}
              </select>
            </label>
            <PerspectiveAtDecision
              reading={readStudentPerspective(
                competencyModels.find((model) => model.id === form.competencyModelId),
                domainAnalyses
              )}
            />

            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">Evidence Model</span>
              <select
                className={selectClass}
                value={form.evidenceModelId}
                onChange={(e) => onEvidenceChange(e.target.value)}
                disabled={!form.competencyModelId}
              >
                <option value="">Select…</option>
                {emOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">Task Model</span>
              <select
                className={selectClass}
                value={form.taskModelId}
                onChange={(e) => onTaskModelChange(e.target.value)}
                disabled={!form.evidenceModelId}
              >
                <option value="">Select…</option>
                {tmOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">Presentation Model</span>
              <select
                className={selectClass}
                value={form.presentationModelId}
                onChange={(e) => patchForm({ presentationModelId: e.target.value })}
                disabled={!form.taskModelId}
              >
                <option value="">Select…</option>
                {pmOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.id}
                  </option>
                ))}
              </select>
            </label>

            {boundTm && (
              <div
                className="rounded-md border border-slate-200 bg-slate-50 p-3"
                data-testid="template-family-panel"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-sm font-medium text-slate-800">
                    Projected family size
                  </h4>
                  <p
                    className="text-lg font-semibold tabular-nums text-slate-900"
                    data-testid="template-family-size"
                  >
                    {familySize}
                  </p>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  Product of varying TMV value sets on the bound Task Model
                  {tmWritable
                    ? ". Adjusting settings below writes through to that Task Model when you save."
                    : ". Bound Task Model is locked — settings are preview-only here; edit them on the Task Model."}
                </p>

                {(boundTm.taskModelVariableIds || []).length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    This Task Model binds no Task Model Variables (family size 1).
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {(boundTm.taskModelVariableIds || []).map((id) => {
                      const variable = boundVariables.find((v) => v.id === id);
                      const setting = settingFor(form.tmvSettings, id);
                      const variation = resolveSettingVariation(setting);
                      const levels = variable
                        ? taskModelVariableValueIds(variable)
                        : [];
                      return (
                        <li
                          key={id}
                          className="rounded border border-slate-200 bg-white p-2 text-sm"
                        >
                          <div className="font-medium text-slate-800">
                            {variable?.name || id}
                            <span className="ml-2 text-xs font-normal text-slate-500">
                              {variable ? tmvTypeLabel(variable.type) : ""}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-3">
                            <label className="inline-flex items-center gap-1 text-xs">
                              <input
                                type="radio"
                                name={`var-${id}`}
                                checked={variation === "varying"}
                                disabled={!tmWritable}
                                onChange={() => setVariation(id, "varying")}
                              />
                              Varying
                            </label>
                            <label className="inline-flex items-center gap-1 text-xs">
                              <input
                                type="radio"
                                name={`var-${id}`}
                                checked={variation === "fixed"}
                                disabled={!tmWritable}
                                onChange={() => setVariation(id, "fixed")}
                              />
                              Fixed
                            </label>
                          </div>
                          {variation === "fixed" && levels.length > 0 && (
                            <select
                              className={`${selectClass} mt-1`}
                              value={setting.fixedValue || ""}
                              disabled={!tmWritable}
                              onChange={(e) =>
                                patchSetting(id, { fixedValue: e.target.value })
                              }
                            >
                              <option value="">Fixed value…</option>
                              {levels.map((lv) => (
                                <option key={lv} value={lv}>
                                  {lv}
                                </option>
                              ))}
                            </select>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {serverError ? (
              <p
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                data-testid="template-server-error"
                role="alert"
              >
                {serverError}
              </p>
            ) : null}

            {!readiness.ready && (
              <p className="text-xs text-slate-500">
                Draft may be incomplete: {readiness.errors[0]}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="submit" disabled={createPending || updatePending}>
                {editingId ? "Save draft" : "Create draft"}
              </Button>
              {editingId && editing?.status !== "confirmed" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={confirmPending}
                  onClick={handleConfirm}
                >
                  Confirm
                </Button>
              )}
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
        </section>

        {embedded ? null : (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium text-slate-800">Library</h3>
          {templates.length === 0 ? (
            <p className="text-sm text-slate-500">No templates yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {templates.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-2 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {row.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {row.status} · {row.id}
                    </p>
                  </div>
                  <div className="flex gap-1">
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

function duplicateTemplateForm(row, taskModels) {
  const form = formFromRow(row, taskModels);
  const name = String(form.name || "").trim();
  form.name = name ? `${name} copy` : "copy";
  return form;
}

function templateReadinessValue(row) {
  return templateReadiness(row, { strict: true }).ready ? "ready" : "not-ready";
}

function TemplateManage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get("focus");
  const [screen, setScreen] = useState(focusId ? "edit" : "list");
  const [seedForm, setSeedForm] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const { data: templates = [], isLoading, error } = useTemplates();
  const { data: designPatterns = [] } = useDesignPatterns();
  const { data: competencyModels = [] } = useCompetencyModels();
  const { data: domainAnalyses = [] } = useDomainAnalyses();
  const { data: competencies = [] } = useCompetencies();
  const { data: evidenceModels = [] } = useEvidenceModels();
  const { data: taskModels = [] } = useTaskModels();
  const { data: presentationModels = [] } = usePresentationModels();
  const { data: taskModelVariables = [] } = useTaskModelVariables();

  const createMut = useCreateTemplate();
  const updateMut = useUpdateTemplate();
  const confirmMut = useConfirmTemplate();
  const deleteMut = useDeleteTemplate();
  const updateTmMut = useUpdateTaskModel();

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
    setSeedForm(duplicateTemplateForm(row, taskModels));
    setScreen("create");
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <h2 className="mb-4 text-2xl font-semibold">Manage Templates</h2>
        <p className="text-sm text-slate-500">Loading templates…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6">
        <h2 className="mb-4 text-2xl font-semibold">Manage Templates</h2>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {apiErrorMessage(error, "Failed to load templates")}
        </div>
      </div>
    );
  }

  if (screen === "create" || screen === "edit") {
    return (
      <TemplateLibraryView
        key={
          screen === "edit"
            ? `edit-${focusId || "record"}`
            : `create-${seedForm?.name || "blank"}`
        }
        templates={templates}
        competencyModels={competencyModels}
        competencies={competencies}
        evidenceModels={evidenceModels}
        taskModels={taskModels}
        presentationModels={presentationModels}
        taskModelVariables={taskModelVariables}
        designPatterns={designPatterns}
        domainAnalyses={domainAnalyses}
        focusId={screen === "edit" ? focusId : null}
        initialForm={screen === "create" ? seedForm : null}
        onDismiss={backToList}
        createPending={createMut.isPending}
        updatePending={updateMut.isPending}
        confirmPending={confirmMut.isPending}
        deletePending={deleteMut.isPending}
        onCreate={async (payload) => {
          try {
            const created = await createMut.mutateAsync(payload);
            toast.success("Template created");
            return created;
          } catch (err) {
            toast.error(apiErrorMessage(err, "Create failed"));
            throw err;
          }
        }}
        onUpdate={async ({ id, payload }) => {
          try {
            await updateMut.mutateAsync({ id, payload });
            toast.success("Template saved");
          } catch (err) {
            toast.error(apiErrorMessage(err, "Save failed"));
            throw err;
          }
        }}
        onConfirm={async (id) => {
          try {
            await confirmMut.mutateAsync(id);
            toast.success("Template confirmed");
          } catch (err) {
            toast.error(apiErrorMessage(err, "Confirm failed"));
            throw err;
          }
        }}
        onDelete={async (id) => {
          try {
            await deleteMut.mutateAsync(id);
            toast.success("Template deleted");
          } catch (err) {
            toast.error(apiErrorMessage(err, "Delete failed"));
            throw err;
          }
        }}
        onSaveTaskModelSettings={async ({ id, payload }) => {
          await updateTmMut.mutateAsync({ id, payload });
        }}
      />
    );
  }

  return (
    <>
      <ModelManageList
        title="Manage Templates"
        description="Bind Student, Evidence, Task, and Presentation into a family-generating blueprint. Confirming records the bindings. It does not generate items."
        newLabel="New Template"
        onCreate={openCreate}
        records={templates}
        emptyMessage="No Templates defined yet."
        filteredEmptyMessage="No Templates match the current filters."
        searchLabel="Search templates"
        searchPlaceholder="Search templates…"
        searchText={(row) =>
          [
            row.name,
            row.description,
            boundName(competencyModels, row.competencyModelId),
            boundName(taskModels, row.taskModelId),
            boundName(designPatterns, row.designPatternId),
          ]
            .filter((part) => part && part !== "Not linked")
            .join(" ")
        }
        readinessOf={templateReadinessValue}
        renderMeta={(row) => {
          const ready = templateReadinessValue(row) === "ready";
          const familySize = familySizeForTemplate(row, taskModels, taskModelVariables);
          return (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide ${
                  ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {ready ? "Ready" : "Not ready"}
              </span>
              <span>{boundName(competencyModels, row.competencyModelId)}</span>
              <span>{boundName(designPatterns, row.designPatternId)}</span>
              <span>
                {familySize == null ? "No task model" : `Family size ${familySize}`}
              </span>
            </div>
          );
        }}
        renderDetails={(row) => (
          <>
            <p className="leading-relaxed text-slate-600">
              {String(row.description || "").trim() || "No description yet."}
            </p>
            <p className="leading-relaxed text-slate-600">
              Student: {boundName(competencyModels, row.competencyModelId)}. Evidence:{" "}
              {boundName(evidenceModels, row.evidenceModelId)}. Task:{" "}
              {boundName(taskModels, row.taskModelId)}. Presentation:{" "}
              {boundName(presentationModels, row.presentationModelId)}.
            </p>
          </>
        )}
        renderActions={(row) => (
          <>
            <button type="button" onClick={() => openEdit(row)} className={manageOpenButtonClass}>
              {openActionLabel(row)}
            </button>
            <button
              type="button"
              onClick={() => openDuplicate(row)}
              className={manageQuietButtonClass}
              title="Open the create form with these bindings copied"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => setPendingDelete(row)}
              disabled={deleteMut.isPending}
              className={manageDangerButtonClass}
            >
              Delete
            </button>
          </>
        )}
      />
      <Modal
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteMut.mutateAsync(pendingDelete.id);
            toast.success("Template deleted");
          } catch (err) {
            toast.error(apiErrorMessage(err, "Delete failed"));
          }
          setPendingDelete(null);
        }}
        title="Delete Template"
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

export default function TemplateBuilder() {
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
        { id: "dashboard", label: "Dashboard", panel: <TemplateDashboard /> },
        { id: "structure", label: "Template Structure", panel: <TemplateTable /> },
        { id: "manage", label: "Manage Templates", panel: <TemplateManage /> },
      ]}
    />
  );
}
