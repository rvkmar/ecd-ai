// Student session delivery chrome — wizard layout matching Item Wizard
// structure: numbered questions on the left, the current item on the right.
// Lifecycle phases: Draft → Review → Completed → Submit.

import React from "react";

export const WIZARD_PHASE = Object.freeze({
  DRAFT: "draft",
  REVIEW: "review",
  COMPLETED: "completed",
  SUBMITTED: "submitted",
});

export const QUESTION_STATE = Object.freeze({
  YET_TO_ATTEND: "yet_to_attend",
  ATTEND: "attend",
  REVIEW: "review",
  SUBMIT: "submit",
});

const QUESTION_STYLES = {
  [QUESTION_STATE.YET_TO_ATTEND]: {
    ring: "border-slate-300 bg-white text-slate-500",
    label: "Yet to attend",
    dot: "bg-slate-300",
  },
  [QUESTION_STATE.ATTEND]: {
    ring: "border-sky-600 bg-sky-600 text-white",
    label: "Attend",
    dot: "bg-sky-600",
  },
  [QUESTION_STATE.REVIEW]: {
    ring: "border-amber-500 bg-amber-50 text-amber-800",
    label: "Review",
    dot: "bg-amber-500",
  },
  [QUESTION_STATE.SUBMIT]: {
    ring: "border-emerald-600 bg-emerald-600 text-white",
    label: "Submit",
    dot: "bg-emerald-600",
  },
};

const PHASES = [
  { id: WIZARD_PHASE.DRAFT, label: "Draft" },
  { id: WIZARD_PHASE.REVIEW, label: "Review" },
  { id: WIZARD_PHASE.COMPLETED, label: "Completed" },
  { id: WIZARD_PHASE.SUBMITTED, label: "Submit" },
];

export function questionNavState({
  taskId,
  currentTaskId,
  answeredIds,
  phase,
  sessionClosed,
}) {
  if (sessionClosed) return QUESTION_STATE.SUBMIT;
  const answered = answeredIds.has(taskId);
  if (phase === WIZARD_PHASE.SUBMITTED) return QUESTION_STATE.SUBMIT;
  if (taskId === currentTaskId && phase === WIZARD_PHASE.DRAFT && !answered) {
    return QUESTION_STATE.ATTEND;
  }
  if (answered) return QUESTION_STATE.REVIEW;
  if (taskId === currentTaskId) return QUESTION_STATE.ATTEND;
  return QUESTION_STATE.YET_TO_ATTEND;
}

function phaseIndex(phase) {
  const i = PHASES.findIndex((p) => p.id === phase);
  return i < 0 ? 0 : i;
}

export default function StudentSessionWizard({
  sessionId,
  phase,
  taskIds = [],
  currentTaskId,
  answeredIds = new Set(),
  sessionClosed = false,
  onSelectTask,
  onBack,
  onEnterReview,
  onMarkCompleted,
  onSubmitSession,
  onPause,
  showPause = false,
  submittingSession = false,
  canEnterReview = false,
  stopHeading = null,
  children,
}) {
  const activePhase = sessionClosed ? WIZARD_PHASE.SUBMITTED : phase;
  const activeIdx = phaseIndex(activePhase);

  return (
    <div className="flex min-h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
      {/* Left: question index */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Session
          </div>
          <div className="mt-1 truncate font-mono text-sm font-semibold text-slate-900">
            {sessionId}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Answer on the right. Numbers show progress.
          </p>
          {stopHeading && (
            <div
              className="mt-3 text-xs font-medium text-emerald-800"
              data-testid="session-detail-stop"
            >
              {stopHeading}
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Questions">
          <ol className="space-y-1.5">
            {taskIds.map((tid, index) => {
              const state = questionNavState({
                taskId: tid,
                currentTaskId,
                answeredIds,
                phase: activePhase,
                sessionClosed,
              });
              const style = QUESTION_STYLES[state];
              const selected = tid === currentTaskId;
              return (
                <li key={tid}>
                  <button
                    type="button"
                    onClick={() => onSelectTask?.(tid)}
                    disabled={sessionClosed && !answeredIds.has(tid)}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition ${
                      selected ? "bg-slate-100" : "hover:bg-slate-50"
                    } disabled:cursor-default disabled:opacity-60`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${style.ring}`}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        Question {index + 1}
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                        {style.label}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {taskIds.length === 0 && (
            <p className="px-2 text-xs text-slate-500">No questions assigned yet.</p>
          )}
        </nav>

        <div className="border-t border-slate-100 px-4 py-3">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
            {Object.entries(QUESTION_STYLES).map(([key, style]) => (
              <span key={key} className="inline-flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                {style.label}
              </span>
            ))}
          </div>
        </div>
      </aside>

      {/* Right: lifecycle + question */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onBack}
                data-testid="session-player-back"
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Back to sessions
              </button>
              {showPause && (
                <button
                  type="button"
                  onClick={onPause}
                  className="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-600"
                >
                  Pause
                </button>
              )}
            </div>

            <ol className="flex flex-wrap items-center gap-1" aria-label="Session lifecycle">
              {PHASES.map((p, i) => {
                const done = i < activeIdx || activePhase === WIZARD_PHASE.SUBMITTED;
                const current = p.id === activePhase;
                return (
                  <li key={p.id} className="flex items-center gap-1">
                    {i > 0 && <span className="mx-1 h-px w-4 bg-slate-300" aria-hidden />}
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        current
                          ? "bg-slate-900 text-white"
                          : done
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {p.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>

        <footer className="border-t border-slate-200 bg-white px-6 py-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {activePhase === WIZARD_PHASE.DRAFT && (
              <button
                type="button"
                onClick={onEnterReview}
                disabled={!canEnterReview}
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                Enter review
              </button>
            )}
            {activePhase === WIZARD_PHASE.REVIEW && (
              <>
                <button
                  type="button"
                  onClick={() => onSelectTask?.(taskIds[0])}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Keep reviewing
                </button>
                <button
                  type="button"
                  onClick={onMarkCompleted}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Mark completed
                </button>
              </>
            )}
            {activePhase === WIZARD_PHASE.COMPLETED && !sessionClosed && (
              <button
                type="button"
                onClick={onSubmitSession}
                disabled={submittingSession}
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                {submittingSession ? "Submitting…" : "Submit session"}
              </button>
            )}
            {sessionClosed && (
              <span className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                Session submitted and closed
              </span>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
