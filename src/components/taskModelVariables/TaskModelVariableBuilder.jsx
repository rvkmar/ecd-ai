// src/components/taskModelVariables/TaskModelVariableBuilder.jsx
//
// Library of shared Task Model Variables. The default export is the
// three-tab shell (Dashboard, Task Model Variable Structure, Manage Task
// Model Variables). TaskModelVariableLibraryView is the create and edit
// form. Manage opens that form for New, Edit, and Duplicate.
//
// ?tab=taskmodelvariables still selects this Libraries leaf. focus or id
// on the query opens Manage on that record. There is no clone route, so
// Duplicate prefills a new record whose name is unique case-insensitively.
//
// Guards that stay: a vocabulary value set locks once set; the type
// select stays disabled while editing; save is checked on the server
// against task models that list the variable; Delete stays disabled
// while a task model or a design pattern cites the record. The used-by
// list is on the edit form.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/Modal";
import WorkedExample from "@/components/authoring/WorkedExample";
import { apiErrorMessage } from "@/api/apiClient";
import {
  useTaskModelVariables,
  useCreateTaskModelVariable,
  useUpdateTaskModelVariable,
  useDeleteTaskModelVariable,
} from "@/api/queries/taskModelVariables";
import { useTaskModels } from "@/api/queries/taskModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { useDomainAnalyses } from "@/api/queries/domainAnalyses";
import { domainEntryChoices } from "@/utils/domainAnalysisEntries";
import {
  TMV_TYPES,
  TMV_VALUE_SET_KEYS,
  taskModelVariableValueIds,
} from "@/utils/ecdVocabulary";
import ModelManageList, {
  manageOpenButtonClass,
  manageQuietButtonClass,
  manageDangerButtonClass,
  manageSecondaryButtonClass,
} from "@/components/shared/ModelManageList";
import ModelTabShell from "@/components/shared/ModelTabShell";
import TaskModelVariableDashboard from "./TaskModelVariableDashboard";
import TaskModelVariableTable from "./TaskModelVariableTable";
import {
  consumersForVariable,
  designPatternsUsingVariable,
  isVariableInUse,
  levelsSummary,
  nameList,
  readinessText,
  recordLabel,
  uniqueTaskModelVariableCopyName,
  usageCounts,
  usageSummary,
  variableDeleteBlockedMessage,
  variableReadinessValue,
  variableTypeText,
} from "./taskModelVariableUsage";

export { consumersForVariable, isVariableInUse } from "./taskModelVariableUsage";

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950";

const TYPE_FACET = {
  ariaLabel: "Filter by type",
  allLabel: "All types",
  options: TMV_TYPES.map((type) => ({ value: type.value, label: type.label })),
  valueOf: (record) => record.type || "",
};

const emptyForm = () => ({
  name: "",
  description: "",
  type: "categorical",
  valueSet: "bloomLevel",
  possibleValuesText: "",
  rangeMin: "",
  rangeMax: "",
  domainAnalysisId: "",
  taskFeatureId: "",
});

function formFromVariable(row) {
  return {
    name: row.name || "",
    description: row.description || "",
    type: row.type || "categorical",
    valueSet: row.valueSet || "",
    possibleValuesText: Array.isArray(row.possibleValues)
      ? row.possibleValues
          .map((entry) => (typeof entry === "string" ? entry : entry?.value || ""))
          .filter(Boolean)
          .join(", ")
      : "",
    rangeMin: row.range?.min ?? "",
    rangeMax: row.range?.max ?? "",
    domainAnalysisId: row.domainAnalysisId || "",
    taskFeatureId: row.taskFeatureId || "",
  };
}

