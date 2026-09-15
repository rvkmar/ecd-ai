// Student My Sessions — Start opens the wizard player; closed sessions
// show no Start button.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { apiFetch, apiErrorMessage } from "@/api/apiClient";
import {
  sessionPlayerPath,
  canStartSession,
  isSessionClosedForStudent,
  isAttendableStatus,
} from "@/utils/sessionPlay";
import { SESSION_STATUS, normalizeSessionStatus } from "@/utils/sessionStatus";
import toast from "react-hot-toast";

function statusLabel(session) {
  if (isSessionClosedForStudent(session)) {
    const status = normalizeSessionStatus(session.status);
    if (status === "submitted" || status === "completed") return "Submitted";
    if (status === "reviewed") return "Reviewed";
    return "Closed";
  }
  const status = normalizeSessionStatus(session.status);
  if (status === SESSION_STATUS.READY) return "Ready to start";
  if (status === SESSION_STATUS.PAUSED) return "Paused";
  if (status === SESSION_STATUS.IN_PROGRESS || status === SESSION_STATUS.REOPENED) {
    return "In progress";
  }
  return session.status || "unknown";
}

export default function StudentSessionList() {
  const { auth } = useAuth() || {};
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startingId, setStartingId] = useState(null);

  useEffect(() => {
    if (!auth) return;
    let cancelled = false;
    setLoading(true);
    apiFetch("/api/sessions/mine", {}, auth)
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) {
          setSessions(data);
          setError(null);
          return;
        }
        setSessions([]);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        const msg = apiErrorMessage(err, err.message || "Failed to load sessions");
        if (err.status === 404 || /session not found/i.test(String(msg))) {
          setSessions([]);
          setError(null);
          return;
        }
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auth]);

  const startSession = async (session) => {
    const path = sessionPlayerPath(auth?.role || "student", session.id);
    if (!path) return;

    setStartingId(session.id);
    try {
      const status = normalizeSessionStatus(session.status);
      if (
        status === SESSION_STATUS.READY ||
        status === SESSION_STATUS.PAUSED ||
        status === SESSION_STATUS.REOPENED
      ) {
        await apiFetch(`/api/sessions/${session.id}/play`, { method: "POST" }, auth);
      }
      navigate(path);
    } catch (err) {
      toast.error(apiErrorMessage(err, err.message || "Could not start session"));
    } finally {
      setStartingId(null);
    }
  };

  if (loading) {
    return <div className="p-2 text-sm text-slate-600">Loading your sessions…</div>;
  }

  if (error) {
    return (
      <div className="p-2 text-sm text-red-700" role="alert">
        Could not load sessions: {error}
      </div>
    );
  }

  if (!sessions.length) {
    return (
      <div className="p-2 text-sm text-slate-700">
        No upcoming or in-progress sessions are available for you yet
        {auth?.username ? ` (${auth.username})` : ""}. Ask your teacher to
        assign a session to your account.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sessions.map((s) => {
        const closed = isSessionClosedForStudent(s);
        const startable = canStartSession(s);
        const label = statusLabel(s);
        return (
          <div
            key={s.id}
            className="flex items-start justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{s.id}</h3>
              <div className="mt-1 text-sm text-slate-600">
                Status: <strong>{label}</strong>
                {!closed && isAttendableStatus(s.status) ? " — you can attend" : ""}
              </div>
              <div className="text-sm text-slate-600">
                Tasks: <strong>{(s.taskIds || []).length}</strong>
                {" "}|&nbsp; Responses: <strong>{(s.responses || []).length}</strong>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {closed && (
                <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  Submitted — closed
                </span>
              )}
              {startable && (
                <button
                  type="button"
                  onClick={() => startSession(s)}
                  disabled={startingId === s.id}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {startingId === s.id
                    ? "Starting…"
                    : normalizeSessionStatus(s.status) === SESSION_STATUS.READY
                      ? "Start"
                      : "Continue"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
