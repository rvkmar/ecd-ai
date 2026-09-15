// Student Delivery → Reports: closed sessions and per-session performance.
import React, { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { apiFetch, apiErrorMessage } from "@/api/apiClient";
import SessionReport from "./SessionReport";
import { normalizeSessionStatus } from "@/utils/sessionStatus";

function statusLabel(session) {
  const status = normalizeSessionStatus(session.status);
  if (status === "reviewed") return "Reviewed";
  if (status === "submitted" || status === "completed" || session.isCompleted) {
    return "Submitted";
  }
  if (session.autoFinished) return "Auto-finished";
  return status || "Closed";
}

export default function StudentSessionReports() {
  const { auth } = useAuth() || {};
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportSessionId, setReportSessionId] = useState(null);

  useEffect(() => {
    if (!auth) return;
    let cancelled = false;
    setLoading(true);
    apiFetch("/api/sessions/mine?scope=history", {}, auth)
      .then((data) => {
        if (cancelled) return;
        setSessions(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(apiErrorMessage(err, err.message || "Failed to load reports"));
        setSessions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auth]);

  if (loading) {
    return <div className="p-2 text-sm text-slate-600">Loading your reports…</div>;
  }

  if (error) {
    return (
      <div className="p-2 text-sm text-red-700" role="alert">
        {error}
      </div>
    );
  }

  if (!sessions.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
        No submitted sessions yet. After you Submit a session from My Sessions,
        your performance report appears here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">My performance</h2>
        <p className="mt-1 text-sm text-slate-600">
          Open a report for any session you have submitted.
        </p>
      </div>

      <ul className="space-y-3">
        {sessions.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div>
              <div className="font-mono text-sm font-semibold text-slate-900">{s.id}</div>
              <div className="mt-1 text-sm text-slate-600">
                {statusLabel(s)}
                {" · "}
                Responses: <strong>{(s.responses || []).length}</strong>
                {" / "}
                Tasks: <strong>{(s.taskIds || []).length}</strong>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReportSessionId(s.id)}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600"
            >
              Open report
            </button>
          </li>
        ))}
      </ul>

      {reportSessionId && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Session report"
        >
          <div className="my-8 w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-xl">
            <SessionReport
              sessionId={reportSessionId}
              onClose={() => setReportSessionId(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