function buildPayload(form) {
  const payload = {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    type: form.type,
  };
  const usesValueSet = form.type === "categorical" && form.valueSet;
  if (form.type === "numeric") {
    payload.range = { min: Number(form.rangeMin), max: Number(form.rangeMax) };
  } else if (form.type === "boolean") {
    // levels are fixed
  } else if (usesValueSet) {
    payload.valueSet = form.valueSet;
  } else {
    payload.possibleValues = form.possibleValuesText
      .split(/[\n,]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((value) => ({ value, label: value }));
  }
  payload.domainAnalysisId = String(form.domainAnalysisId || "").trim();
  payload.taskFeatureId = String(form.taskFeatureId || "").trim();
  return payload;
}

function recordFocus(searchParams) {
  return searchParams.get("focus") || searchParams.get("id") || "";
}

function taskModelConsumerText(taskModels, variableId) {
  const consumers = consumersForVariable(taskModels, variableId);
  if (!consumers.length) return "none. Safe to edit levels.";
  return consumers
    .map((model) => `${model.name || model.id}${model.status ? ` (${model.status})` : ""}`)
    .join("; ");
}

function TaskFeatureFields({ domainAnalyses, domainAnalysisId, taskFeatureId, onChange }) {
  const choices = domainEntryChoices(domainAnalyses, "taskFeatures", domainAnalysisId);
  const known = choices.some((row) => row.id === taskFeatureId);
  return (
    <div className="space-y-2">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Domain Analysis</span>
          <select
            className={inputClass}
            aria-label="Domain Analysis"
            value={domainAnalysisId || ""}
            onChange={(event) => {
              const nextId = event.target.value;
              const nextChoices = domainEntryChoices(domainAnalyses, "taskFeatures", nextId);
              const stillThere = !taskFeatureId || nextChoices.some((row) => row.id === taskFeatureId);
              onChange({
                domainAnalysisId: nextId,
                taskFeatureId: stillThere ? taskFeatureId : "",
              });
            }}
          >
            <option value="">No Domain Analysis cited</option>
            {(domainAnalyses || []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.name || row.id}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Task feature</span>
          <select
            className={inputClass}
            aria-label="Task feature"
            value={taskFeatureId || ""}
            onChange={(event) => onChange({ taskFeatureId: event.target.value })}
          >
            <option value="">Not linked</option>
            {taskFeatureId && !known ? (
              <option value={taskFeatureId}>{taskFeatureId} (not found)</option>
            ) : null}
            {choices.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label || row.id}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Optional. Leave both unset to keep this variable as it is. When a Domain Analysis is chosen, the task feature list is that analysis.
      </p>
    </div>
  );
}

function TaskModelVariableExample() {
  return (
    <WorkedExample
      title="Diagram familiarity"
      lines={[
        "Type: categorical.",
        "Values: familiar, unfamiliar.",
        "Whether the plant in the diagram is one the student has already studied.",
      ]}
      citedBy="a Task Model, in taskModelVariableIds. A Design Pattern may list it as a variable feature"
    />
  );
}

function TypeBadge({ record }) {
  return (
    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
      {variableTypeText(record.type)}
    </span>
  );
}

/** Presentational form. Storybook and tests drive it without API hooks. */
export function TaskModelVariableLibraryView({
  variables = [],
  taskModels = [],
  designPatterns = [],
  domainAnalyses = [],
  onCreate,
  onUpdate,
  createPending = false,
  updatePending = false,
  onDismiss = null,
  initialForm = null,
  focusId = null,
}) {
  const [form, setForm] = useState(() => {
    if (initialForm) return { ...emptyForm(), ...initialForm };
    if (focusId) {
      const row = variables.find((item) => item.id === focusId);
      if (row) return formFromVariable(row);
    }
    return emptyForm();
  });
  const [editingId, setEditingId] = useState(() => {
    if (initialForm || !focusId) return null;
    return variables.some((row) => row.id === focusId) ? focusId : null;
  });
  const appliedFocus = useRef(editingId);

  useEffect(() => {
    if (!focusId || appliedFocus.current === focusId) return;
    const row = variables.find((item) => item.id === focusId);
    if (!row) return;
    appliedFocus.current = focusId;
    setEditingId(row.id);
    setForm(formFromVariable(row));
  }, [focusId, variables]);

  const editing = useMemo(
    () => (editingId ? variables.find((row) => row.id === editingId) : null),
    [editingId, variables]
  );

  const usesValueSet = form.type === "categorical" && !!form.valueSet;
  const usesAuthorList =
    form.type === "categorical" || form.type === "ordinal" ? !usesValueSet : false;
  const editingValueSetLocked = Boolean(editing?.valueSet);

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const payload = buildPayload(form);
    if (editingId && editingValueSetLocked) {
      payload.type = editing.type;
      payload.valueSet = editing.valueSet;
      delete payload.possibleValues;
    }
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
  const editingPatterns = editingId
    ? designPatternsUsingVariable(designPatterns, editingId)
    : [];

  return (
    <div className={embedded ? "space-y-6 p-6" : "space-y-6 p-4"}>
      {embedded ? (
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              {editing?.name || form.name.trim() || "New Task Model Variable"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              A shared design feature. Bind it on any number of Task Models.
              Levels stay in the vocabulary when a value set is named.
            </p>
          </div>
          <button type="button" onClick={onDismiss} className={manageSecondaryButtonClass}>
            Back to list
          </button>
        </div>
      ) : (
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Task Model Variables
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Shared design features (PADI Fig. 11). Define a variable once; bind
            it on any number of Task Models. Levels stay in vocabulary when a
            value set is named. No CAF lifecycle on these records.
          </p>
        </div>
      )}

      {variables.length === 0 && <TaskModelVariableExample />}

      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40"
      >
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {editingId ? `Edit ${editing?.name || editingId}` : "New variable"}
        </h3>

        {editingId && (
          <div
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
            data-testid="tmv-consumers-before-edit"
          >
            <p>
              <span className="font-medium">Consuming Task Models: </span>
              {taskModelConsumerText(taskModels, editingId)}
            </p>
            <p>
              <span className="font-medium">Design patterns: </span>
              {nameList(editingPatterns)}
            </p>
            <p className="mt-1">Saving is checked against the Task Models that use this variable.</p>
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
              disabled={Boolean(editingId)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  type: event.target.value,
                  valueSet:
                    event.target.value === "categorical" ? current.valueSet || "bloomLevel" : "",
                }))
              }
            >
              {TMV_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Description</span>
          <input
            className={inputClass}
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
          />
        </label>

        <TaskFeatureFields
          domainAnalyses={domainAnalyses}
          domainAnalysisId={form.domainAnalysisId}
          taskFeatureId={form.taskFeatureId}
          onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        />

        {form.type === "categorical" && !editingValueSetLocked && (
          <label className="block text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Value set (vocabulary)
            </span>
            <select
              className={inputClass}
              value={form.valueSet}
              disabled={Boolean(editingId)}
              onChange={(event) => setForm((current) => ({ ...current, valueSet: event.target.value }))}
            >
              <option value="">Author-supplied levels</option>
              {TMV_VALUE_SET_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
        )}

        {editingValueSetLocked && (
          <div
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"
            data-testid="tmv-valueset-readonly"
          >
            <p className="font-medium">
              Levels from vocabulary ({editing.valueSet}) — read-only
            </p>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              These values are defined in ecdVocabulary.js via valueSet. They are
              not copied onto the record and cannot be edited here.
            </p>
            <p className="mt-2 font-mono text-xs">
              {taskModelVariableValueIds(editing).join(", ")}
            </p>
          </div>
        )}

        {usesAuthorList && !editingValueSetLocked && (
          <label className="block text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Possible values (comma or newline)
            </span>
            <textarea
              className={inputClass}
              rows={3}
              value={form.possibleValuesText}
              onChange={(event) =>
                setForm((current) => ({ ...current, possibleValuesText: event.target.value }))
              }
              required={!editingId}
            />
          </label>
        )}

        {form.type === "numeric" && (
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Range min</span>
              <input
                type="number"
                className={inputClass}
                value={form.rangeMin}
                onChange={(event) => setForm((current) => ({ ...current, rangeMin: event.target.value }))}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Range max</span>
              <input
                type="number"
                className={inputClass}
                value={form.rangeMax}
                onChange={(event) => setForm((current) => ({ ...current, rangeMax: event.target.value }))}
                required
              />
            </label>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={editingId ? updatePending : createPending}>
            {editingId
              ? updatePending
                ? "Saving…"
                : "Save changes"
              : createPending
                ? "Creating…"
                : "Create Task Model Variable"}
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

      {!embedded && variables.length === 0 ? (
        <p className="text-sm text-slate-500">No Task Model Variables yet.</p>
      ) : null}
    </div>
  );
}

function TaskModelVariableManage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = recordFocus(searchParams);
  const [screen, setScreen] = useState(focusId ? "edit" : "list");
  const [seedForm, setSeedForm] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const { data: variables = [], isLoading, error } = useTaskModelVariables();
  const { data: taskModels = [] } = useTaskModels();
  const { data: designPatterns = [] } = useDesignPatterns();
  const { data: domainAnalyses = [] } = useDomainAnalyses();
  const createMut = useCreateTaskModelVariable();
  const updateMut = useUpdateTaskModelVariable();
  const deleteMut = useDeleteTaskModelVariable();

  const context = useMemo(
    () => ({ taskModels, designPatterns }),
    [taskModels, designPatterns]
  );

  useEffect(() => {
    if (focusId) setScreen("edit");
  }, [focusId]);

  function clearFocus() {
    if (!searchParams.get("focus") && !searchParams.get("id")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    next.delete("id");
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
    next.delete("id");
    next.set("focus", row.id);
    setSearchParams(next);
    setSeedForm(null);
    setScreen("edit");
  }

  function openDuplicate(row) {
    clearFocus();
    setSeedForm({
      ...formFromVariable(row),
      name: uniqueTaskModelVariableCopyName(row.name, variables),
    });
    setScreen("create");
  }

  function askDelete(row) {
    if (isVariableInUse(row, context)) {
      toast.error(variableDeleteBlockedMessage(row, context));
      return;
    }
    setPendingDelete(row);
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <h2 className="mb-4 text-2xl font-semibold">Manage Task Model Variables</h2>
        <p className="text-sm text-slate-500">Loading task model variables...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h2 className="mb-4 text-2xl font-semibold">Manage Task Model Variables</h2>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {apiErrorMessage(error, "Failed to load Task Model Variables")}
        </div>
      </div>
    );
  }

  if (screen === "create" || screen === "edit") {
    return (
      <TaskModelVariableLibraryView
        key={
          screen === "edit"
            ? `edit-${focusId || "record"}`
            : `create-${seedForm?.name || "blank"}`
        }
        variables={variables}
        taskModels={taskModels}
        designPatterns={designPatterns}
        domainAnalyses={domainAnalyses}
        focusId={screen === "edit" ? focusId : null}
        initialForm={screen === "create" ? seedForm : null}
        onDismiss={backToList}
        createPending={createMut.isPending}
        updatePending={updateMut.isPending}
        onCreate={async (payload) => {
          try {
            const created = await createMut.mutateAsync(payload);
            toast.success("Task Model Variable created.");
            return created;
          } catch (err) {
            toast.error(apiErrorMessage(err, "Create failed."));
            throw err;
          }
        }}
        onUpdate={async ({ id, payload }) => {
          try {
            await updateMut.mutateAsync({ id, payload });
            toast.success("Task Model Variable updated.");
          } catch (err) {
            toast.error(apiErrorMessage(err, "Update failed."));
            throw err;
          }
        }}
      />
    );
  }

  return (
    <>
      {variables.length === 0 ? (
        <div className="px-6 pt-6">
          <TaskModelVariableExample />
        </div>
      ) : null}
      <ModelManageList
        title="Manage Task Model Variables"
        description="Shared design features. A variable is defined once and bound on Task Models. Design patterns can list it as a variable feature. These records have no lifecycle status."
        newLabel="New Task Model Variable"
        onCreate={openCreate}
        records={variables}
        emptyMessage="No Task Model Variables defined yet."
        filteredEmptyMessage="No Task Model Variables match the current filters."
        facet={TYPE_FACET}
        renderBadge={(row) => <TypeBadge record={row} />}
        searchLabel="Search task model variables"
        searchPlaceholder="Search task model variables..."
        searchText={(row) => {
          const counts = usageCounts(row, context);
          return [
            row.name,
            row.description,
            variableTypeText(row.type),
            row.valueSet,
            ...counts.taskModels.map((model) => recordLabel(model)),
            ...counts.designPatterns.map((pattern) => recordLabel(pattern)),
          ]
            .filter(Boolean)
            .join(" ");
        }}
        readinessOf={variableReadinessValue}
        renderMeta={(row) => {
          const ready = variableReadinessValue(row) === "ready";
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
                Task models: {nameList(counts.taskModels)}. Design patterns:{" "}
                {nameList(counts.designPatterns)}.
              </p>
              <p className="leading-relaxed text-slate-600">
                {levelsSummary(row)}. {readinessText(row)}.
              </p>
            </>
          );
        }}
        renderActions={(row) => {
          const inUse = isVariableInUse(row, context);
          return (
            <>
              <button type="button" onClick={() => openEdit(row)} className={manageOpenButtonClass}>
                Edit
              </button>
              <button
                type="button"
                onClick={() => openDuplicate(row)}
                className={manageQuietButtonClass}
                title="Open the create form with this variable copied"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => askDelete(row)}
                disabled={deleteMut.isPending || inUse}
                className={manageDangerButtonClass}
                title={
                  inUse
                    ? "Unbind task models and design patterns before deleting"
                    : "Delete this task model variable"
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
          if (isVariableInUse(pendingDelete, context)) {
            toast.error(variableDeleteBlockedMessage(pendingDelete, context));
            setPendingDelete(null);
            return;
          }
          try {
            await deleteMut.mutateAsync(pendingDelete.id);
            toast.success("Task Model Variable deleted.");
          } catch (err) {
            toast.error(apiErrorMessage(err, "Delete failed."));
          }
          setPendingDelete(null);
        }}
        title="Delete Task Model Variable"
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

export default function TaskModelVariableBuilder() {
  const [searchParams] = useSearchParams();
  const focusId = recordFocus(searchParams);
  const [mode, setMode] = useState(focusId ? "manage" : "dashboard");

  useEffect(() => {
    if (focusId) setMode("manage");
  }, [focusId]);

  return (
    <ModelTabShell
      mode={mode}
      onModeChange={setMode}
      tabs={[
        { id: "dashboard", label: "Dashboard", panel: <TaskModelVariableDashboard /> },
        {
          id: "structure",
          label: "Task Model Variable Structure",
          panel: <TaskModelVariableTable />,
        },
        { id: "manage", label: "Manage Task Model Variables", panel: <TaskModelVariableManage /> },
      ]}
    />
  );
}
