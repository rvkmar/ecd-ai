// server/r/calibrationIngest.js
// Append an ADR 0002 parameter set (parameter kinds) or an analysis
// artefact (DIF / equating / item-analysis / test-information) from a
// succeeded job. Refuses converged: false. DIF informs; it does not
// authorise a parameter set.

import { validateEntity } from "../../src/utils/schema.js";
import { jobKindIngestsParameterSets, jobKindIngestsAnalysisArtefact } from "../../src/utils/ecdVocabulary.js";
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
  if (job.ingestedAnalysisArtefactId) {
    return `Already ingested as analysis artefact '${job.ingestedAnalysisArtefactId}'`;
  }

  const writesParams = jobKindIngestsParameterSets(job.kind);
  const writesArtefact = jobKindIngestsAnalysisArtefact(job.kind);
  if (!writesParams && !writesArtefact) {
    return `Kind '${job.kind}' has no ingest target`;
  }

  const responseErrors = validateCalibrationResponse(job.response);
  if (responseErrors.length > 0) {
    return responseErrors.join(" ");
  }
  if (job.response?.converged !== true) {
    return writesArtefact
      ? "Ingestion refuses converged: false — the job stays inspectable and never becomes an analysis artefact"
      : "Ingestion refuses converged: false — the job stays inspectable and never becomes a parameter set";
  }
  if (db) {
    const em = db.evidenceModels?.find((m) => m.id === job.evidenceModelId);
    if (!em) return `Evidence model '${job.evidenceModelId}' not found.`;
    const sm = (em.statisticalModels || []).find((m) => m.id === job.statisticalModelId);
    if (!sm) return `Statistical model '${job.statisticalModelId}' not found.`;
  }
  return null;
}

function analysisArtefactFromCalibrationResponse(response, extras = {}) {
  return {
    analysisArtefactId: extras.analysisArtefactId,
    kind: extras.kind,
    parameters: response.parameters,
    standardErrors: response.standardErrors ?? undefined,
    fitStatistics: response.fitStatistics ?? undefined,
    diagnostics: response.diagnostics ?? undefined,
    packageVersion: response.packageVersion,
    converged: response.converged,
    sampleSize: response.sampleSize,
    calibratedAt: response.calibratedAt,
    calibrationJobId: extras.calibrationJobId,
    calibratedBy: extras.calibratedBy || "r-backend",
    calibrationMethod: extras.calibrationMethod || "r-job",
    notes: extras.notes || "",
  };
}

export function ingestCalibrationJob(job, db, extras = {}) {
  const refusal = ingestRefusal(job, db);
  if (refusal) {
    return { ok: false, error: refusal };
  }

  if (jobKindIngestsAnalysisArtefact(job.kind)) {
    const em = db.evidenceModels.find((m) => m.id === job.evidenceModelId);
    const analysisArtefactId = extras.analysisArtefactId || `aa${Date.now()}`;
    const artefact = analysisArtefactFromCalibrationResponse(job.response, {
      analysisArtefactId,
      kind: job.kind,
      calibrationJobId: job.id,
      calibratedBy: extras.calibratedBy || job.requestedBy || "r-backend",
      calibrationMethod: "r-job",
    });
    em.analysisArtefacts = em.analysisArtefacts || [];
    em.analysisArtefacts.push(artefact);

    const { valid, errors } = validateEntity("evidenceModels", em, db, { strict: false });
    if (!valid) {
      em.analysisArtefacts = em.analysisArtefacts.filter(
        (a) => a.analysisArtefactId !== analysisArtefactId
      );
      return { ok: false, error: "Analysis artefact failed evidence-model validation", details: errors };
    }

    job.ingestedAnalysisArtefactId = analysisArtefactId;
    em.updatedAt = new Date().toISOString();
    job.updatedAt = em.updatedAt;
    return { ok: true, analysisArtefact: artefact };
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
  // Same as POST /evidenceModels/:id/recalibrate: an ingested calibrated
  // set becomes the live pointer so new sessions leave pilot. In-flight
  // sessions stay on their opening freeze (D68); they do not retag.
  const previousActiveParameterSetId = sm.activeParameterSetId ?? null;
  sm.activeParameterSetId = parameterSetId;

  const { valid, errors } = validateEntity("evidenceModels", em, db, { strict: false });
  if (!valid) {
    sm.parameterSets = sm.parameterSets.filter((p) => p.parameterSetId !== parameterSetId);
    sm.activeParameterSetId = previousActiveParameterSetId;
    return { ok: false, error: "Parameter set failed evidence-model validation", details: errors };
  }

  job.ingestedParameterSetId = parameterSetId;
  em.updatedAt = new Date().toISOString();
  job.updatedAt = em.updatedAt;

  return { ok: true, parameterSet };
}
