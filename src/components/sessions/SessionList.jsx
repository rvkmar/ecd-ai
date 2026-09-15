import React, { useState } from "react";
import Modal from "../ui/Modal";
import { measurementStopHeading } from "./measurementStop";
import {
  canPauseSession,
  canPlaySession,
  canReviewSession,
  canViewCompletedSession,
  canViewSessionReport,
} from "@/utils/sessionPlay";

// Staff session list. Review = live examinee surface. View = completed
// read-only. Report opens the session report panel. Teachers never Finish
// or Submit from this list — that is the student's Submit session action.

export default function SessionList({
  sessions = [],
  students = [],
  policies = [],
  onPlay = () => {},
  onPause = () => {},
  onOperate = () => {},
  onView = () => {},
  onResume = () => {},
  onDelete = () => {},
  onArchive = () => {},
  onViewReport = () => {},
}) {
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null });
  const [expanded, setExpanded] = useState(null);

  const getStudentName = (id) => {
    const s = (students || []).find((st) => st.id === id || st.username === id);
    return s ? (s.name || s.username || s.id) : id || "(unassigned)";
  };

  const getAssigneeLabel = (session) => {
    const ids = [session.studentId, ...(session.studentIds || [])].filter(Boolean);
    const unique = [...new Set(ids.map(String))];
    if (unique.length === 0) return "(unassigned)";
    return unique.map(getStudentName).join(", ");
  };

  const getPolicyName = (policyId) => {
    if (!policyId) return null;
    const p = (policies || []).find((pol) => pol.id === policyId);
    return p ? p.name : policyId;
  };

  const openDelete = (id) => setDeleteModal({ open: true, id });
  const closeDelete = () => setDeleteModal({ open: false, id: null });

  const confirmDelete = async () => {
    if (deleteModal.id) {
      await onDelete(deleteModal.id);
    }
    closeDelete();
  };

  const renderTaskPreview = (session) => {
    const tasks = session.tasks || [];
    const ids = session.taskIds || [];
    if (!ids.length) return <p className="text-xs text-gray-400">No tasks</p>;

    const preview = ids.slice(0, 3).map((tid) => {
      const t = tasks.find((x) => x.id === tid) || { id: tid };
      const q = t.questionId ? `Q: ${t.questionId}` : "No Q";
      const c = t.taskModel?.competencyId || "?";
      const e = t.taskModel?.evidenceId || "?";
      return (
        <li key={tid} className="truncate">
          {q} <span className="text-gray-500">[C: {c}, E: {e}]</span>
        </li>
      );
    });

    return (
      <div className="mt-1 text-xs text-gray-600">
        <ul className="list-disc ml-5 space-y-0.5">{preview}</ul>
        {ids.length > 3 && (
          <button
            type="button"
            onClick={() =>
              setExpanded(expanded === session.id ? null : session.id)
            }
            className="mt-1 text-xs text-blue-600 hover:underline"
          >
            {expanded === session.id ? "Show less" : `+${ids.length - 3} more`}
          </button>
        )}
      </div>
    );
  };

  if (!sessions || sessions.length === 0) {
    return <p className="text-gray-500">No sessions created yet.</p>;
  }

  return (
    <div className="space-y-4">
      {sessions.map((s) => (
        <div
          key={s.id}
          className="flex items-start justify-between rounded-md border bg-white p-4 shadow-sm"
        >
          <div className="w-3/4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-lg font-semibold">{s.id}</h3>
              <span className="flex items-center gap-1">
                {s.stopped?.rule && (
                  <span
                    className="rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-900"
                    data-testid={`session-stop-badge-${s.id}`}
                  >
                    {measurementStopHeading(s.stopped)}
                  </span>
                )}
                <span
                  className={`rounded px-2 py-1 text-xs ${
                    s.status === "reviewed"
                      ? "bg-green-200 text-green-900"
                      : s.autoFinished
                        ? "bg-yellow-100 text-yellow-800"
                        : s.status === "submitted" || s.isCompleted || s.status === "completed"
                          ? "bg-blue-100 text-blue-800"
                          : s.status === "paused"
                            ? "bg-orange-100 text-orange-800"
                            : s.status === "ready"
                              ? "bg-slate-100 text-slate-800"
                              : s.status === "archived"
                                ? "bg-gray-300 text-gray-700"
                                : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {s.status === "reviewed"
                    ? "Reviewed"
                    : s.autoFinished
                      ? "Auto-finished"
                      : s.status === "submitted" || s.isCompleted || s.status === "completed"
                        ? "Submitted"
                        : s.status === "paused"
                          ? "Paused"
                          : s.status === "ready"
                            ? "Ready"
                            : s.status === "archived"
                              ? "Archived"
                              : "In Progress"}
                </span>
              </span>
            </div>

            <div className="mt-1 text-sm text-gray-600">
              <div>
                Student: <strong>{getAssigneeLabel(s)}</strong>
                {s.cohortId && (
                  <span className="ml-2 text-xs text-gray-500">(Cohort: {s.cohortId})</span>
                )}
              </div>
              <div>
                Strategy: <strong>{s.selectionStrategy || "fixed"}</strong>
                {s.nextTaskPolicy?.policyId && (
                  <span className="ml-2 text-xs text-gray-600">
                    (Policy: {getPolicyName(s.nextTaskPolicy.policyId)})
                  </span>
                )}
              </div>
              <div>
                Tasks: <strong>{(s.taskIds || []).length}</strong> &nbsp;|&nbsp;
                Responses: <strong>{(s.responses || []).length}</strong>
              </div>
              {renderTaskPreview(s)}
            </div>

            <div className="mt-2 text-xs text-gray-400">
              {s.startedAt && (
                <div>Started: {new Date(s.startedAt).toLocaleString()}</div>
              )}
              {s.updatedAt && (
                <div>Last updated: {new Date(s.updatedAt).toLocaleString()}</div>
              )}
            </div>
          </div>

          <div className="flex w-1/4 flex-col items-end space-y-2">
            {canPlaySession(s) && (
              <button
                type="button"
                onClick={() => onPlay(s)}
                className="rounded bg-blue-500 px-3 py-1 text-white hover:bg-blue-600"
              >
                Play
              </button>
            )}
            {canPauseSession(s) && (
              <button
                type="button"
                onClick={() => onPause(s.id)}
                className="rounded bg-orange-500 px-3 py-1 text-white hover:bg-orange-600"
              >
                Pause
              </button>
            )}
            {canReviewSession(s) && (
              <button
                type="button"
                onClick={() => onOperate(s)}
                className="rounded bg-indigo-500 px-3 py-1 text-white hover:bg-indigo-600"
              >
                Review
              </button>
            )}
            {canViewCompletedSession(s) && (
              <button
                type="button"
                onClick={() => onView(s)}
                className="rounded bg-slate-700 px-3 py-1 text-white hover:bg-slate-800"
              >
                View
              </button>
            )}
            {canViewSessionReport(s) && (
              <button
                type="button"
                onClick={() => onViewReport(s.id)}
                className="rounded bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-700"
              >
                Report
              </button>
            )}
            {s.status !== "archived" && (
              <button
                type="button"
                onClick={() => onArchive(s.id)}
                className="rounded bg-gray-600 px-3 py-1 text-white hover:bg-gray-700"
              >
                Archive
              </button>
            )}
          </div>
        </div>
      ))}

      <Modal
        isOpen={deleteModal.open}
        onClose={closeDelete}
        onConfirm={confirmDelete}
        title="Delete session"
        message={`Are you sure you want to delete session ${deleteModal.id}? This action cannot be undone.`}
        confirmClass="bg-red-500 hover:bg-red-600 text-white"
      />
    </div>
  );
}
