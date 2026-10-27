// src/components/qMatrix/QMatrixEditor.jsx
// ------------------------------------------------------------
// D51/D52 -- the Q-matrix editor. A single screen, not a multi-step
// wizard: a Q-matrix is one artifact (metadata + a grid), not a sequence
// of independent decisions, so it reuses the shared WizardStepContainer
// as a ONE-step shell purely for its already-tested Save/Review/Return-
// to-draft/Lock&Confirm button set and discard-changes modal, rather than
// reinventing that logic.
//
// Rows (items) are scoped to the selected competency model via the same
// chain useItemListData already derives elsewhere in this codebase:
// item.evidenceModelId -> evidenceModel.competencyId -> competency.modelId
// -- not the whole item bank, which would be both meaningless (most items
// have nothing to do with this construct) and unusable at scale.
//
// Only items the author explicitly adds become rows. This makes D52's
// "no all-zero rows" rule meaningful: a row that exists is a real
// authoring decision, so a row with nothing checked is genuinely a
// mistake, not just an unaddressed item sitting in a large bank.
// ------------------------------------------------------------

import React, { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import WizardStepContainer from "@/components/wizard/WizardStepContainer";
import QMatrixGrid from "./QMatrixGrid";
import { computeQMatrixValidity } from "./QMatrixValidity";
import {
  entryForRow,
  qMatrixRowKey,
  rowsFromEntries,
} from "@/utils/qMatrixEntries";

import { apiErrorMessage } from "@/api/apiClient";
import { useCompetencyModels, useCompetencies } from "@/api/queries/competencies";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useItems } from "@/api/queries/items";
import {
  useQMatrixModel,
  useCreateQMatrixModel,
  useUpdateQMatrixModel,
  useTransitionQMatrixModel,
} from "@/api/queries/qMatrixModels";

// Exported (not just used inline) so the filter itself is a plain,
// unit-testable function -- same reasoning QMatrixValidity.js gives for
// living outside the component: no need to mount QMatrixEditor's full
// React-Query-backed tree just to check a predicate over plain objects.
export function hasBinarySmVariable(model) {
  return (model?.smVariables || []).some((v) => v.type === "binary");
}

const emptyDraft = () => ({
  id: undefined,
  name: "",
  description: "",
  competencyModelId: "",
  competencyModelVersion: undefined,
  attributeIds: [],
  entries: [],
  domainAnalysisId: "",
  status: "draft",
  locked: false,
});

// Duplicate has no clone route. The create form opens with these fields
// copied and no id, so the next save is a new draft. Status, lock, and
// version stay off the copy. A Domain Analysis citation on the URL fills
// only when the seed does not already name one.
function draftFromSeed(seed, domainAnalysisId) {
  const base = emptyDraft();
  if (domainAnalysisId) base.domainAnalysisId = domainAnalysisId;
  if (!seed) return base;
  return {
    ...base,
    name: seed.name || "",
    description: seed.description || "",
    competencyModelId: seed.competencyModelId || "",
    competencyModelVersion: seed.competencyModelVersion,
    attributeIds: Array.isArray(seed.attributeIds) ? [...seed.attributeIds] : [],
    entries: Array.isArray(seed.entries) ? seed.entries.map((entry) => ({ ...entry })) : [],
    domainAnalysisId: seed.domainAnalysisId || domainAnalysisId || "",
    status: "draft",
    locked: false,
    id: undefined,
  };
}

