// src/utils/calibrationJobReadiness.js
// Client-side readiness mirror for calibration jobs (artefact 6).
// Independent of validateCalibrationJobLifecycle and ingestCalibrationJob
// -- a test asserts the two land in the same place. Sharing the server
// function would only prove the two callers agree with themselves
// (qMatrixIntegrity.test.js / D52).

const JOB_KINDS = [
  "irt-parameters",
  "dina-parameters",
  "ctt-statistics",
  "dif-analysis",
  "equating",
  "item-analysis",
  "test-information",
];

const PARAM_KINDS = new Set(["irt-parameters", "dina-parameters", "ctt-statistics"]);
const JOB_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"];
const CONTRACT_VERSION = "1.0";

function requestProblems(request) {
  const errors = [];
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return ["Request envelope is missing"];
  }
  if (request.contractVersion !== CONTRACT_VERSION) {
    errors.push("Request contractVersion must be 1.0");
  }
  if (!request.jobId) errors.push("Request jobId is required");
  if (!request.model?.family) errors.push("Request model.family is required");
  if (!Array.isArray(request.model?.itemIds) || request.model.itemIds.length < 2) {
    errors.push("Request model.itemIds must name at least two items");
  }
  const rm = request.responseMatrix;
  if (!rm || !Array.isArray(rm.personIds) || rm.personIds.length < 2) {
    errors.push("Request responseMatrix.personIds must name at least two persons");
  }
  if (!Array.isArray(rm?.itemIds) || rm.itemIds.length < 2) {
    errors.push("Request responseMatrix.itemIds must name at least two items");
  }
  if (
    Array.isArray(request.model?.itemIds) &&
    Array.isArray(rm?.itemIds) &&
    (request.model.itemIds.length !== rm.itemIds.length ||
      request.model.itemIds.some((id, i) => id !== rm.itemIds[i]))
  ) {
    errors.push("Request itemIds must match in order on model and responseMatrix");
  }
  if (request.options?.seed === undefined || request.options?.seed === null) {
    errors.push("Request options.seed is required");
  }
  return errors;
}

function responseProblems(response) {
  const errors = [];
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return ["Response envelope is missing"];
  }
  if (response.contractVersion !== CONTRACT_VERSION) {
    errors.push("Response contractVersion must be 1.0");
  }
  if (!response.jobId) errors.push("Response jobId is required");
  if (typeof response.converged !== "boolean") {
    errors.push("Response converged must be a boolean");
  }
  if (response.converged === true) {
    if (!response.packageVersion) errors.push("Response packageVersion is required");
    if (typeof response.sampleSize !== "number" || response.sampleSize <= 0) {
      errors.push("Response sampleSize must be a positive number");
    }
    if (!response.calibratedAt) errors.push("Response calibratedAt is required");
    if (!response.parameters || typeof response.parameters !== "object" || Array.isArray(response.parameters)) {
      errors.push("Response parameters is required");
    }
  }
  return errors;
}

