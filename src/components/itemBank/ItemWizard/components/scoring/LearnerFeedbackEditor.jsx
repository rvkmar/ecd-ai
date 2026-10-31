// Optional learner feedback on the scoring step.
// byOption is one note per option id. byScore is a score or an inclusive
// range. general is the fallback. Blank fields are not stored.

import React, { useState } from "react";
import { itemFeedbackErrors } from "@/utils/itemFeedback";

function optionRows(item) {
  const components = item?.interaction?.responseComponents;
  if (!Array.isArray(components)) return [];
  return components.filter((row) => row && typeof row.id === "string" && row.id.trim());
}

function scoreRowsFrom(byScore) {
  if (!byScore || typeof byScore !== "object" || Array.isArray(byScore)) return [];
  return Object.entries(byScore).map(([key, text]) => ({
    key,
    text: typeof text === "string" ? text : "",
  }));
}

function feedbackObject(item) {
  const feedback = item?.feedback;
  if (!feedback || typeof feedback !== "object" || Array.isArray(feedback)) return {};
  return feedback;
}

export default function LearnerFeedbackEditor({ item, canEdit, onChange }) {
  const feedback = feedbackObject(item);
  const options = optionRows(item);
  const [scoreRows, setScoreRows] = useState(() => scoreRowsFrom(feedback.byScore));
  const errors = itemFeedbackErrors(item || {});

  function emit(next) {
    const stored = {};
    if (next.byOption && typeof next.byOption === "object" && !Array.isArray(next.byOption)) {
      const byOption = {};
      for (const [key, value] of Object.entries(next.byOption)) {
        if (typeof value === "string" && value.trim()) byOption[key] = value;
        else if (value != null && typeof value !== "string") byOption[key] = value;
      }
      if (Object.keys(byOption).length) stored.byOption = byOption;
    }
    if (next.byScore && typeof next.byScore === "object" && !Array.isArray(next.byScore)) {
      const byScore = {};
      for (const [key, value] of Object.entries(next.byScore)) {
        const id = String(key).trim();
        if (!id) continue;
        if (typeof value === "string" && value.trim()) byScore[id] = value;
        else if (value != null && typeof value !== "string") byScore[id] = value;
      }
      if (Object.keys(byScore).length) stored.byScore = byScore;
    }
    if (typeof next.general === "string") {
      if (next.general.trim()) stored.general = next.general;
    } else if (next.general != null && next.general !== "") {
      stored.general = next.general;
    }
    onChange(Object.keys(stored).length ? stored : null);
  }

  function emitScores(rows) {
    const byScore = {};
    for (const row of rows) {
      const key = String(row.key || "").trim();
      const text = typeof row.text === "string" ? row.text : "";
      if (key && text.trim()) byScore[key] = text;
    }
    emit({ ...feedback, byScore });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm" data-testid="learner-feedback-editor">
      <h3 className="text-sm font-semibold text-slate-900">Learner feedback</h3>
      <p className="mt-1 text-sm text-slate-500">
        Optional text the examinee sees after a response, when feedback timing
        allows it. An option note wins over a score or a range, and either of
        those wins over the general note. Leave this blank to keep the messages
        the player already shows.
      </p>

      {options.length > 0 && (
        <div className="mt-5 space-y-3">
          <div className="text-sm font-medium text-slate-800">By option</div>
          {options.map((option) => {
            const id = option.id.trim();
            const label = String(option.label || option.value || id);
            return (
              <label key={id} className="block text-sm text-slate-700">
                <span className="mb-1 block">
                  {label}{" "}
                  <span className="font-mono text-xs text-slate-500">{id}</span>
                </span>
                <textarea
                  rows={2}
                  disabled={!canEdit}
                  value={feedback.byOption?.[id] || ""}
                  data-testid={`feedback-option-${id}`}
                  onChange={(event) => {
                    if (!canEdit) return;
                    emit({
                      ...feedback,
                      byOption: { ...(feedback.byOption || {}), [id]: event.target.value },
                    });
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50 disabled:text-slate-400"
                />
              </label>
            );
          })}
        </div>
      )}

      <div className="mt-5 space-y-3">
        <div className="text-sm font-medium text-slate-800">By score</div>
        <p className="text-xs text-slate-500">
          Use a score such as 1, or an inclusive range such as 0..1 or 0-1.
          An exact score wins over a range that also contains it.
        </p>
        {scoreRows.map((row, index) => (
          <div key={`score-${index}`} className="flex flex-wrap items-start gap-2">
            <input
              type="text"
              disabled={!canEdit}
              aria-label={`Score rule ${index + 1}`}
              value={row.key}
              data-testid={`feedback-score-key-${index}`}
              onChange={(event) => {
                if (!canEdit) return;
                const next = scoreRows.map((entry, i) =>
                  i === index ? { ...entry, key: event.target.value } : entry
                );
                setScoreRows(next);
                emitScores(next);
              }}
              placeholder="1 or 0..1"
              className="w-28 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50 disabled:text-slate-400"
            />
            <textarea
              rows={2}
              disabled={!canEdit}
              aria-label={`Score feedback ${index + 1}`}
              value={row.text}
              data-testid={`feedback-score-text-${index}`}
              onChange={(event) => {
                if (!canEdit) return;
                const next = scoreRows.map((entry, i) =>
                  i === index ? { ...entry, text: event.target.value } : entry
                );
                setScoreRows(next);
                emitScores(next);
              }}
              className="min-w-[12rem] flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50 disabled:text-slate-400"
            />
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  const next = scoreRows.filter((_, i) => i !== index);
                  setScoreRows(next);
                  emitScores(next);
                }}
                className="rounded-md px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <button
            type="button"
            onClick={() => setScoreRows((rows) => [...rows, { key: "", text: "" }])}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Add score rule
          </button>
        )}
      </div>

      <label className="mt-5 block text-sm text-slate-700">
        <span className="mb-1 block font-medium text-slate-800">General</span>
        <textarea
          rows={2}
          disabled={!canEdit}
          value={typeof feedback.general === "string" ? feedback.general : ""}
          data-testid="feedback-general"
          onChange={(event) => {
            if (!canEdit) return;
            emit({ ...feedback, general: event.target.value });
          }}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50 disabled:text-slate-400"
        />
        <span className="mt-1 block text-xs text-slate-500">
          Used when no option and no score rule matches.
        </span>
      </label>

      {errors.length > 0 && (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-amber-800" role="alert">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
