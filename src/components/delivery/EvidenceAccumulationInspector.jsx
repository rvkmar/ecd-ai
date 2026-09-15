import React, { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { apiFetch } from "@/api/apiClient";
import SessionReport from "@/components/sessions/SessionReport";

function posteriorSummary(session) {
  const posts = session?.studentModel?.smvPosteriors || {};
  const entries = Object.values(posts);
  if (!entries.length) return "No SMV posterior yet";
  return entries
    .map((p) => {
      const id = p.smvId || "?";
      const est = p.estimate;
      const prec = p.precision;
      const estText = typeof est === "number" ? est.toFixed(2) : String(est ?? "—");
      const precText = typeof prec === "number" ? ` ±${prec.toFixed(2)}` : "";
      return `${id}: ${estText}${precText}`;
    })
    .join("; ");
}

export default function EvidenceAccumulationInspector() {
  const { auth } = useAuth() || {};
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiFetch("/api/sessions/active", {}, auth).catch(() => []),
      apiFetch("/api/sessions/archived", {}, auth).catch(() => []),
    ])
      .then(([active, archived]) => {
        if (cancelled) return;
        setSessions([...(active || []), ...(archived || [])]);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Failed to load sessions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auth]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Evidence Accumulation</h2>
        <p className="text-sm text-gray-500 mt-1">
          Read-only inspect of Student Model Variables written by the delivery
          loop (PADI TR9 §2.5). This is not an authoring object. Open a session
          to see the persisted posterior and classification on the existing
          report.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading sessions…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto border rounded-md">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2">Session</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Stop</th>
                <th className="px-3 py-2">SMV posteriors</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-gray-500" colSpan={5}>
                    No sessions to inspect.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-3 py-2 font-mono">{s.id}</td>
                    <td className="px-3 py-2">{s.status || "—"}</td>
                    <td className="px-3 py-2">
                      {s.stopped?.reason || (s.stopped ? "stopped" : "—")}
                    </td>
                    <td className="px-3 py-2">{posteriorSummary(s)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="px-2 py-1 rounded bg-gray-800 text-white"
                        onClick={() => setSelectedId(s.id)}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && (
        <SessionReport sessionId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
