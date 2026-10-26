// src/components/rubrics/RubricBuilder.jsx
//
// D122 library: rubrics with dimensions, levels, and exemplars.
// Evidence models bind via evaluationProcedures.rubricId and via
// phases[].rubricId. Design patterns list the same id under
// potentialRubrics.
//
// The default export is the three-tab shell (Dashboard, Rubric
// Structure, Manage Rubrics). RubricLibraryView is the create and edit
// form. Manage opens that form for New, Edit, and Duplicate.
// ?tab=rubrics still selects this Libraries leaf. focus or id on the
// query opens Manage on that record.
//
// There is no clone route. Duplicate prefills a new draft whose name is
// unique case-insensitively. Confirm still posts to /:id/confirm. A
// confirmed rubric still needs at least one exemplar. Names stay unique.
// Delete stays disabled while the rubric is in use.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/Modal";
import { apiErrorMessage } from "@/api/apiClient";
import {
  useRubrics,
  useCreateRubric,
  useUpdateRubric,
  useConfirmRubric,
  useDeleteRubric,
} from "@/api/queries/rubrics";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import ModelManageList, {
  manageOpenButtonClass,
  manageQuietButtonClass,
  manageDangerButtonClass,
  manageSecondaryButtonClass,
} from "@/components/shared/ModelManageList";
import ModelTabShell from "@/components/shared/ModelTabShell";
import { RUBRIC_SUBJECTS, generateRubricDraft } from "./rubricStarter";
import {
  MAX_RUBRIC_LEVELS,
  MIN_RUBRIC_LEVELS,
  addLevelColumn,
  alignDimensions,
  columnCount,
  columnHasText,
  commitLevelScore,
  patchLevelColumn,
  removeLevelColumn,
} from "./rubricLevels";
import RubricDashboard from "./RubricDashboard";
import RubricTable from "./RubricTable";
import {
  isRubricInUse,
  nameList,
  readinessText,
  recordLabel,
  rubricDeleteBlockedMessage,
  rubricReadinessValue,
  shapeSummary,
  uniqueRubricCopyName,
  usageCounts,
  usageSummary,
} from "./rubricUsage";

export { consumersForRubric, isRubricInUse } from "./rubricUsage";

const LOW_HIGH = [
  { value: 0, label: "Low", descriptor: "", exemplar: "" },
  { value: 1, label: "High", descriptor: "", exemplar: "" },
];

function blankDimension(templateLevels) {
  const levels = templateLevels?.length
    ? templateLevels.map((level) => ({
        value: level.value,
        label: level.label,
        descriptor: "",
        exemplar: "",
      }))
    : LOW_HIGH.map((level) => ({ ...level }));
  const accomplished = levels.find((level) => level.label === "Accomplished");
  return {
    id: `dim_${Math.random().toString(36).slice(2, 8)}`,
    name: "Criterion",
    levels,
    activatesAt: accomplished ? accomplished.value : 1,
    exemplars: {},
  };
}

function levelHeaders(dimensions) {
  return dimensions.reduce(
    (headers, dimension) =>
      (dimension.levels?.length || 0) > headers.length ? dimension.levels : headers,
    []
  );
}

const emptyForm = () => ({
  name: "",
  description: "",
  dimensions: [blankDimension()],
});

function formFromRow(row) {
  const mapped = {
    name: row.name || "",
    description: row.description || "",
    dimensions: Array.isArray(row.dimensions) && row.dimensions.length
      ? row.dimensions.map((d) => ({
          id: d.id,
          name: d.name || "",
          levels: (d.levels || []).map((l) =>
            typeof l === "object" && l != null
              ? {
                  value: l.value,
                  label: l.label || String(l.value),
                  descriptor: l.descriptor || "",
                  exemplar: l.exemplar || (d.exemplars && d.exemplars[l.value]) || "",
                }
              : {
                  value: l,
                  label: String(l),
                  descriptor: "",
                  exemplar: (d.exemplars && d.exemplars[l]) || "",
                }
          ),
          activatesAt: d.activatesAt ?? 1,
          exemplars: d.exemplars || {},
        }))
      : [blankDimension()],
  };
  return { ...mapped, dimensions: alignDimensions(mapped.dimensions) };
}

