// src/components/calibration/CalibrationJobList.jsx
// Browsing table: status, kind, evidence model, attempts, timestamps,
// converged. Mirrors QMatrixList / AssemblyModelList.

import React from "react";

import { Button } from "@/components/ui/button";
import CalibrationJobStatusBadge from "./CalibrationJobStatusBadge";
import { convergedLabel, formatTimestamp } from "./calibrationConsoleUtils";

export default function CalibrationJobList({
  jobs = [],
  isLoading = false,
  selectedId,
  onSelect,
  evidenceModels = [],
}) {
  const modelName = (id) => evidenceModels.find((m) => m.id === id)?.name || id || "—";

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading calibration jobs…</p>;
  }

  if (!jobs.length) {
    return <p className="text-sm text-muted-foreground">No calibration jobs yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="min-w-full text-caption">
        <thead>
          <tr className="bg-muted/50 text-left text-muted-foreground">
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Kind</th>
            <th className="px-4 py-2">Evidence model</th>
            <th className="px-4 py-2">Attempts</th>
            <th className="px-4 py-2">Requested</th>
            <th className="px-4 py-2">Finished</th>
            <th className="px-4 py-2">Converged</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const selected = job.id === selectedId;
            return (
              <tr
                key={job.id}
                className={`border-t border-border ${selected ? "bg-muted/60" : ""}`}
              >
                <td className="px-4 py-2">
                  <CalibrationJobStatusBadge status={job.status} />
                </td>
                <td className="px-4 py-2">{job.kind || "—"}</td>
                <td className="px-4 py-2">{modelName(job.evidenceModelId)}</td>
                <td className="px-4 py-2">
                  {job.attempts ?? "—"}
                  {job.maxAttempts ? ` / ${job.maxAttempts}` : ""}
                </td>
                <td className="px-4 py-2">{formatTimestamp(job.requestedAt)}</td>
                <td className="px-4 py-2">{formatTimestamp(job.finishedAt)}</td>
                <td className="px-4 py-2">{convergedLabel(job)}</td>
                <td className="px-4 py-2 text-right">
                  <Button variant="outline" size="sm" onClick={() => onSelect(job.id)}>
                    Inspect
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
