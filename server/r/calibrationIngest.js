// server/r/calibrationIngest.js
// Append an ADR 0002 parameter set from a succeeded job. Refuses
// converged: false -- the job stays inspectable and never becomes a
// stored parameter set (Day 19 + ADR 0002 + D63).

import { validateEntity } from "../../src/utils/schema.js";
import { CALIBRATION_JOB_KINDS, jobKindIngestsParameterSets } from "../../src/utils/ecdVocabulary.js";
import {
  parameterSetFromCalibrationResponse,
  validateCalibrationResponse,
} from "./calibrationContract.js";

export function ingestRefusal(job, db) {
  if (!job) return "Calibration job not found.";
  if (job.status !== "succeeded") {
    return `Job status is '${job.status}', not succeeded`;
  }
  if (job.ingestedParameterSetId) {
    return `Already ingested as parameter set '${job.ingestedParameterSetId}'`;
  }
  const kindMeta = CALIBRATION_JOB_KINDS.find((k) => k.value === job.kind);
  if (!jobKindIngestsParameterSets(job.kind) || kindMeta?.ingests !== "parameterSets") {
    return `Kind '${job.kind}' writes an analysis artefact, not a parameter set`;
  }
  const responseErrors = validateCalibrationResponse(job.response);
  if (responseErrors.length > 0) {
    return responseErrors.join(" ");
  }
  if (job.response?.converged !== true) {
    return "Ingestion refuses converged: false — the job stays inspectable and never becomes a parameter set";
  }
  if (db) {
    const em = db.evidenceModels?.find((m) => m.id === job.evidenceModelId);
    if (!em) return `Evidence model '${job.evidenceModelId}' not found.`;
    const sm = (em.statisticalModels || []).find((m) => m.id === job.statisticalModelId);
    if (!sm) return `Statistical model '${job.statisticalModelId}' not found.`;
  }
  return null;
}

export function ingestCalibrationJob(job, db, extras = {}) {
  const refusal = ingestRefusal(job, db);
  if (refusal) {
    return { ok: false, error: refusal };
  }

  const em = db.evidenceModels.find((m) => m.id === job.evidenceModelId);
  const sm = em.statisticalModels.find((m) => m.id === job.statisticalModelId);

  const parameterSetId = extras.parameterSetId || `ps${Date.now()}`;
  const parameterSet = parameterSetFromCalibrationResponse(job.response, {
    parameterSetId,
    calibrationKind: job.kind,
    calibrationJobId: job.id,
    calibratedBy: extras.calibratedBy || job.requestedBy || "r-backend",
    calibrationMethod: "r-job",
  });

  sm.parameterSets = sm.parameterSets || [];
  sm.parameterSets.push(parameterSet);

  const { valid, errors } = validateEntity("evidenceModels", em, db, { strict: false });
  if (!valid) {
    sm.parameterSets = sm.parameterSets.filter((p) => p.parameterSetId !== parameterSetId);
    return { ok: false, error: "Parameter set failed evidence-model validation", details: errors };
  }

  job.ingestedParameterSetId = parameterSetId;
  em.updatedAt = new Date().toISOString();
  job.updatedAt = em.updatedAt;

  return { ok: true, parameterSet };
}
