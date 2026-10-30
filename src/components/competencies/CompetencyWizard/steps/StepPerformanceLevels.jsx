// Competency Wizard step 9. Optional performance-level descriptors.
// An empty step leaves the competency unchanged in behaviour.
// Angoff and bookmark run in the browser and write one cut.

import React, { memo, useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useCompetencyWizard } from "../CompetencyWizardContext";
import {
  PERFORMANCE_LEVEL_SCALES,
  angoffCut,
  bookmarkCut,
  performanceLevelErrors,
} from "@/utils/performanceLevels";

const INPUT =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

const QUIET_BUTTON =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

let keySeq = 0;
function newKey() {
  keySeq += 1;
  return `pl-${keySeq}`;
}

function blankRow() {
  return { key: newKey(), label: "", descriptor: "", cut: "" };
}

function initialDraft(comp) {
  const levels = Array.isArray(comp?.performanceLevels) ? comp.performanceLevels : [];
  return {
    scale: comp?.performanceLevelScale || "",
    rows: levels.map((level) => ({
      key: newKey(),
      label: level?.label || "",
      descriptor: level?.descriptor || "",
      cut: typeof level?.cut === "number" ? String(level.cut) : "",
    })),
    method: comp?.performanceLevelScale === "theta" ? "bookmark" : "angoff",
    angoffItems: [{ key: newKey(), ratings: "" }],
    bookmarkItems: [
      { key: newKey(), difficulty: "" },
      { key: newKey(), difficulty: "" },
    ],
    bookmarkIndex: 0,
    applyIndex: 0,
  };
}

function parseRatingList(text) {
  const parts = String(text || "")
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return [];
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return nums;
}

function levelsFromDraft(draft) {
  return draft.rows.map((row) => ({
    label: row.label.trim(),
    descriptor: row.descriptor,
    cut: row.cut.trim() === "" ? Number.NaN : Number(row.cut),
  }));
}

function storedFromDraft(draft) {
  if (!draft) return null;
  if (draft.rows.length === 0) {
    if (draft.scale && !PERFORMANCE_LEVEL_SCALES.includes(draft.scale)) return null;
    return {
      performanceLevels: [],
      performanceLevelScale: draft.scale || null,
    };
  }
  const candidate = {
    performanceLevelScale: draft.scale || undefined,
    performanceLevels: levelsFromDraft(draft),
  };
  if (performanceLevelErrors(candidate).length > 0) return null;
  return {
    performanceLevels: candidate.performanceLevels,
    performanceLevelScale: draft.scale,
  };
}

function draftIsReady(draft) {
  if (!draft) return true;
  return storedFromDraft(draft) != null;
}

function sameStored(comp, stored) {
  const currentLevels = Array.isArray(comp?.performanceLevels) ? comp.performanceLevels : [];
  const nextLevels = stored.performanceLevels || [];
  const currentScale = comp?.performanceLevelScale || null;
  const nextScale = stored.performanceLevelScale || null;
  return currentScale === nextScale && JSON.stringify(currentLevels) === JSON.stringify(nextLevels);
}

const SCALE_LABELS = {
  theta: "Theta",
  probability: "Probability",
};

function methodScale(method) {
  return method === "bookmark" ? "theta" : "probability";
}

function computedCut(draft) {
  if (!draft) return null;
  if (draft.method === "bookmark") {
    const items = draft.bookmarkItems.map((item) => {
      const text = item.difficulty.trim();
      if (text === "") return null;
      const value = Number(text);
      return Number.isFinite(value) ? value : null;
    });
    if (items.some((value) => value == null)) return null;
    return bookmarkCut(items, draft.bookmarkIndex);
  }
  const rows = draft.angoffItems.map((item) => parseRatingList(item.ratings));
  if (rows.some((row) => row == null || row.length === 0)) return null;
  return angoffCut(rows);
}

function roundCut(value) {
  return Math.round(value * 1e6) / 1e6;
}

function formatCut(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return String(roundCut(value));
}

