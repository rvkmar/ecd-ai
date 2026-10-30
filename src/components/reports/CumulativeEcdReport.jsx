import React, { useEffect, useId, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { apiFetch, apiErrorMessage } from "@/api/apiClient";
import CumulativeEcdReportView, { titlesFor } from "./CumulativeEcdReportView.jsx";
import "../sessions/StudentEcdReport.css";

export default function CumulativeEcdReport({ kind = "student" }) {
  const { auth } = useAuth() || {};
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [districtId, setDistrictId] = useState("");
  const copy = titlesFor(kind);
  const panelId = useId();

  useEffect(() => {
    if (!auth || !open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (kind === "district" && auth.role === "admin" && districtId) {
      params.set("districtId", districtId);
    }
    const qs = params.toString();
    const path =
      kind === "teacher"
        ? "/api/reports/cumulative/teacher"
        : kind === "district"
          ? `/api/reports/cumulative/district${qs ? `?${qs}` : ""}`
          : "/api/reports/cumulative/student";
    apiFetch(path, {}, auth)
      .then((body) => {
        if (cancelled) return;
        setReport(body);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(apiErrorMessage(err, "Failed to load cumulative report"));
        setReport(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auth?.token, auth?.role, kind, districtId, open]);

  return (
    <div className="ecd-sheet p-4">
      <div className="ecd-toolbar ecd-no-print">
        {open && kind === "district" && auth?.role === "admin" && (
          <label className="ecd-filter">
            District
            <input
              value={districtId}
              onChange={(e) => setDistrictId(e.target.value)}
              placeholder="All districts"
            />
          </label>
        )}
        <button
          type="button"
          className="ecd-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide cumulative report" : "Show cumulative report"}
        </button>
        {open ? (
          <button type="button" onClick={() => window.print()}>
            Print report
          </button>
        ) : null}
      </div>
      <div id={panelId} className={`ecd-paper ${kind === "student" ? "" : "wide"}`}>
        <h2 className="ecd-title">{copy.title}</h2>
        <p className="ecd-sub">{copy.sub}</p>
        {!open && (
          <p className="ecd-note">
            The report stays hidden until you show it. Opening it reads every closed session in this scope.
          </p>
        )}
        {open && loading && <p className="ecd-note">Loading cumulative report…</p>}
        {open && error && (
          <p className="ecd-error" role="alert">
            {error}
          </p>
        )}
        {open && !loading && !error && <CumulativeEcdReportView report={report} />}
      </div>
    </div>
  );
}
