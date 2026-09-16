// server/r/calibrationIngest.js
// Append an ADR 0002 parameter set (parameter kinds) or an analysis
// artefact (DIF / equating / item-analysis / test-information) from a
// succeeded job. Refuses converged: false. Analysis kinds write the
// top-level analysisArtefacts collection (D76); they inform and do not
// authorise a parameter set or lifecycle transition.

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
  const now = extras.createdAt || new Date().toISOString();
  const id = extras.analysisArtefactId || extras.id;
  return {
    id,
    kind: extras.kind,
    jobId: extras.calibrationJobId || extras.jobId,
    scope: {
      evidenceModelId: extras.evidenceModelId,
      taskModelId: extras.taskModelId ?? null,
      cohort: extras.cohort ?? null,
      // W20 tenancy review will inspect these; D79 shapes them now.
      tenantId: extras.tenantId ?? null,
      districtId: extras.districtId ?? null,
      schoolId: extras.schoolId ?? null,
    },
    packageVersion: response.packageVersion,
    sampleSize: response.sampleSize,
    computedAt: response.calibratedAt,
    payload: {
      parameters: response.parameters,
      standardErrors: response.standardErrors ?? undefined,
      fitStatistics: response.fitStatistics ?? undefined,
      diagnostics: response.diagnostics ?? undefined,
      converged: response.converged,
      calibratedBy: extras.calibratedBy || "r-backend",
      calibrationMethod: extras.calibrationMethod || "r-job",
      notes: extras.notes || "",
      statisticalModelId: extras.statisticalModelId ?? undefined,
    },
    createdAt: now,
  };
}

/** Convenience aliases so console/tests that still read nested DIF fields keep working. */
function analysisArtefactIngestView(record) {
  if (!record) return null;
  return {
    ...record,
    analysisArtefactId: record.id,
    calibrationJobId: record.jobId,
    parameters: record.payload?.parameters,
    standardErrors: record.payload?.standardErrors,
    fitStatistics: record.payload?.fitStatistics,
    diagnostics: record.payload?.diagnostics,
    converged: record.payload?.converged,
    calibratedBy: record.payload?.calibratedBy,
    calibrationMethod: record.payload?.calibrationMethod,
    notes: record.payload?.notes,
    calibratedAt: record.computedAt,
  };
}

export function ingestCalibrationJob(job, db, extras = {}) {
  const refusal = ingestRefusal(job, db);
  if (refusal) {
    return { ok: false, error: refusal };
  }

  if (jobKindIngestsAnalysisArtefact(job.kind)) {
    const analysisArtefactId = extras.analysisArtefactId || `aa${Date.now()}`;
    const scopeFromRequest = job.request?.scope || {};
    const artefact = analysisArtefactFromCalibrationResponse(job.response, {
      analysisArtefactId,
      kind: job.kind,
      calibrationJobId: job.id,
      evidenceModelId: job.evidenceModelId,
      statisticalModelId: job.statisticalModelId,
      taskModelId: extras.taskModelId ?? scopeFromRequest.taskModelId ?? null,
      cohort:
        extras.cohort ??
        scopeFromRequest.cohortId ??
        job.request?.cohort?.id ??
        null,
      tenantId: extras.tenantId ?? scopeFromRequest.tenantId ?? null,
      districtId: extras.districtId ?? scopeFromRequest.districtId ?? null,
      schoolId: extras.schoolId ?? scopeFromRequest.schoolId ?? null,
      calibratedBy: extras.calibratedBy || job.requestedBy || "r-backend",
      calibrationMethod:
        job.kind === "attribute-profile-summary" ? "node-job" : "r-job",
      notes: extras.notes || "",
    });

    const { valid, errors } = validateEntity("analysisArtefacts", artefact, db, { strict: false });
    if (!valid) {
      return { ok: false, error: "Analysis artefact failed validation", details: errors };
    }

    db.analysisArtefacts = db.analysisArtefacts || [];
    db.analysisArtefacts.push(artefact);

    job.ingestedAnalysisArtefactId = analysisArtefactId;
    job.updatedAt = new Date().toISOString();
    return { ok: true, analysisArtefact: analysisArtefactIngestView(artefact) };
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