const LevelCard = memo(function LevelCard({
  comp,
  draft,
  isLocked,
  startOpen,
  onDraft,
}) {
  const [open, setOpen] = useState(startOpen);
  const errors = performanceLevelErrors(
    draft.rows.length === 0
      ? { performanceLevelScale: draft.scale || undefined, performanceLevels: [] }
      : {
          performanceLevelScale: draft.scale || undefined,
          performanceLevels: levelsFromDraft(draft),
        }
  );
  const showErrors = draft.rows.some(
    (row) => row.label.trim() || row.descriptor.trim() || row.cut.trim()
  );
  const cut = computedCut(draft);
  const wantedScale = methodScale(draft.method);
  const scaleBlocks = Boolean(draft.scale) && draft.scale !== wantedScale;
  const canApply = cut != null && draft.rows.length > 0 && !scaleBlocks && !isLocked;

  function applyCut() {
    if (!canApply) return;
    const nextCut = String(roundCut(cut));
    const rows = draft.rows.map((row, index) =>
      index === Number(draft.applyIndex) ? { ...row, cut: nextCut } : row
    );
    onDraft({
      ...draft,
      scale: draft.scale || wantedScale,
      rows,
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <div>
          <div className="text-sm font-semibold text-slate-800">
            {comp.name || "Unnamed Competency"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {draft.rows.length === 0
              ? "No performance levels"
              : `${draft.rows.length} level${draft.rows.length === 1 ? "" : "s"}`}
            {draft.scale ? ` on ${draft.scale}` : ""}
          </div>
        </div>
        {open ? (
          <ChevronUp size={16} strokeWidth={2} className="text-slate-400" />
        ) : (
          <ChevronDown size={16} strokeWidth={2} className="text-slate-400" />
        )}
      </button>

      {open && (
        <div className="space-y-6 border-t border-slate-100 bg-slate-50/60 px-6 py-6">
          <fieldset className="space-y-2" disabled={isLocked}>
            <legend className="text-sm font-medium text-slate-800">Cut scale</legend>
            <p className="text-sm text-slate-500">
              Theta is an IRT ability estimate. Probability is a proportion or a posterior.
            </p>
            <div className="flex flex-wrap gap-4">
              {PERFORMANCE_LEVEL_SCALES.map((scale) => (
                <label key={scale} className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="radio"
                    name={`scale-${comp.id}`}
                    value={scale}
                    checked={draft.scale === scale}
                    onChange={() => onDraft({ ...draft, scale })}
                  />
                  {SCALE_LABELS[scale]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-800">Levels</h3>
              <button
                type="button"
                className={QUIET_BUTTON}
                disabled={isLocked}
                onClick={() =>
                  onDraft({
                    ...draft,
                    rows: [...draft.rows, blankRow()],
                    applyIndex: draft.rows.length,
                  })
                }
              >
                Add level
              </button>
            </div>
            <p className="text-sm text-slate-500">
              List levels from the lowest cut to the highest. A cut is the lowest score that reaches that level.
            </p>
            {draft.rows.length === 0 && (
              <p className="text-sm text-slate-500">No levels yet. This competency keeps today's behaviour.</p>
            )}
            {draft.rows.map((row, index) => (
              <div
                key={row.key}
                className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 md:grid-cols-2"
              >
                <label className="block text-xs font-medium text-slate-600" htmlFor={`${row.key}-label`}>
                  Level label
                  <input
                    id={`${row.key}-label`}
                    className={`${INPUT} mt-1`}
                    value={row.label}
                    disabled={isLocked}
                    onChange={(event) => {
                      const rows = draft.rows.slice();
                      rows[index] = { ...row, label: event.target.value };
                      onDraft({ ...draft, rows });
                    }}
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600" htmlFor={`${row.key}-cut`}>
                  Cut
                  <input
                    id={`${row.key}-cut`}
                    className={`${INPUT} mt-1`}
                    inputMode="decimal"
                    value={row.cut}
                    disabled={isLocked}
                    onChange={(event) => {
                      const rows = draft.rows.slice();
                      rows[index] = { ...row, cut: event.target.value };
                      onDraft({ ...draft, rows });
                    }}
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600 md:col-span-2" htmlFor={`${row.key}-descriptor`}>
                  Descriptor
                  <textarea
                    id={`${row.key}-descriptor`}
                    className={`${INPUT} mt-1 min-h-16`}
                    value={row.descriptor}
                    disabled={isLocked}
                    placeholder="What a student at this level can do"
                    onChange={(event) => {
                      const rows = draft.rows.slice();
                      rows[index] = { ...row, descriptor: event.target.value };
                      onDraft({ ...draft, rows });
                    }}
                  />
                </label>
                <div className="md:col-span-2">
                  <button
                    type="button"
                    className={QUIET_BUTTON}
                    disabled={isLocked}
                    onClick={() => {
                      const rows = draft.rows.filter((item) => item.key !== row.key);
                      const applyIndex = Math.min(draft.applyIndex, Math.max(rows.length - 1, 0));
                      onDraft({ ...draft, rows, applyIndex });
                    }}
                  >
                    Remove level
                  </button>
                </div>
              </div>
            ))}
            {!draftIsReady(draft) && (
              <p className="text-sm text-amber-800">
                Finish each level, or remove it, before continuing.
              </p>
            )}
            {showErrors && errors.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-red-700" role="alert">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800">Standard-setting worksheet</h3>
            <p className="text-sm text-slate-500">
              The worksheet is not saved. Applying a cut writes that number onto the level you choose.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                ["angoff", "Angoff"],
                ["bookmark", "Bookmark"],
              ].map(([method, label]) => (
                <button
                  key={method}
                  type="button"
                  aria-pressed={draft.method === method}
                  disabled={isLocked}
                  className={
                    draft.method === method
                      ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                      : QUIET_BUTTON
                  }
                  onClick={() => onDraft({ ...draft, method })}
                >
                  {label}
                </button>
              ))}
            </div>

            {draft.method === "angoff" ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  For each item, enter the panelists' probabilities that a borderline examinee answers it correctly, separated by commas. The cut is the mean of the per-item means.
                </p>
                {draft.angoffItems.map((item, index) => (
                  <label
                    key={item.key}
                    className="block text-xs font-medium text-slate-600"
                    htmlFor={`${item.key}-ratings`}
                  >
                    {`Item ${index + 1} panelist ratings`}
                    <input
                      id={`${item.key}-ratings`}
                      className={`${INPUT} mt-1`}
                      value={item.ratings}
                      disabled={isLocked}
                      placeholder="0.5, 1"
                      onChange={(event) => {
                        const angoffItems = draft.angoffItems.slice();
                        angoffItems[index] = { ...item, ratings: event.target.value };
                        onDraft({ ...draft, angoffItems });
                      }}
                    />
                  </label>
                ))}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={QUIET_BUTTON}
                    disabled={isLocked || draft.angoffItems.length <= 1}
                    onClick={() => {
                      const angoffItems = draft.angoffItems.slice(0, -1);
                      onDraft({ ...draft, angoffItems });
                    }}
                  >
                    Remove last item
                  </button>
                  <button
                    type="button"
                    className={QUIET_BUTTON}
                    disabled={isLocked}
                    onClick={() =>
                      onDraft({
                        ...draft,
                        angoffItems: [...draft.angoffItems, { key: newKey(), ratings: "" }],
                      })
                    }
                  >
                    Add item
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Order items by increasing difficulty. Place the bookmark on the first item a borderline examinee is not expected to answer correctly. The cut is that item's difficulty.
                </p>
                {draft.bookmarkItems.map((item, index) => (
                  <div key={item.key} className="flex flex-wrap items-end gap-2">
                    <label
                      className="block min-w-40 flex-1 text-xs font-medium text-slate-600"
                      htmlFor={`${item.key}-difficulty`}
                    >
                      {`Item ${index + 1} difficulty`}
                      <input
                        id={`${item.key}-difficulty`}
                        className={`${INPUT} mt-1`}
                        inputMode="decimal"
                        value={item.difficulty}
                        disabled={isLocked}
                        onChange={(event) => {
                          const bookmarkItems = draft.bookmarkItems.slice();
                          bookmarkItems[index] = { ...item, difficulty: event.target.value };
                          onDraft({ ...draft, bookmarkItems });
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className={QUIET_BUTTON}
                      disabled={isLocked || index === 0}
                      onClick={() => {
                        const bookmarkItems = draft.bookmarkItems.slice();
                        const previous = bookmarkItems[index - 1];
                        bookmarkItems[index - 1] = item;
                        bookmarkItems[index] = previous;
                        onDraft({ ...draft, bookmarkItems });
                      }}
                    >
                      {`Move item ${index + 1} up`}
                    </button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={QUIET_BUTTON}
                    disabled={isLocked || draft.bookmarkItems.length <= 1}
                    onClick={() => {
                      const bookmarkItems = draft.bookmarkItems.slice(0, -1);
                      const bookmarkIndex = Math.min(
                        draft.bookmarkIndex,
                        Math.max(bookmarkItems.length - 1, 0)
                      );
                      onDraft({ ...draft, bookmarkItems, bookmarkIndex });
                    }}
                  >
                    Remove last item
                  </button>
                  <button
                    type="button"
                    className={QUIET_BUTTON}
                    disabled={isLocked}
                    onClick={() =>
                      onDraft({
                        ...draft,
                        bookmarkItems: [
                          ...draft.bookmarkItems,
                          { key: newKey(), difficulty: "" },
                        ],
                      })
                    }
                  >
                    Add item
                  </button>
                </div>
                <label className="block text-xs font-medium text-slate-600" htmlFor={`${comp.id}-bookmark`}>
                  Bookmark position
                  <select
                    id={`${comp.id}-bookmark`}
                    className={`${INPUT} mt-1`}
                    value={draft.bookmarkIndex}
                    disabled={isLocked}
                    onChange={(event) =>
                      onDraft({ ...draft, bookmarkIndex: Number(event.target.value) })
                    }
                  >
                    {draft.bookmarkItems.map((item, index) => (
                      <option key={item.key} value={index}>
                        {`Item ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <p className="text-sm text-slate-800">
              Computed cut: {formatCut(cut) ?? "not enough input yet"}
            </p>
            {scaleBlocks && (
              <p className="text-sm text-amber-800">
                {`This worksheet writes a ${wantedScale} cut. The competency scale is ${draft.scale}.`}
              </p>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-xs font-medium text-slate-600" htmlFor={`${comp.id}-apply`}>
                Apply cut to
                <select
                  id={`${comp.id}-apply`}
                  className={`${INPUT} mt-1`}
                  value={draft.applyIndex}
                  disabled={isLocked || draft.rows.length === 0}
                  onChange={(event) =>
                    onDraft({ ...draft, applyIndex: Number(event.target.value) })
                  }
                >
                  {draft.rows.length === 0 ? (
                    <option value={0}>No level yet</option>
                  ) : (
                    draft.rows.map((row, index) => (
                      <option key={row.key} value={index}>
                        {row.label.trim() || `Level ${index + 1}`}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <button
                type="button"
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canApply}
                onClick={applyCut}
              >
                Apply cut
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default function StepPerformanceLevels() {
  const {
    model,
    competencies,
    updateCompetency,
    setPerformanceLevelsDraftReady,
  } = useCompetencyWizard();
  const isLocked = Boolean(model?.locked);

  const ordered = [...competencies].sort((a, b) => {
    const aOrder = typeof a.orderIndex === "number" ? a.orderIndex : 0;
    const bOrder = typeof b.orderIndex === "number" ? b.orderIndex : 0;
    return aOrder - bOrder;
  });

  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(ordered.map((comp) => [comp.id, initialDraft(comp)]))
  );

  const ready = ordered.every((comp) => draftIsReady(drafts[comp.id]));

  useEffect(() => {
    setPerformanceLevelsDraftReady?.(ready);
    return () => setPerformanceLevelsDraftReady?.(true);
  }, [ready, setPerformanceLevelsDraftReady]);

  function onDraft(compId, nextDraft) {
    setDrafts((prev) => ({ ...prev, [compId]: nextDraft }));
    if (isLocked) return;
    const stored = storedFromDraft(nextDraft);
    if (!stored) return;
    const comp = competencies.find((item) => item.id === compId);
    if (sameStored(comp, stored)) return;
    updateCompetency(compId, stored);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Step 9: Performance Levels</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Optional. Add performance-level descriptors and cuts for a competency, or leave them empty. Empty means no standard is set.
        </p>
      </div>

      {ordered.length === 0 ? (
        <p className="text-sm text-slate-600">
          Add a competency on Latent Variables before setting performance levels.
        </p>
      ) : (
        <div className="space-y-4">
          {ordered.map((comp, index) =>
            drafts[comp.id] ? (
              <LevelCard
                key={comp.id}
                comp={comp}
                draft={drafts[comp.id]}
                isLocked={isLocked}
                startOpen={index === 0}
                onDraft={(nextDraft) => onDraft(comp.id, nextDraft)}
              />
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
