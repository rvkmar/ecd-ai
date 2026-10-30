// Report HTML and person scores are not stored on the evidence model.
// When the parameter set cites a calibration job or an analysis artefact,
// load them from that record. With no citation, say so and do not render
// any inline copy that an older row might still carry.

import React, { useState } from "react";
import { apiFetch } from "@/api/apiClient";
import { useAuth } from "@/auth/AuthProvider";

export const REPORT_NOT_STORED = "report not stored on this model";

function rowsFromPersonScores(personScores) {
  const ids = personScores?.personIds;
  if (!Array.isArray(ids) || ids.length === 0) return [];
  return ids.map((personId, i) => ({
    personId,
    theta: Array.isArray(personScores.theta) ? personScores.theta[i] : undefined,
    se: Array.isArray(personScores.se) ? personScores.se[i] : undefined,
  }));
}

export default function ParameterSetReport({ parameterSet }) {
  const { auth } = useAuth() || {};
  const artefactId = parameterSet?.analysisArtefactId || null;
  const jobId = parameterSet?.calibrationJobId || null;
  const [note, setNote] = useState(null);
  const [rows, setRows] = useState(null);

  if (!artefactId && !jobId) {
    return (
      <p className="text-xs text-slate-500" data-testid="parameter-set-report-missing">
        {REPORT_NOT_STORED}
      </p>
    );
  }

  const openReport = async () => {
    const url = artefactId
      ? `/api/analysisArtefacts/${artefactId}/report`
      : `/api/calibrationJobs/${jobId}/report`;
    try {
      const body = await apiFetch(url, {}, auth);
      const html = body?.html;
      if (typeof html !== "string" || !html.trim()) {
        setNote(REPORT_NOT_STORED);
        return;
      }
      const blob = new Blob([html], { type: "text/html" });
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
    } catch {
      setNote(REPORT_NOT_STORED);
    }
  };

  const loadScores = async () => {
    try {
      if (artefactId) {
        const body = await apiFetch(`/api/analysisArtefacts/${artefactId}/scores`, {}, auth);
        const next = Array.isArray(body?.rows) ? body.rows : [];
        if (!next.length) {
          setNote(REPORT_NOT_STORED);
          setRows(null);
          return;
        }
        setNote(null);
        setRows(next);
        return;
      }
      const job = await apiFetch(`/api/calibrationJobs/${jobId}`, {}, auth);
      const fromRows = Array.isArray(job?.response?.scores) ? job.response.scores : [];
      const fromPersons = rowsFromPersonScores(job?.response?.fitStatistics?.personScores);
      const next = fromRows.length ? fromRows : fromPersons;
      if (!next.length) {
        setNote(REPORT_NOT_STORED);
        setRows(null);
        return;
      }
      setNote(null);
      setRows(next);
    } catch {
      setNote(REPORT_NOT_STORED);
      setRows(null);
    }
  };

  return (
    <div className="space-y-2" data-testid="parameter-set-report">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openReport}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          data-testid="parameter-set-open-report"
        >
          Open HTML report
        </button>
        <button
          type="button"
          onClick={loadScores}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          data-testid="parameter-set-load-scores"
        >
          Person scores
        </button>
      </div>
      {note && (
        <p className="text-xs text-slate-500" data-testid="parameter-set-report-missing">
          {note}
        </p>
      )}
      {rows && (
        <div className="text-xs text-slate-600" data-testid="parameter-set-person-scores">
          <p>
            {rows.length} person score{rows.length === 1 ? "" : "s"} loaded from the calibration record.
          </p>
          <ul className="mt-1 max-h-40 overflow-auto">
            {rows.map((row, index) => (
              <li key={`${row.personId || "row"}-${index}`}>
                {String(row.personId ?? "")}
                {row.theta != null ? ` theta ${row.theta}` : ""}
                {row.se != null ? ` se ${row.se}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