export default function QMatrixEditor({
  qMatrixId,
  onCancel,
  onSaved,
  readOnly = false,
  domainAnalysisId,
  initialDraft = null,
  domainAnalyses = [],
}) {
  const isEditing = Boolean(qMatrixId);
  const { data: existing, isLoading: loadingExisting } = useQMatrixModel(qMatrixId, {
    enabled: isEditing,
  });

  const { data: competencyModels = [] } = useCompetencyModels();
  const { data: items = [] } = useItems();
  const { data: evidenceModels = [] } = useEvidenceModels();
  const { data: competencies = [] } = useCompetencies();

  const [draft, setDraft] = useState(() => draftFromSeed(initialDraft, domainAnalysisId));
  const [includedRows, setIncludedRows] = useState(() => rowsFromEntries(initialDraft?.entries));
  const [isDirty, setIsDirty] = useState(false);

  // `draft.id` is also mirrored into this ref, updated synchronously
  // wherever `draft` changes. `transitionTo()` reads the ref rather than
  // `draft.id` so it never sees a stale value: `handleSave()` in
  // WizardStepContainer awaits onSaveDraft() then calls onSaveAndReview()
  // using the SAME closures captured at the render that created them --
  // React hasn't necessarily re-rendered (and hasn't necessarily even run
  // the commit's effects) by the time the second call happens, so a plain
  // `draft.id` read here can still be `undefined` for a brand-new record
  // even though persist() already saved it and got a real id back.
  const draftIdRef = useRef(draft.id);

  useEffect(() => {
    if (isEditing && existing) {
      setDraft(existing);
      draftIdRef.current = existing.id;
      setIncludedRows(rowsFromEntries(existing.entries));
      setIsDirty(false);
    }
  }, [isEditing, existing]);

  useEffect(() => {
    if (isEditing || !domainAnalysisId) return;
    setDraft((current) =>
      current.domainAnalysisId ? current : { ...current, domainAnalysisId }
    );
  }, [isEditing, domainAnalysisId]);

  const createMutation = useCreateQMatrixModel();
  const updateMutation = useUpdateQMatrixModel();
  const transitionMutation = useTransitionQMatrixModel();

  const competencyModel = competencyModels.find((m) => m.id === draft.competencyModelId);
  const namedAnalysis = domainAnalyses.find((row) => row.id === draft.domainAnalysisId);
  const availableAttributes = (competencyModel?.smVariables || []).filter(
    (v) => v.type === "binary"
  );

  // Standing work order item 1: a competency model with no binary SMVs has
  // nothing a Q-matrix could bind to (attributeIds are validated server-side
  // as binary-SMV ids -- see schema.js's qMatrixModels block), so offering
  // it in this picker only sets an author up to pick it, see an empty
  // "declares no binary Student Model Variables" notice below, and have to
  // start over. Filtered here rather than left to that dead end.
  const competencyModelOptions = useMemo(() => {
    const eligible = competencyModels.filter(hasBinarySmVariable);
    // The field disables itself once a record exists (see the Combobox's
    // own `disabled` prop below), so this filter can never strand an
    // existing Q-matrix mid-edit -- but the Combobox still needs the bound
    // model IN its options to resolve `value` to a label at all (otherwise
    // it falls back to showing the placeholder instead of the model's
    // name). Keep the current selection visible even if it wouldn't
    // qualify as a fresh pick.
    if (
      draft.competencyModelId &&
      !eligible.some((m) => m.id === draft.competencyModelId) &&
      competencyModel
    ) {
      return [...eligible, competencyModel];
    }
    return eligible;
  }, [competencyModels, draft.competencyModelId, competencyModel]);

  const scopedItems = useMemo(() => {
    if (!draft.competencyModelId) return [];
    const emById = new Map(evidenceModels.map((e) => [e.id, e]));
    const compById = new Map(competencies.map((c) => [c.id, c]));
    return items.filter((item) => {
      const em = emById.get(item.evidenceModelId);
      const comp = em ? compById.get(em.competencyId) : undefined;
      return comp?.modelId === draft.competencyModelId;
    });
  }, [items, evidenceModels, competencies, draft.competencyModelId]);

  const includedItemIds = includedRows
    .filter((row) => row.kind === "item")
    .map((row) => row.itemId);

  const scopedObservables = useMemo(() => {
    if (!draft.competencyModelId) return [];
    const compById = new Map(competencies.map((c) => [c.id, c]));
    const rows = [];
    for (const model of evidenceModels) {
      const competency = compById.get(model.competencyId);
      if (competency?.modelId !== draft.competencyModelId) continue;
      for (const observable of model.observables || []) {
        if (!observable?.id) continue;
        const value = `${model.id}::${observable.id}`;
        rows.push({
          value,
          observableId: observable.id,
          evidenceModelId: model.id,
          evidenceModelName: model.name || model.id,
          statement: observable.statement || observable.id,
          group: model.name || model.id,
          label: observable.statement || observable.id,
        });
      }
    }
    return rows;
  }, [evidenceModels, competencies, draft.competencyModelId]);

  const availableToAdd = scopedItems.filter((it) => !includedItemIds.includes(it.id));
  const availableObservables = scopedObservables.filter((candidate) => {
    const key = `observable:${candidate.evidenceModelId}:${candidate.observableId}:`;
    return !includedRows.some((row) => row.key === key);
  });

  const displayEntries = useMemo(
    () =>
      (draft.entries || []).map((entry) => ({
        itemId: qMatrixRowKey(entry),
        attributeId: entry.attributeId,
      })),
    [draft.entries]
  );

  const validityRows = useMemo(
    () =>
      includedRows.map((row) => {
        if (row.kind === "item") return { id: row.itemId };
        const observable = scopedObservables.find(
          (candidate) =>
            candidate.observableId === row.observableId &&
            candidate.evidenceModelId === row.evidenceModelId
        );
        return {
          id: row.key,
          label: observable?.statement || row.observableId,
          rowKind: "observable",
        };
      }),
    [includedRows, scopedObservables]
  );

  const validity = useMemo(
    () =>
      computeQMatrixValidity({
        attributeIds: draft.attributeIds,
        includedItems: validityRows,
        entries: displayEntries,
      }),
    [draft.attributeIds, validityRows, displayEntries]
  );

  /* `readOnly` is the DISTRICT view (UI spec §2.1 names /district/q-matrices
     as read-only for district; rolePermissions.js has granted district
     canView-but-not-canEdit on qMatrixModels since D48, with the reason
     stated there: a Q-matrix is a system-level measurement decision, not
     local authoring).

     It folds into `locked` rather than becoming a second flag threaded
     through every control. Everything that must not be operable already
     keys off `locked` — every mutating handler's guard, the Combobox and
     Inputs' `disabled`, the grid's own `readOnly`, and WizardStepContainer's
     `canEdit` (which gates Save / Lock & Confirm / Return-to-draft). One
     derivation means a control cannot be added later that honours `locked`
     but forgets `readOnly`. The server is the real boundary regardless —
     qMatrixModelsRoutes.js gates every write with authorizeRole(["admin"]) —
     but a UI that offers a district user a button the server will refuse is
     the "message must say what to do" defect in reverse. */
  const locked = readOnly || draft.locked === true;

  function patchDraft(patch) {
    setDraft((d) => ({ ...d, ...patch }));
    setIsDirty(true);
  }

  function toggleAttribute(attrId) {
    if (locked) return;
    const has = draft.attributeIds.includes(attrId);
    patchDraft({
      attributeIds: has
        ? draft.attributeIds.filter((a) => a !== attrId)
        : [...draft.attributeIds, attrId],
      // Dropping an attribute also drops any entries that pointed at it --
      // otherwise a re-added attribute would resurrect stale cells.
      entries: has ? draft.entries.filter((e) => e.attributeId !== attrId) : draft.entries,
    });
  }

  function addItem(itemId) {
    if (locked || !itemId || includedItemIds.includes(itemId)) return;
    setIncludedRows((rows) => [
      ...rows,
      { kind: "item", itemId, observableId: "", evidenceModelId: "", key: itemId },
    ]);
    setIsDirty(true);
  }

  function addObservable(value) {
    if (locked || !value) return;
    const candidate = scopedObservables.find((row) => row.value === value);
    if (!candidate) return;
    const spec = {
      kind: "observable",
      itemId: "",
      observableId: candidate.observableId,
      evidenceModelId: candidate.evidenceModelId,
    };
    spec.key = qMatrixRowKey(spec);
    if (includedRows.some((row) => row.key === spec.key)) return;
    setIncludedRows((rows) => [...rows, spec]);
    setIsDirty(true);
  }

  function setObservableItem(rowKey, itemId) {
    if (locked) return;
    const current = includedRows.find((row) => row.key === rowKey);
    if (!current || current.kind !== "observable") return;
    const next = { ...current, itemId: itemId || "" };
    next.key = qMatrixRowKey(next);
    if (next.key !== rowKey && includedRows.some((row) => row.key === next.key)) return;
    setIncludedRows((rows) => rows.map((row) => (row.key === rowKey ? next : row)));
    patchDraft({
      entries: draft.entries.map((entry) => {
        if (qMatrixRowKey(entry) !== rowKey) return entry;
        const stored = { ...entry };
        if (itemId) stored.itemId = itemId;
        else delete stored.itemId;
        return stored;
      }),
    });
  }

  function removeItem(rowKey) {
    if (locked) return;
    setIncludedRows((rows) => rows.filter((row) => row.key !== rowKey));
    patchDraft({ entries: draft.entries.filter((entry) => qMatrixRowKey(entry) !== rowKey) });
  }

  function toggleCell(rowKey, attributeId) {
    if (locked) return;
    const row = includedRows.find((candidate) => candidate.key === rowKey);
    if (!row) return;
    const exists = draft.entries.some(
      (entry) => qMatrixRowKey(entry) === rowKey && entry.attributeId === attributeId
    );
    patchDraft({
      entries: exists
        ? draft.entries.filter(
            (entry) => !(qMatrixRowKey(entry) === rowKey && entry.attributeId === attributeId)
          )
        : [...draft.entries, entryForRow(row, attributeId)],
    });
  }

  /* Range select (shift-click / Shift+Space in the grid) sets a whole
     rectangle of cells to one value in a SINGLE update. It is not a loop
     over toggleCell, and must not become one: toggleCell derives its next
     entries[] from the `draft` it closed over, so in a loop every
     iteration after the first would read pre-loop state and all but the
     last cell would be silently dropped. Same stale-closure family as the
     "Save for Review" no-op fixed earlier this block. */
  function setCells(cells, nextChecked) {
    if (locked || !cells?.length) return;

    const inRange = new Set(cells.map((c) => `${c.itemId}::${c.attributeId}`));
    const kept = draft.entries.filter(
      (entry) => !inRange.has(`${qMatrixRowKey(entry)}::${entry.attributeId}`)
    );

    patchDraft({
      entries: nextChecked
        ? [
            ...kept,
            ...cells.map((cell) => {
              const row = includedRows.find((candidate) => candidate.key === cell.itemId);
              return row
                ? entryForRow(row, cell.attributeId)
                : { itemId: cell.itemId, attributeId: cell.attributeId };
            }),
          ]
        : kept,
    });
  }

  const gridRows = includedRows.map((row) => {
    if (row.kind === "item") {
      const item = items.find((it) => it.id === row.itemId);
      return item || { id: row.key };
    }
    const observable = scopedObservables.find(
      (candidate) =>
        candidate.observableId === row.observableId &&
        candidate.evidenceModelId === row.evidenceModelId
    );
    const statement = observable?.statement || row.observableId;
    const matchingItems = scopedItems.filter((item) => item.observationId === row.observableId);
    return {
      id: row.key,
      label: statement,
      caption: observable?.evidenceModelName || row.evidenceModelId || "Observable",
      rowKind: "observable",
      headerExtra: (
        <select
          aria-label={`Item for ${statement}`}
          className="ml-2 max-w-[14rem] rounded border border-slate-200 bg-white px-1 py-0.5 text-2xs text-slate-700"
          value={row.itemId || ""}
          disabled={locked}
          onChange={(event) => setObservableItem(row.key, event.target.value)}
        >
          <option value="">Any item</option>
          {matchingItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name || item.id}
            </option>
          ))}
        </select>
      ),
    };
  });

  // Save (draft -> reviewed) requires reviewed-level completeness, AND zero
  // D52 blocking errors (currently just "empty-row"). This second part
  // isn't optional: an item included with no checked attribute cells
  // produces zero `entries[]` rows, so the server has nothing to persist
  // for it -- `includedItemIds` on reload is derived purely from
  // `entries[].itemId` (see the load effect above). If a draft/reviewed
  // save were allowed to go through with an empty row still on the grid,
  // that item would silently disappear from the matrix (taking its
  // still-unresolved "requires no attributes" error with it) the next
  // time this record is reopened, with no warning it ever happened. Since
  // the data model has no way to represent "item included, zero
  // attributes" at rest, the only honest fix is to block the save itself
  // until the author resolves or removes the row -- matching rule 1's own
  // BLOCKING severity (see QMatrixValidity.js) rather than only enforcing
  // it at confirm time.
  // Lock & Confirm additionally requires at least one entry -- matching
  // the server's own confirmed-level lifecycle check.
  const meetsReviewed = Boolean(
    draft.name &&
      draft.competencyModelId &&
      draft.attributeIds.length > 0 &&
      validity.errors.length === 0
  );
  const meetsConfirmed = meetsReviewed && draft.entries.length > 0;
  const canProceed = draft.status === "reviewed" ? meetsConfirmed : meetsReviewed;

  async function persist() {
    const payload = {
      name: draft.name,
      description: draft.description,
      competencyModelId: draft.competencyModelId,
      competencyModelVersion: competencyModel?.versionNumber,
      attributeIds: draft.attributeIds,
      entries: draft.entries,
      ...(draft.domainAnalysisId ? { domainAnalysisId: draft.domainAnalysisId } : {}),
    };

    try {
      const saved = draft.id
        ? await updateMutation.mutateAsync({ id: draft.id, payload })
        : await createMutation.mutateAsync(payload);
      setDraft(saved);
      draftIdRef.current = saved.id;
      setIsDirty(false);
      return saved;
    } catch (err) {
      toast.error(apiErrorMessage(err, "Save failed."));
      return null;
    }
  }

  async function saveDraft() {
    const saved = await persist();
    return Boolean(saved);
  }

  async function transitionTo(status, successMessage, failureMessage) {
    const id = draftIdRef.current;
    if (!id) return;
    try {
      const saved = await transitionMutation.mutateAsync({ id, status });
      setDraft(saved);
      draftIdRef.current = saved.id;
      setIsDirty(false);
      toast.success(successMessage);
      return saved;
    } catch (err) {
      toast.error(apiErrorMessage(err, failureMessage));
      return null;
    }
  }

  async function saveAndReview() {
    const saved = await transitionTo(
      "reviewed",
      "Q-matrix saved for review.",
      "Could not save for review."
    );
    if (saved) onSaved?.(saved);
  }

  async function confirmMatrix() {
    const saved = await transitionTo(
      "confirmed",
      "Q-matrix confirmed and locked.",
      "Confirmation failed."
    );
    if (saved) onSaved?.(saved);
  }

  async function returnToDraft() {
    await transitionTo("draft", "Q-matrix returned to draft.", "Could not return to draft.");
  }

  if (isEditing && loadingExisting) {
    return <div className="p-8 text-sm text-slate-500">Loading Q-matrix…</div>;
  }

  return (
    <WizardStepContainer
      step={1}
      totalSteps={1}
      isLast
      onCancel={onCancel}
      canProceed={canProceed}
      locked={locked}
      status={draft.status}
      isDirty={isDirty}
      onSaveDraft={saveDraft}
      onSaveAndReview={saveAndReview}
      onConfirm={confirmMatrix}
      onReturnToDraft={returnToDraft}
      modelLabel="Diagnostic design"
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-label font-medium text-slate-600">Name</label>
            <Input
              value={draft.name}
              disabled={locked}
              onChange={(e) => patchDraft({ name: e.target.value })}
              placeholder="e.g. Fractions Diagnostic design"
            />
          </div>
          <div>
            <label className="text-label font-medium text-slate-600">Student Model</label>
            <Combobox
              options={competencyModelOptions.map((m) => ({ value: m.id, label: m.name }))}
              value={draft.competencyModelId}
              onValueChange={(value) => {
                if (locked) return;
                const model = competencyModels.find((m) => m.id === value);
                setIncludedRows([]);
                patchDraft({
                  competencyModelId: value,
                  competencyModelVersion: model?.versionNumber,
                  attributeIds: [],
                  entries: [],
                });
              }}
              placeholder="Select a competency model…"
              disabled={locked || Boolean(draft.id)}
            />
          </div>
        </div>

        <div>
          <label className="text-label font-medium text-slate-600">Description</label>
          <Input
            value={draft.description || ""}
            disabled={locked}
            onChange={(e) => patchDraft({ description: e.target.value })}
          />
        </div>

        {draft.domainAnalysisId ? (
          <p className="text-sm text-slate-600">
            This design names {namedAnalysis?.name || draft.domainAnalysisId}.
          </p>
        ) : null}

        {draft.competencyModelId && (
          <>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">
                Attributes (binary Student Model Variables)
              </h3>
              {availableAttributes.length === 0 ? (
                <p className="mt-1 text-caption text-slate-500">
                  This competency model declares no binary Student Model Variables yet.
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {availableAttributes.map((attr) => (
                    <label
                      key={attr.id}
                      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-caption ${
                        draft.attributeIds.includes(attr.id)
                          ? "border-blue-400 bg-blue-50 text-blue-700"
                          : "border-slate-200 text-slate-600"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={draft.attributeIds.includes(attr.id)}
                        disabled={locked}
                        onChange={() => toggleAttribute(attr.id)}
                      />
                      {attr.label}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {draft.attributeIds.length > 0 && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h3 className="text-sm font-semibold text-slate-800">Rows</h3>
                  {!locked && (
                    <div className="flex flex-wrap gap-2">
                      {availableToAdd.length > 0 && (
                        <Combobox
                          options={availableToAdd.map((it) => ({ value: it.id, label: it.name || it.id }))}
                          value=""
                          onValueChange={addItem}
                          placeholder="+ Add item…"
                          className="w-56"
                        />
                      )}
                      {availableObservables.length > 0 && (
                        <Combobox
                          options={availableObservables}
                          value=""
                          onValueChange={addObservable}
                          placeholder="+ Add observable…"
                          searchPlaceholder="Search observables…"
                          emptyText="No observable found."
                          className="w-72"
                        />
                      )}
                    </div>
                  )}
                </div>

                <QMatrixGrid
                  attributes={draft.attributeIds
                    .map((id) => availableAttributes.find((a) => a.id === id))
                    .filter(Boolean)}
                  items={gridRows}
                  entries={displayEntries}
                  onToggleCell={toggleCell}
                  onSetCells={setCells}
                  onRemoveItem={removeItem}
                  readOnly={locked}
                  rowErrors={validity.errors}
                  columnAdvisories={validity.advisories}
                />
              </div>
            )}

            {(validity.errors.length > 0 || validity.advisories.length > 0) && (
              <div className="space-y-1.5">
                {validity.errors.map((e, i) => (
                  <p key={`err-${i}`} className="text-caption text-red-700">
                    ⚠ {e.message}
                  </p>
                ))}
                {validity.advisories.map((a, i) => (
                  <p key={`adv-${i}`} className="text-caption text-amber-700">
                    ⓘ {a.message}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </WizardStepContainer>
  );
}
