// src/components/calibration/CalibrationConsole.jsx
// D65: start, watch, inspect, ingest a calibrationJobs record without a
// shell. Admin writes; district is read-only. Students/teachers never
// mount this surface.

import React, { useMemo, useState } from "react";

import { useCalibrationJob, useCalibrationJobs } from "@/api/queries/calibrationJobs";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import CalibrationJobDetail from "./CalibrationJobDetail";
import CalibrationJobList from "./CalibrationJobList";
import EnqueueCalibrationForm from "./EnqueueCalibrationForm";
import { isActiveCalibrationJob, pollWhileActive } from "./calibrationConsoleUtils";

export default function CalibrationConsole({ readOnly = false }) {
  const [selectedId, setSelectedId] = useState(null);
  const { data: jobs = [], isLoading } = useCalibrationJobs(
    {},
    { refetchInterval: pollWhileActive }
  );
  const { data: selectedJob } = useCalibrationJob(selectedId, {
    refetchInterval: pollWhileActive,
  });
  const { data: evidenceModels = [] } = useEvidenceModels();

  const orderedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      const aAt = a.requestedAt || a.createdAt || "";
      const bAt = b.requestedAt || b.createdAt || "";
      return bAt.localeCompare(aAt);
    });
  }, [jobs]);

  const watching = orderedJobs.some(isActiveCalibrationJob);
  const detailJob =
    selectedJob || orderedJobs.find((job) => job.id === selectedId) || null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Parameter estimation</h2>
        <p className="mt-1 text-sm text-slate-500">
          Fit Evidence Model measurement parameters via calibration jobs (R/IRT).
          Distinct from Parameters &amp; Activation on an Evidence Model.
        </p>
      </div>

      {!readOnly && (
        <EnqueueCalibrationForm
          onEnqueued={(job) => {
            if (job?.id) setSelectedId(job.id);
          }}
        />
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Jobs</h2>
          {watching && (
            <p className="text-caption text-muted-foreground" role="status" aria-live="polite">
              Watching queued and running jobs…
            </p>
          )}
        </div>
        <CalibrationJobList
          jobs={orderedJobs}
          isLoading={isLoading}
          selectedId={selectedId}
          onSelect={setSelectedId}
          evidenceModels={evidenceModels}
        />
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <CalibrationJobDetail job={detailJob} readOnly={readOnly} />
      </section>
    </div>
  );
}
