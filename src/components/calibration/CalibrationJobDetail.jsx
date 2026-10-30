// src/components/calibration/CalibrationJobDetail.jsx
// Inspect a job: request summary, R response, stderr on failure, and
// lifecycle actions. Ingest of converged: false must show the 409; it
// must not look like a parameter set was written. A succeeded IRT/DINA
// run also diffs against the current active set, largest |Δ| first.

import React, { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { apiErrorMessage, apiFetch } from "@/api/apiClient";
import { useAuth } from "@/auth/AuthProvider";
import IrtFitTable from "@/components/psychometrics/IrtFitTable";
import ModelCriticismPanel from "./ModelCriticismPanel";
import {
  useCancelCalibrationJob,
  useIngestCalibrationJob,
  useProcessCalibrationJob,
  useRetryCalibrationJob,
} from "@/api/queries/calibrationJobs";
import { useActivateParameterSet, useEvidenceModel } from "@/api/queries/evidenceModels";
import ParameterSetDiff from "@/components/evidences/calibration/panels/ParameterSetDiff";
import CalibrationJobStatusBadge from "./CalibrationJobStatusBadge";
import {
  convergedLabel,
  formatTimestamp,
  requestSummary,
} from "./calibrationConsoleUtils";
import { jobKindIngestsAnalysisArtefact } from "@/utils/ecdVocabulary";

function candidateParameterSet(job, ingestResult) {
  const parameters = ingestResult?.parameters || job?.response?.parameters;
  if (!parameters || typeof parameters !== "object") return null;
  return {
    parameterSetId:
      ingestResult?.parameterSetId || job.ingestedParameterSetId || "this run",
    parameters,
  };
}

function activeParameterSet(evidenceModel, statisticalModelId) {
  const statisticalModel = evidenceModel?.statisticalModels?.find(
    (model) => model.id === statisticalModelId
  );
  if (!statisticalModel) return null;
  return (
    statisticalModel.parameterSets?.find(
      (set) => set.parameterSetId === statisticalModel.activeParameterSetId
    ) || null
  );
}

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
  const { auth } = useAuth() || {};
  const { data: evidenceModel } = useEvidenceModel(job?.evidenceModelId);
  const cancel = useCancelCalibrationJob();
  const retry = useRetryCalibrationJob();
  const process = useProcessCalibrationJob();
  const ingest = useIngestCalibrationJob();
  const activate = useActivateParameterSet();
  const [actionError, setActionError] = useState(null);
  const [ingestResult, setIngestResult] = useState(null);
  const [activatedId, setActivatedId] = useState(null);

  if (!job) {
    return <p className="text-sm text-muted-foreground">Select a job to inspect it.</p>;
  }

  const summary = requestSummary(job);
  const response = job.response;
  const canCancel = !readOnly && job.status === "queued";
  const canProcess = !readOnly && job.status === "queued";
  const canRetry =
    !readOnly &&
    (job.status === "failed" || job.status === "not-converged") &&
    (job.attempts || 0) < (job.maxAttempts || 0);
  const canIngest =
    !readOnly &&
    job.status === "succeeded" &&
    !job.ingestedParameterSetId &&
    !job.ingestedAnalysisArtefactId;
  const writesArtefact = jobKindIngestsAnalysisArtefact(job.kind);
  const activeSet = activeParameterSet(evidenceModel, job.statisticalModelId);
  const otherSet = candidateParameterSet(job, ingestResult);

  async function runAction(label, mutation, id) {
    setActionError(null);
    if (label !== "Ingest") setIngestResult(null);
    try {
      const result = await mutation.mutateAsync(id);
      if (label === "Ingest") {
        const parameterSetId =
          result?.parameterSet?.parameterSetId || result?.job?.ingestedParameterSetId;
        const analysisArtefactId =
          result?.analysisArtefact?.id ||
          result?.analysisArtefact?.analysisArtefactId ||
          result?.job?.ingestedAnalysisArtefactId;
        if (analysisArtefactId) {
          setIngestResult(result.analysisArtefact || { analysisArtefactId });
          toast.success(`Ingested as analysis artefact ${analysisArtefactId}.`);
          return;
        }
        if (!parameterSetId) {
          setIngestResult(null);
          setActionError("Ingest succeeded but no parameter set or analysis artefact id was returned.");
          toast.error("Ingest response did not include a parameter set or analysis artefact.");
          return;
        }
        setIngestResult(result.parameterSet || { parameterSetId, status: "candidate" });
        setActivatedId(null);
        toast.success(`Saved candidate parameter set ${parameterSetId}. It is not active yet.`);
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
          not write a {writesArtefact ? "analysis artefact" : "parameter set"}.
        </p>
      )}

      {actionError && (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
      )}

      {ingestResult?.parameterSetId && (
        <div className="space-y-2" role="status">
          <p className="text-sm">
            Saved parameter set <strong>{ingestResult.parameterSetId}</strong> as a
            candidate. Scoring still uses the active set.
          </p>
          {!readOnly && activatedId !== ingestResult.parameterSetId && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={activate.isPending}
              onClick={async () => {
                setActionError(null);
                try {
                  await activate.mutateAsync({
                    id: job.evidenceModelId,
                    payload: {
                      statisticalModelId: job.statisticalModelId,
                      parameterSetId: ingestResult.parameterSetId,
                    },
                  });
                  setActivatedId(ingestResult.parameterSetId);
                  toast.success(`Activated parameter set ${ingestResult.parameterSetId}.`);
                } catch (err) {
                  const message = apiErrorMessage(err, "Activation failed.");
                  setActionError(message);
                  toast.error(message);
                }
              }}
            >
              {activate.isPending ? "Activating…" : "Activate candidate"}
            </Button>
          )}
          {activatedId === ingestResult.parameterSetId && (
            <p className="text-sm">
              Activated <strong>{activatedId}</strong>. New sessions use this set.
            </p>
          )}
        </div>
      )}

      {ingestResult?.analysisArtefactId || ingestResult?.id ? (
        <p className="text-sm" role="status">
          Wrote analysis artefact{" "}
          <strong>{ingestResult.analysisArtefactId || ingestResult.id}</strong>.
        </p>
      ) : null}

      {job.ingestedParameterSetId && !ingestResult && (
        <p className="text-sm" role="status">
          Already ingested as parameter set <strong>{job.ingestedParameterSetId}</strong>.
        </p>
      )}

      {job.ingestedAnalysisArtefactId && !ingestResult && (
        <p className="text-sm" role="status">
          Already ingested as analysis artefact{" "}
          <strong>{job.ingestedAnalysisArtefactId}</strong>.
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
            <div>
              <dt className="text-muted-foreground">Source</dt>
              <dd>
                {summary.responseSource === "sessions" || summary.source === "completed-sessions"
                  ? "Live sessions"
                  : summary.responseSource === "fixture"
                    ? summary.fixtureName
                      ? `Fixture ${summary.fixtureName}`
                      : "Fixture"
                    : "Response matrix"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Sample size</dt>
              <dd>{summary.personCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Q-matrix</dt>
              <dd>{summary.qMatrixId || "none"}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-muted-foreground">Item ids</dt>
              <dd>{summary.itemIds.join(", ") || "—"}</dd>
            </div>
            {(summary.responseSource === "sessions" || summary.source === "completed-sessions") && (
              <div className="md:col-span-2">
                <dt className="text-muted-foreground">Sessions</dt>
                <dd>
                  {summary.sourceSessionCount != null
                    ? `${summary.sourceSessionCount} finished session${summary.sourceSessionCount === 1 ? "" : "s"}.`
                    : "Finished sessions."}
                  {summary.missingCellCount != null
                    ? ` Missing responses: ${summary.missingCellCount}.`
                    : ""}
                  {summary.sourceSessionIds.length > 0
                    ? ` Session ids: ${summary.sourceSessionIds.join(", ")}.`
                    : ""}
                  {summary.studentIds.length > 0
                    ? ` Students: ${summary.studentIds.join(", ")}.`
                    : ""}
                </dd>
              </div>
            )}
            {summary.attributeIds.length > 0 && (
              <div className="md:col-span-2">
                <dt className="text-muted-foreground">Q-matrix attributes</dt>
                <dd>{summary.attributeIds.join(", ")}</dd>
              </div>
            )}
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
            {(response.reportHtml || job.hasReport) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="open-html-report-job"
                onClick={async () => {
                  let html = response.reportHtml;
                  if (typeof html !== "string" || !html.trim()) {
                    const body = await apiFetch(
                      `/api/calibrationJobs/${job.id}/report`,
                      {},
                      auth
                    );
                    html = body?.html;
                  }
                  if (!html) return;
                  const blob = new Blob([html], { type: "text/html" });
                  const url = URL.createObjectURL(blob);
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
              >
                Open HTML report
              </Button>
            )}
            <IrtFitTable
              parameters={response.parameters}
              standardErrors={response.standardErrors}
              itemFit={response.fitStatistics?.itemFit}
            />
            {activeSet && otherSet && (
              <ParameterSetDiff
                activeSet={activeSet}
                otherSet={otherSet}
                observables={evidenceModel?.observables || []}
                otherLabel={otherSet.parameterSetId}
              />
            )}
            {otherSet && !activeSet && (
              <p className="text-sm text-muted-foreground" data-testid="parameter-set-diff-missing-active">
                No active parameter set to compare against this run. Activate a
                candidate, or compare two sets on Parameter Sets.
              </p>
            )}
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
            <ModelCriticismPanel fitStatistics={response.fitStatistics} jobId={job.id} />
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

      {(job.status === "failed" || job.status === "not-converged") && job.error && (
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