function buildPayload(form, status = "draft") {
  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    status,
    dimensions: form.dimensions.map((d) => ({
      id: d.id,
      name: d.name,
      levels: d.levels.map((l) => ({
        value: Number.isFinite(Number(l.value)) ? Number(l.value) : l.value,
        label: l.label,
        descriptor: l.descriptor,
        exemplar: l.exemplar,
      })),
      activatesAt: d.activatesAt,
      exemplars: Object.fromEntries(
        d.levels
          .filter((l) => l.exemplar && String(l.exemplar).trim())
          .map((l) => [String(l.value), l.exemplar])
      ),
    })),
  };
}

function recordFocus(searchParams) {
  return searchParams.get("focus") || searchParams.get("id") || "";
}

function mergeForm(seed) {
  const base = emptyForm();
  if (!seed) return base;
  return {
    ...base,
    ...seed,
    dimensions: seed.dimensions?.length ? seed.dimensions : base.dimensions,
  };
}

/** Presentational form. Tests drive it without API hooks. */
export function RubricLibraryView({
  rubrics = [],
  evidenceModels = [],
  designPatterns = [],
  onCreate,
  onUpdate,
  onConfirm,
  createPending = false,
  updatePending = false,
  confirmPending = false,
  onDismiss = null,
  initialForm = null,
  focusId = null,
}) {
  const [form, setForm] = useState(() => {
    if (initialForm) return mergeForm(initialForm);
    if (focusId) {
      const row = rubrics.find((item) => item.id === focusId);
      if (row) return formFromRow(row);
    }
    return emptyForm();
  });
  const [editingId, setEditingId] = useState(() => {
    if (initialForm || !focusId) return null;
    return rubrics.some((row) => row.id === focusId) ? focusId : null;
  });
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [removeIndex, setRemoveIndex] = useState(null);
  const scoreBeforeEdit = useRef({});
  const appliedFocus = useRef(editingId);
  const topics = RUBRIC_SUBJECTS.find((subject) => subject.id === subjectId)?.topics || [];
  const levelCount = columnCount(form.dimensions);

  useEffect(() => {
    if (!focusId || appliedFocus.current === focusId) return;
    const row = rubrics.find((item) => item.id === focusId);
    if (!row) return;
    appliedFocus.current = focusId;
    setEditingId(row.id);
    setForm(formFromRow(row));
  }, [focusId, rubrics]);

  const editing = useMemo(
    () => (editingId ? rubrics.find((row) => row.id === editingId) : null),
    [editingId, rubrics]
  );

  const context = useMemo(
    () => ({ evidenceModels, designPatterns }),
    [evidenceModels, designPatterns]
  );
  const usage = editing ? usageCounts(editing, context) : null;

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setSubjectId("");
    setTopicId("");
    setRemoveIndex(null);
  }

  function writeDraft() {
    const draft = generateRubricDraft({ subjectId, topicId });
    if (!draft) return;
    setForm((current) => ({
      ...current,
      name: current.name.trim() ? current.name : draft.name,
      description: current.description.trim() ? current.description : draft.description,
      dimensions: draft.dimensions,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const payload = buildPayload(form, editing?.status || "draft");
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

  async function handleConfirm() {
    if (!editingId || !onConfirm) return;
    const payload = buildPayload(form, editing?.status || "draft");
    try {
      if (onUpdate) await onUpdate({ id: editingId, payload });
      await onConfirm(editingId);
      if (onDismiss) onDismiss();
      else cancelEdit();
    } catch {
      // The container already toasted the server error.
    }
  }

  function updateDim(idx, patch) {
    setForm((current) => ({
      ...current,
      dimensions: current.dimensions.map((dimension, index) =>
        index === idx ? { ...dimension, ...patch } : dimension
      ),
    }));
  }

  function updateLevel(dimIdx, lvlIdx, patch) {
    setForm((current) => ({
      ...current,
      dimensions: current.dimensions.map((dimension, index) => {
        if (index !== dimIdx) return dimension;
        return {
          ...dimension,
          levels: dimension.levels.map((level, levelIndex) =>
            levelIndex === lvlIdx ? { ...level, ...patch } : level
          ),
        };
      }),
    }));
  }

  function requestRemoveLevel(index) {
    if (levelCount <= MIN_RUBRIC_LEVELS) return;
    if (columnHasText(form.dimensions, index)) {
      setRemoveIndex(index);
      return;
    }
    setForm((current) => ({
      ...current,
      dimensions: removeLevelColumn(current.dimensions, index),
    }));
  }

  function confirmRemoveLevel() {
    if (removeIndex == null) return;
    const index = removeIndex;
    setForm((current) => ({
      ...current,
      dimensions: removeLevelColumn(current.dimensions, index),
    }));
    setRemoveIndex(null);
  }

  const embedded = Boolean(onDismiss);

  return (
    <div className={embedded ? "space-y-6 p-6" : "space-y-6 p-4"}>
      {embedded ? (
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              {editing?.name || form.name.trim() || "New Rubric"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Criteria down the side, levels across. Add level adds a column.
              Confirm posts the saved draft. A confirmed rubric needs at least
              one exemplar.
            </p>
          </div>
          <button type="button" onClick={onDismiss} className={manageSecondaryButtonClass}>
            Back to list
          </button>
        </div>
      ) : (
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Rubrics</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Choose a subject and a topic to write a first grid: criteria down the
            side, four levels across, with a sentence in every cell. Add level
            adds another column. Edit the cells, then save the draft. Subject
            and topic are not stored. Bind the confirmed rubric on an Evidence
            Model via rubricId.
          </p>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40"
      >
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {editingId ? `Edit ${editing?.name || editingId}` : "New rubric"}
        </h3>

        {editingId && usage && (
          <div
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
            data-testid="rubric-consumers-before-edit"
          >
            <p>
              <span className="font-medium">Evidence models (evaluation procedure): </span>
              {nameList(usage.procedures)}
            </p>
            <p>
              <span className="font-medium">Evidence models (phase): </span>
              {nameList(usage.phases)}
            </p>
            <p>
              <span className="font-medium">Design patterns: </span>
              {nameList(usage.designPatterns)}
            </p>
            <p className="mt-1">
              {isRubricInUse(editing, context)
                ? "Delete stays off while an evidence model or a design pattern cites this rubric."
                : "Nothing cites this rubric."}
            </p>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Subject</span>
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              value={subjectId}
              onChange={(event) => {
                setSubjectId(event.target.value);
                setTopicId("");
              }}
            >
              <option value="">Choose a subject</option>
              {RUBRIC_SUBJECTS.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Topic</span>
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              value={topicId}
              disabled={!subjectId}
              onChange={(event) => setTopicId(event.target.value)}
            >
              <option value="">{subjectId ? "Choose a topic" : "Choose a subject first"}</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Button type="button" variant="outline" disabled={!topicId} onClick={writeDraft}>
          Write a first draft
        </Button>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Name</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="font-medium">Description</span>
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              rows={2}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">Rubric criteria and performance levels</caption>
            <thead className="bg-slate-100 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2 font-medium">Criterion</th>
                {levelHeaders(form.dimensions).map((level, li) => (
                  <th
                    key={`level-${li}`}
                    scope="col"
                    aria-label={level.label || `Level ${li + 1}`}
                    className="px-3 py-2 align-top font-medium"
                  >
                    <label className="block text-xs font-normal text-slate-500">
                      Label
                      <input
                        className="mt-1 w-36 rounded border border-slate-300 px-2 py-1 text-sm font-medium text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                        aria-label={`Level ${li + 1} label`}
                        value={level.label}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            dimensions: patchLevelColumn(current.dimensions, li, {
                              label: event.target.value,
                            }),
                          }))
                        }
                      />
                    </label>
                    <label className="mt-2 block text-xs font-normal text-slate-500">
                      Score
                      <input
                        type="number"
                        step="1"
                        className="mt-1 w-20 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950"
                        aria-label={`Level ${li + 1} score`}
                        value={level.value}
                        onFocus={() => {
                          scoreBeforeEdit.current[li] = level.value;
                        }}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            dimensions: patchLevelColumn(current.dimensions, li, {
                              value: event.target.value,
                            }),
                          }))
                        }
                        onBlur={(event) => {
                          const fallback = Object.prototype.hasOwnProperty.call(
                            scoreBeforeEdit.current,
                            li
                          )
                            ? scoreBeforeEdit.current[li]
                            : level.value;
                          setForm((current) => ({
                            ...current,
                            dimensions: commitLevelScore(
                              current.dimensions,
                              li,
                              event.target.value,
                              fallback
                            ),
                          }));
                        }}
                      />
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={levelCount <= MIN_RUBRIC_LEVELS}
                      aria-label={`Remove level ${li + 1}`}
                      title={
                        levelCount <= MIN_RUBRIC_LEVELS
                          ? "A rubric keeps at least two levels."
                          : "Remove this level"
                      }
                      onClick={() => requestRemoveLevel(li)}
                    >
                      Remove
                    </Button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {form.dimensions.map((dimension, dimensionIndex) => (
                <tr
                  key={dimension.id}
                  className="border-t border-slate-200 align-top dark:border-slate-700"
                >
                  <th scope="row" className="px-3 py-2 font-normal">
                    <input
                      className="w-40 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950"
                      value={dimension.name}
                      aria-label={`Criterion ${dimensionIndex + 1}`}
                      onChange={(event) => updateDim(dimensionIndex, { name: event.target.value })}
                    />
                  </th>
                  {levelHeaders(form.dimensions).map((header, levelIndex) => {
                    const level = dimension.levels[levelIndex];
                    if (!level) {
                      return <td key={`${dimension.id}-${levelIndex}`} className="px-3 py-2" />;
                    }
                    const text = level.descriptor || level.exemplar || "";
                    return (
                      <td key={`${dimension.id}-${levelIndex}`} className="px-3 py-2">
                        <textarea
                          className="min-h-24 w-52 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950"
                          aria-label={`${dimension.name} ${header.label || level.label}`}
                          value={text}
                          onChange={(event) =>
                            updateLevel(dimensionIndex, levelIndex, {
                              descriptor: event.target.value,
                              exemplar: event.target.value,
                            })
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setForm((current) => ({
                ...current,
                dimensions: [
                  ...current.dimensions,
                  blankDimension(current.dimensions[0]?.levels),
                ],
              }))
            }
          >
            Add criterion
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={levelCount >= MAX_RUBRIC_LEVELS}
            title={
              levelCount >= MAX_RUBRIC_LEVELS
                ? "A rubric form can add up to 10 levels. Extra imported levels stay on the rubric."
                : "Add a performance level"
            }
            onClick={() =>
              setForm((current) => ({
                ...current,
                dimensions: addLevelColumn(current.dimensions),
              }))
            }
          >
            Add level
          </Button>
          <Button type="submit" disabled={createPending || updatePending}>
            {editingId ? "Save" : "Create draft"}
          </Button>
          {editingId && editing?.status !== "confirmed" && (
            <Button
              type="button"
              variant="outline"
              disabled={confirmPending || updatePending}
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

      <Modal
        isOpen={removeIndex != null}
        onClose={() => setRemoveIndex(null)}
        onConfirm={confirmRemoveLevel}
        title="Remove this level?"
        message="This level has descriptors. Removing it deletes that text from every criterion."
        confirmLabel="Remove level"
        confirmClass="bg-red-600 hover:bg-red-700 text-white"
      />
    </div>
  );
}

function RubricManage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = recordFocus(searchParams);
  const [screen, setScreen] = useState(focusId ? "edit" : "list");
  const [seedForm, setSeedForm] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const { data: rubrics = [], isLoading, error } = useRubrics();
  const { data: evidenceModels = [] } = useEvidenceModels();
  const { data: designPatterns = [] } = useDesignPatterns();
  const createMut = useCreateRubric();
  const updateMut = useUpdateRubric();
  const confirmMut = useConfirmRubric();
  const deleteMut = useDeleteRubric();

  const context = useMemo(
    () => ({ evidenceModels, designPatterns }),
    [evidenceModels, designPatterns]
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
    const seeded = formFromRow(row);
    seeded.name = uniqueRubricCopyName(row.name, rubrics);
    setSeedForm(seeded);
    setScreen("create");
  }

  function askDelete(row) {
    if (isRubricInUse(row, context)) {
      toast.error(rubricDeleteBlockedMessage(usageSummary(row, context)));
      return;
    }
    setPendingDelete(row);
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <h2 className="mb-4 text-2xl font-semibold">Manage Rubrics</h2>
        <p className="text-sm text-slate-500">Loading rubrics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h2 className="mb-4 text-2xl font-semibold">Manage Rubrics</h2>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {apiErrorMessage(error, "Failed to load rubrics")}
        </div>
      </div>
    );
  }

  if (screen === "create" || screen === "edit") {
    return (
      <RubricLibraryView
        key={
          screen === "edit"
            ? `edit-${focusId || "record"}`
            : `create-${seedForm?.name || "blank"}`
        }
        rubrics={rubrics}
        evidenceModels={evidenceModels}
        designPatterns={designPatterns}
        focusId={screen === "edit" ? focusId : null}
        initialForm={screen === "create" ? seedForm : null}
        onDismiss={backToList}
        createPending={createMut.isPending}
        updatePending={updateMut.isPending}
        confirmPending={confirmMut.isPending}
        onCreate={async (payload) => {
          try {
            const created = await createMut.mutateAsync(payload);
            toast.success("Rubric draft created");
            return created;
          } catch (err) {
            toast.error(apiErrorMessage(err, "Create failed"));
            throw err;
          }
        }}
        onUpdate={async ({ id, payload }) => {
          try {
            await updateMut.mutateAsync({ id, payload });
            toast.success("Rubric updated");
          } catch (err) {
            toast.error(apiErrorMessage(err, "Update failed"));
            throw err;
          }
        }}
        onConfirm={async (id) => {
          try {
            await confirmMut.mutateAsync(id);
            toast.success("Rubric confirmed");
          } catch (err) {
            toast.error(apiErrorMessage(err, "Confirm failed"));
            throw err;
          }
        }}
      />
    );
  }

  return (
    <>
      <ModelManageList
        title="Manage Rubrics"
        description="Draft or confirmed scoring rubrics. Confirm posts the saved record. A confirmed rubric needs at least one exemplar. Names stay unique."
        newLabel="New Rubric"
        onCreate={openCreate}
        records={rubrics}
        emptyMessage="No Rubrics defined yet."
        filteredEmptyMessage="No Rubrics match the current filters."
        searchLabel="Search rubrics"
        searchPlaceholder="Search rubrics..."
        searchText={(row) => {
          const counts = usageCounts(row, context);
          const criterionText = (row.dimensions || []).flatMap((dimension) => [
            dimension?.name,
            ...(dimension?.levels || []).map((level) =>
              level && typeof level === "object" ? level.label : level
            ),
          ]);
          return [
            row.name,
            row.description,
            row.status,
            readinessText(row),
            ...criterionText,
            ...counts.evidenceModels.map((model) => recordLabel(model)),
            ...counts.designPatterns.map((pattern) => recordLabel(pattern)),
          ]
            .filter(Boolean)
            .join(" ");
        }}
        readinessOf={rubricReadinessValue}
        renderMeta={(row) => {
          const ready = rubricReadinessValue(row) === "ready";
          return (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide ${
                  ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {ready ? "Ready" : "Not ready"}
              </span>
              <span>{shapeSummary(row)}</span>
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
                Shape: {shapeSummary(row)}. {readinessText(row)}.
              </p>
              <p className="leading-relaxed text-slate-600">
                Evidence models on an evaluation procedure: {nameList(counts.procedures)}.
                Evidence models on a phase: {nameList(counts.phases)}. Design patterns:{" "}
                {nameList(counts.designPatterns)}.
              </p>
            </>
          );
        }}
        renderActions={(row) => {
          const inUse = isRubricInUse(row, context);
          return (
            <>
              <button type="button" onClick={() => openEdit(row)} className={manageOpenButtonClass}>
                Edit
              </button>
              <button
                type="button"
                onClick={() => openDuplicate(row)}
                className={manageQuietButtonClass}
                title="Open the create form with this rubric copied as a draft"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => askDelete(row)}
                disabled={deleteMut.isPending || inUse}
                className={manageDangerButtonClass}
                title={inUse ? "Remove citations before deleting" : "Delete this rubric"}
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
          if (isRubricInUse(pendingDelete, context)) {
            toast.error(rubricDeleteBlockedMessage(usageSummary(pendingDelete, context)));
            setPendingDelete(null);
            return;
          }
          try {
            await deleteMut.mutateAsync(pendingDelete.id);
            toast.success("Rubric deleted");
          } catch (err) {
            toast.error(apiErrorMessage(err, "Delete failed"));
          }
          setPendingDelete(null);
        }}
        title="Delete Rubric"
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

export default function RubricBuilder() {
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
        { id: "dashboard", label: "Dashboard", panel: <RubricDashboard /> },
        { id: "structure", label: "Rubric Structure", panel: <RubricTable /> },
        { id: "manage", label: "Manage Rubrics", panel: <RubricManage /> },
      ]}
    />
  );
}
