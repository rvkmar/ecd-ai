// Read-only view of the persistent student scoring record.
// Admin, district, and teacher look up a student id. A student sees their own.

import React, { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { apiFetch, apiErrorMessage } from "@/api/apiClient";

function formatNumber(value) {
  if (!Number.isFinite(value)) return "";
  return Number(value).toFixed(3);
}

function formatWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function RecordCard({ record }) {
  const posteriors = Object.values(record.smvPosteriors || {});
  const history = Array.isArray(record.history) ? record.history : [];
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">
        {record.competencyModelName || record.competencyModelId}
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Student {record.displayName || record.studentId}
        {record.competencyModelId ? `, ${record.competencyModelId}` : ""}
        {record.parameterSetId ? `, parameter set ${record.parameterSetId}` : ""}
      </p>
      {posteriors.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">No current estimates.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2 pr-3 font-medium">SMV</th>
                <th className="py-2 pr-3 font-medium">Estimate</th>
                <th className="py-2 pr-3 font-medium">SEM</th>
                <th className="py-2 pr-3 font-medium">Parameter set</th>
                <th className="py-2 pr-3 font-medium">Statistical model</th>
                <th className="py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {posteriors.map((posterior) => (
                <tr key={posterior.smvId} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{posterior.smvId}</td>
                  <td className="py-2 pr-3">{formatNumber(posterior.estimate)}</td>
                  <td className="py-2 pr-3">{formatNumber(posterior.sem)}</td>
                  <td className="py-2 pr-3">{posterior.parameterSetId || posterior.parameterSource || ""}</td>
                  <td className="py-2 pr-3">{posterior.statisticalModelId || ""}</td>
                  <td className="py-2">{formatWhen(posterior.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h4 className="mt-4 text-sm font-medium text-slate-800">History</h4>
      {history.length === 0 ? (
        <p className="mt-1 text-sm text-slate-600">No finished sessions on this record.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {[...history].reverse().map((entry) => {
            const snapshot = Object.values(entry.posteriorSnapshot || {});
            const summary = snapshot
              .map((posterior) => `${posterior.smvId} ${formatNumber(posterior.estimate)}`)
              .join(", ");
            return (
              <li key={`${entry.sessionId}-${entry.timestamp}`} className="text-sm text-slate-700">
                <span className="font-medium">{entry.sessionId}</span>
                <span className="text-slate-500">, {formatWhen(entry.timestamp)}</span>
                {summary ? <span>, {summary}</span> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function StudentModelRecordPanel({ self = false }) {
  const { auth } = useAuth() || {};
  const [studentId, setStudentId] = useState("");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  async function load(id) {
    const query = id ? `?studentId=${encodeURIComponent(id)}` : "";
    setLoading(true);
    setError("");
    try {
      const body = await apiFetch(`/api/studentModelRecords${query}`, {}, auth);
      setRecords(Array.isArray(body) ? body : []);
      setLoaded(true);
    } catch (err) {
      setRecords([]);
      setLoaded(true);
      setError(apiErrorMessage(err, "Could not load the student model record"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!self || !auth) return;
    const id = auth.username || auth.id || "";
    setStudentId(id);
    load(id);
    // load closes over auth; re-run when the signed-in user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [self, auth]);

  function onSubmit(event) {
    event.preventDefault();
    load(studentId.trim());
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Student model record</h2>
        <p className="mt-1 text-sm text-slate-600">
          Current estimates for one student and competency model, updated when a session finishes.
        </p>
      </div>

      {self ? null : (
        <form className="flex flex-wrap items-end gap-2" onSubmit={onSubmit}>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Student id</span>
            <input
              className="rounded-md border border-slate-300 px-3 py-2"
              aria-label="Student id"
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              placeholder="stud1 or a students id"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white"
          >
            Show record
          </button>
        </form>
      )}

      {loading && <p className="text-sm text-slate-600">Loading the scoring record…</p>}
      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {loaded && !loading && !error && records.length === 0 && (
        <p className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          No scoring record yet. Finish a session that updates the student model, with carry-forward on if the next session should start from it.
        </p>
      )}
      {records.map((record) => (
        <RecordCard key={record.id} record={record} />
      ))}
    </div>
  );
}
