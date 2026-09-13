// src/components/calibration/CalibrationJobDetail.jsx
// Inspect a job: request summary, R response, stderr on failure, and
// lifecycle actions. Ingest of converged: false must show the 409; it
// must not look like a parameter set was written.

import React, { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/api/apiClient";
import {
  useCancelCalibrationJob,
  useIngestCalibrationJob,
  useProcessCalibrationJob,
  useRetryCalibrationJob,
} from "@/api/queries/calibrationJobs";
import CalibrationJobStatusBadge from "./CalibrationJobStatusBadge";
import {
  convergedLabel,
  formatTimestamp,
  requestSummary,
} from "./calibrationConsoleUtils";

function JsonBlock({ value, empty }) {
  if (value == null) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <pre className="max-h-80 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-caption">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function CalibrationJobDetail({ job, readOnly = false }) {
  const cancel = useCancelCalibrationJob();
  const retry = useRetryCalibrationJob();
  const process = useProcessCalibrationJob();
  const ingest = useIngestCalibrationJob();
  const [actionError, setActionError] = useState(null);
  const [ingestResult, setIngestResult] = useState(null);

  if (!job) {
    return <p className="text-sm text-muted-foreground">Select a job to inspect it.</p>;
  }

  const summary = requestSummary(job);
  const response = job.response;
  const canCancel = !readOnly && job.status === "queued";
  const canProcess = !readOnly && job.status === "queued";
  const canRetry =
    !readOnly && job.status === "failed" && (job.attempts || 0) < (job.maxAttempts || 0);
  const canIngest = !readOnly && job.status === "succeeded" && !job.ingestedParameterSetId;

  async function runAction(label, mutation, id) {
    setActionError(null);
    if (label !== "Ingest") setIngestResult(null);
    try {
      const result = await mutation.mutateAsync(id);
      if (label === "Ingest") {
        const parameterSetId =
          result?.parameterSet?.parameterSetId || result?.job?.ingestedParameterSetId;
        if (!parameterSetId) {
          setIngestResult(null);
          setActionError("Ingest succeeded but no parameter set id was returned.");
          toast.error("Ingest response did not include a parameter set.");
          return;
        }
        setIngestResult(result.parameterSet || { parameterSetId });
        toast.success(`Ingested as parameter set ${parameterSetId}.`);
        return;
      }
      toast.success(`${label} completed.`);
    } catch (err) {
      const message = apiErrorMessage(err, `${label} failed.`);
      if (label === "Ingest") setIngestResult(null);
      setActionError(message);
      toast.error(message);
    }
  }

  return (
    <div className="space-y-6" aria-label={`Calibration job ${job.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Inspect {job.id}</h2>
          <p className="text-sm text-muted-foreground">
            {job.kind} · {job.evidenceModelId} / {job.statisticalModelId}
          </p>
        </div>
        <CalibrationJobStatusBadge status={job.status} />
      </div>

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          {canCancel && (
            <Button
              variant="outline"
              size="sm"
              disabled={cancel.isPending}
              onClick={() => runAction("Cancel", cancel, job.id)}
            >
              Cancel
            </Button>
          )}
          {canProcess && (
            <Button
              size="sm"
              disabled={process.isPending}
              onClick={() => runAction("Process", process, job.id)}
            >
              {process.isPending ? "Processing…" : "Process"}
            </Button>
          )}
          {canRetry && (
            <Button
              variant="outline"
              size="sm"
              disabled={retry.isPending}
              onClick={() => runAction("Retry", retry, job.id)}
            >
              Retry
            </Button>
          )}
          {canIngest && (
            <Button
              size="sm"
              disabled={ingest.isPending}
              onClick={() => runAction("Ingest", ingest, job.id)}
            >
              {ingest.isPending ? "Ingesting…" : "Ingest"}
            </Button>
          )}
        </div>
      )}

      {job.response?.converged === false && canIngest && (
        <p className="text-sm text-muted-foreground">
          This run did not converge. Ingest will be refused (HTTP 409) and will
          not write a parameter set.
        </p>
      )}

      {actionError && (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
      )}

      {ingestResult?.parameterSetId && (
        <p className="text-sm" role="status">
          Wrote parameter set <strong>{ingestResult.parameterSetId}</strong>.
        </p>
      )}

      {job.ingestedParameterSetId && !ingestResult && (
        <p className="text-sm" role="status">
          Already ingested as parameter set <strong>{job.ingestedParameterSetId}</strong>.
        </p>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Request</h3>
        {summary ? (
          <dl className="grid gap-2 text-sm md:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Family / subtype</dt>
              <dd>
                {summary.family} / {summary.subtype}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Items × persons</dt>
              <dd>
                {summary.itemIds.length} × {summary.personCount}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Seed</dt>
              <dd>{summary.seed ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Contract</dt>
              <dd>{summary.contractVersion}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-muted-foreground">Item ids</dt>
              <dd>{summary.itemIds.join(", ") || "—"}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">No request envelope on this job.</p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Response</h3>
        {response ? (
          <div className="space-y-3">
            <dl className="grid gap-2 text-sm md:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Converged</dt>
                <dd>{convergedLabel(job)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Package</dt>
                <dd>{response.packageVersion || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Sample size</dt>
                <dd>{response.sampleSize ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Calibrated at</dt>
                <dd>{formatTimestamp(response.calibratedAt)}</dd>
              </div>
            </dl>
            <div>
              <h4 className="mb-1 text-caption font-medium text-muted-foreground">Parameters</h4>
              <JsonBlock value={response.parameters} empty="No parameters on this response." />
            </div>
            <div>
              <h4 className="mb-1 text-caption font-medium text-muted-foreground">
                Standard errors
              </h4>
              <JsonBlock
                value={response.standardErrors}
                empty="No standard errors on this response."
              />
            </div>
            <div>
              <h4 className="mb-1 text-caption font-medium text-muted-foreground">Fit</h4>
              <JsonBlock
                value={response.fitStatistics}
                empty="No fit statistics on this response."
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No response yet. Queued and running jobs are polled until they finish.
          </p>
        )}
      </section>

      {job.status === "failed" && job.error && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Error</h3>
          <p className="text-sm">
            {job.error.message}
            {job.error.rClass ? ` (${job.error.rClass})` : ""}
          </p>
          {job.error.stderr ? (
            <pre className="max-h-80 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-caption">
              {job.error.stderr}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">No stderr captured.</p>
          )}
        </section>
      )}

      <dl className="grid gap-2 text-caption text-muted-foreground md:grid-cols-3">
        <div>
          <dt>Requested</dt>
          <dd>{formatTimestamp(job.requestedAt)}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{formatTimestamp(job.startedAt)}</dd>
        </div>
        <div>
          <dt>Finished</dt>
          <dd>{formatTimestamp(job.finishedAt)}</dd>
        </div>
      </dl>
    </div>
  );
}