export function enqueueReadiness(job, db) {
  const checks = [];

  const kindOk = JOB_KINDS.includes(job?.kind);
  checks.push({
    id: "kind",
    ok: kindOk,
    message: kindOk ? "Kind is declared" : `Unknown or missing job kind '${job?.kind || ""}'`,
  });

  const statusOk = JOB_STATUSES.includes(job?.status);
  checks.push({
    id: "status",
    ok: statusOk,
    message: statusOk ? "Status is a job state" : `Invalid job status '${job?.status || ""}'`,
  });

  const emOk = Boolean(job?.evidenceModelId);
  checks.push({
    id: "evidenceModelId",
    ok: emOk,
    message: emOk ? "Evidence model is named" : "evidenceModelId is required",
  });

  if (db && job?.evidenceModelId) {
    const em = db.evidenceModels?.find((m) => m.id === job.evidenceModelId);
    const found = Boolean(em);
    checks.push({
      id: "evidenceModelExists",
      ok: found,
      message: found ? "Evidence model exists" : `Unknown evidenceModelId '${job.evidenceModelId}'`,
    });
    if (em && job.statisticalModelId) {
      const sm = (em.statisticalModels || []).find((m) => m.id === job.statisticalModelId);
      checks.push({
        id: "statisticalModelExists",
        ok: Boolean(sm),
        message: sm
          ? "Statistical model exists"
          : `Unknown statisticalModelId '${job.statisticalModelId}'`,
      });
    }
  }

  const smOk = Boolean(job?.statisticalModelId);
  checks.push({
    id: "statisticalModelId",
    ok: smOk,
    message: smOk ? "Statistical model is named" : "statisticalModelId is required",
  });

  const attemptsOk = typeof job?.attempts === "number" && job.attempts >= 1;
  checks.push({
    id: "attempts",
    ok: attemptsOk,
    message: attemptsOk ? "attempts is recorded" : "attempts must be a positive number",
  });

  const maxOk = typeof job?.maxAttempts === "number" && job.maxAttempts >= 1;
  checks.push({
    id: "maxAttempts",
    ok: maxOk,
    message: maxOk ? "maxAttempts is recorded" : "maxAttempts must be a positive number",
  });

  if (job?.status === "running") {
    checks.push({
      id: "startedAt",
      ok: Boolean(job.startedAt),
      message: job.startedAt ? "startedAt is recorded" : "A running job must record startedAt",
    });
  }

  if (job?.status === "succeeded") {
    checks.push({
      id: "succeededResponse",
      ok: Boolean(job.response) && typeof job.response === "object",
      message: job.response ? "Succeeded job has a response" : "A succeeded job must store the R response",
    });
    checks.push({
      id: "finishedAt",
      ok: Boolean(job.finishedAt),
      message: job.finishedAt ? "finishedAt is recorded" : "A succeeded job must record finishedAt",
    });
  }

  if (job?.status === "failed") {
    const hasError = Boolean(job.error?.message);
    checks.push({
      id: "failedError",
      ok: hasError,
      message: hasError ? "Failed job has an inspectable error" : "A failed job must store an inspectable error",
    });
    checks.push({
      id: "finishedAt",
      ok: Boolean(job.finishedAt),
      message: job.finishedAt ? "finishedAt is recorded" : "A failed job must record finishedAt",
    });
  }

  const reqErrs = requestProblems(job?.request);
  checks.push({
    id: "request",
    ok: reqErrs.length === 0,
    message: reqErrs.length === 0 ? "Request envelope is valid" : reqErrs.join(" "),
  });

  return { ready: checks.every((c) => c.ok), checks };
}

export function ingestReadiness(job) {
  const checks = [];

  const succeeded = job?.status === "succeeded";
  checks.push({
    id: "succeeded",
    ok: succeeded,
    message: succeeded ? "Job succeeded" : `Job status is '${job?.status || "missing"}', not succeeded`,
  });

  const already = Boolean(job?.ingestedParameterSetId);
  checks.push({
    id: "notIngested",
    ok: !already,
    message: already
      ? `Already ingested as parameter set '${job.ingestedParameterSetId}'`
      : "Not yet ingested",
  });

  const writesParams = PARAM_KINDS.has(job?.kind);
  checks.push({
    id: "kindIngests",
    ok: writesParams,
    message: writesParams
      ? "Kind writes parameterSets"
      : `Kind '${job?.kind || ""}' writes an analysis artefact, not a parameter set`,
  });

  const responseErrors = responseProblems(job?.response);
  checks.push({
    id: "response",
    ok: responseErrors.length === 0,
    message: responseErrors.length === 0 ? "Response envelope is valid" : responseErrors.join(" "),
  });

  const converged = job?.response?.converged === true;
  checks.push({
    id: "converged",
    ok: converged,
    message: converged
      ? "Run converged"
      : "Ingestion refuses converged: false — the job stays inspectable and never becomes a parameter set",
  });

  return { ready: checks.every((c) => c.ok), checks };
}

export function ingestRefusalReasons(job) {
  return ingestReadiness(job)
    .checks.filter((c) => !c.ok)
    .map((c) => c.message);
}
