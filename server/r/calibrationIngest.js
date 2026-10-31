// server/r/calibrationIngest.js
// Append an ADR 0002 parameter set (parameter kinds) or an analysis
// artefact (DIF / equating / item-analysis / test-information) from a
// succeeded job. Refuses converged: false. Analysis kinds write the
// top-level analysisArtefacts collection (D76); they inform and do not
// authorise a parameter set or lifecycle transition.

import { validateEntity } from "../../src/utils/schema.js";
import { parameterSetStorageErrors } from "../../src/utils/parameterSetRecord.js";
import { markParameterSetCandidate } from "../../src/utils/parameterSetStatus.js";
import { jobKindIngestsParameterSets, jobKindIngestsAnalysisArtefact } from "../../src/utils/ecdVocabulary.js";
import { saveCalibrationJob } from "../calibrationJobs/calibrationJobRepository.js";
import {
  persistAnalysisArtefact,
  placeAnalysisArtefact,
} from "../analysisArtefacts/analysisArtefactRepository.js";
import {
  diagnosticParameterKeyErrors,
  parameterSetFromCalibrationResponse,
  validateCalibrationResponse,
} from "./calibrationContract.js";
import { slimParameterSet } from "../../src/utils/slimParameterSet.js";
import { validityEvidenceUseExternalStore } from "../validityEvidence/validityEvidenceBackend.js";
import {
  linkTu4FitEvidence,
  tu4LinkInputFromArtefact,
  tu4LinkInputFromParameterSet,
} from "../validityEvidence/linkTu4Fit.js";
import { ensureTu4Link } from "../validityEvidence/validityEvidenceRepository.js";

function sessionProvenanceFromJob(job) {
  const prov = job?.request?.provenance;
  const fromSessions = job?.responseSource === "sessions" || prov?.source === "completed-sessions";
  const qMatrixId = job?.qMatrixId || prov?.qMatrixId || null;
  const out = {};
  if (typeof qMatrixId === "string" && qMatrixId) out.qMatrixId = qMatrixId;
  if (!fromSessions) return out;
  out.responseSource = "sessions";
  const ids = Array.isArray(job?.sourceSessionIds)
    ? job.sourceSessionIds
    : Array.isArray(prov?.sourceSessionIds)
      ? prov.sourceSessionIds
      : null;
  if (ids) out.sourceSessionIds = ids;
  const count = Number.isFinite(job?.sourceSessionCount)
    ? job.sourceSessionCount
    : Number.isFinite(prov?.sourceSessionCount)
      ? prov.sourceSessionCount
      : null;
  if (count != null) out.sourceSessionCount = count;
  const hash = job?.sourceSessionIdsHash || prov?.sourceSessionIdsHash || null;
  if (typeof hash === "string" && hash) out.sourceSessionIdsHash = hash;
  return out;
}

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
  if (writesParams) {
    const keyErrors = diagnosticParameterKeyErrors(job.request, job.response?.parameters);
    if (keyErrors.length > 0) return keyErrors.join(" ");
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
      reportHtml: typeof response.reportHtml === "string" ? response.reportHtml : undefined,
      scores: Array.isArray(response.scores) ? response.scores : undefined,
      scoresCsv: typeof response.scoresCsv === "string" ? response.scoresCsv : undefined,
      tifCsv: typeof response.tifCsv === "string" ? response.tifCsv : undefined,
      iifCsv: typeof response.iifCsv === "string" ? response.iifCsv : undefined,
      personFitRows: Array.isArray(response.personFitRows) ? response.personFitRows : undefined,
      q3Matrix:
        response.q3Matrix && typeof response.q3Matrix === "object" && !Array.isArray(response.q3Matrix)
          ? response.q3Matrix
          : undefined,
      credits: response.credits && typeof response.credits === "object" ? response.credits : undefined,
      reportTemplate:
        extras.reportTemplate ||
        (response.reportTemplate && typeof response.reportTemplate === "object"
          ? response.reportTemplate
          : undefined),
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
      reportTemplate: extras.reportTemplate || job.request?.reportTemplate || null,
    });

    const { valid, errors } = validateEntity("analysisArtefacts", artefact, db, { strict: false });
    if (!valid) {
      return { ok: false, error: "Analysis artefact failed validation", details: errors };
    }

    placeAnalysisArtefact(db, artefact);
    if (!validityEvidenceUseExternalStore()) {
      linkTu4FitEvidence(db, tu4LinkInputFromArtefact(artefact));
    }

    job.ingestedAnalysisArtefactId = analysisArtefactId;
    job.updatedAt = new Date().toISOString();
    return { ok: true, analysisArtefact: analysisArtefactIngestView(artefact) };
  }

  const em = db.evidenceModels.find((m) => m.id === job.evidenceModelId);
  const sm = em.statisticalModels.find((m) => m.id === job.statisticalModelId);

  const parameterSetId = extras.parameterSetId || `ps${Date.now()}`;
  const bnRows =
    job.kind === "bn-parameters" && Array.isArray(job.response?.bnPersonPosteriors)
      ? job.response.bnPersonPosteriors
      : [];
  let placedArtefact = null;
  let analysisArtefactId = extras.analysisArtefactId || null;
  if (bnRows.length) {
    analysisArtefactId = analysisArtefactId || `aa${Date.now()}`;
    const now = new Date().toISOString();
    const scopeFromRequest = job.request?.scope || {};
    const artefact = {
      id: analysisArtefactId,
      kind: "bn-parameters",
      jobId: job.id,
      scope: {
        evidenceModelId: job.evidenceModelId,
        taskModelId: extras.taskModelId ?? scopeFromRequest.taskModelId ?? null,
        cohort: extras.cohort ?? scopeFromRequest.cohortId ?? job.request?.cohort?.id ?? null,
        tenantId: extras.tenantId ?? scopeFromRequest.tenantId ?? null,
        districtId: extras.districtId ?? scopeFromRequest.districtId ?? null,
        schoolId: extras.schoolId ?? scopeFromRequest.schoolId ?? null,
      },
      packageVersion: job.response.packageVersion,
      sampleSize: job.response.sampleSize,
      computedAt: job.response.calibratedAt,
      payload: {
        bnPersonPosteriors: bnRows,
        statisticalModelId: job.statisticalModelId,
        converged: job.response.converged,
        calibratedBy: extras.calibratedBy || job.requestedBy || "r-backend",
        calibrationMethod: "r-job",
        notes:
          "Person-level latent posterior marginals. Conditional probability tables are on the parameter set.",
      },
      createdAt: now,
    };
    const artefactCheck = validateEntity("analysisArtefacts", artefact, db, { strict: false });
    if (!artefactCheck.valid) {
      return { ok: false, error: "Analysis artefact failed validation", details: artefactCheck.errors };
    }
    placeAnalysisArtefact(db, artefact);
    placedArtefact = artefact;
  }

  const parameterSet = slimParameterSet(
    {
      ...parameterSetFromCalibrationResponse(job.response, {
        parameterSetId,
        calibrationKind: job.kind,
        calibrationJobId: job.id,
        calibratedBy: extras.calibratedBy || job.requestedBy || "r-backend",
        calibrationMethod: "r-job",
      }),
      ...sessionProvenanceFromJob(job),
    },
    {
      calibrationJobId: job.id,
      analysisArtefactId,
    }
  ).parameterSet;

  sm.parameterSets = sm.parameterSets || [];
  markParameterSetCandidate(parameterSet);
  sm.parameterSets.push(parameterSet);
  // A candidate is stored and not live. Scoring and selection keep reading
  // activeParameterSetId. A person activates the candidate on
  // POST /evidenceModels/:id/activate-parameter-set, which applies the TU5
  // fit gate. Ingest does not activate, so a poor fit can still be stored
  // and inspected before that decision. In-flight sessions
  // stay on their opening freeze (D68). A confirmed model may have no
  // active set yet; that is the first-calibration window. Ingest checks
  // the new row's provenance only. Decision rules, assembly floors, and
  // fairness stay on the evidence-model transitions that own them.
  const storageErrors = parameterSetStorageErrors(parameterSet, sm);
  if (storageErrors.length > 0) {
    sm.parameterSets = sm.parameterSets.filter((p) => p.parameterSetId !== parameterSetId);
    if (placedArtefact) {
      db.analysisArtefacts = (db.analysisArtefacts || []).filter((row) => row?.id !== placedArtefact.id);
    }
    return {
      ok: false,
      error: "Parameter set failed evidence-model validation",
      details: storageErrors,
    };
  }

  job.ingestedParameterSetId = parameterSetId;
  if (placedArtefact) job.ingestedAnalysisArtefactId = placedArtefact.id;
  if (!validityEvidenceUseExternalStore()) {
    linkTu4FitEvidence(
      db,
      tu4LinkInputFromParameterSet(em.id, parameterSet, {
        author: parameterSet.calibratedBy,
        districtId: placedArtefact?.scope?.districtId ?? null,
        schoolId: placedArtefact?.scope?.schoolId ?? null,
      })
    );
    if (placedArtefact) linkTu4FitEvidence(db, tu4LinkInputFromArtefact(placedArtefact));
  }
  em.updatedAt = new Date().toISOString();
  job.updatedAt = em.updatedAt;

  return {
    ok: true,
    parameterSet,
    analysisArtefact: placedArtefact ? analysisArtefactIngestView(placedArtefact) : undefined,
  };
}

/**
 * External stores already hold the mutated job and any new artefact.
 * The JSON harness leaves both on `db` for saveDB. Call after a
 * successful ingestCalibrationJob, before saveDB.
 */
export async function commitCalibrationIngest(db, { job, artefact, parameterSet, evidenceModelId } = {}) {
  if (artefact) await persistAnalysisArtefact(db, artefact);
  if (job) await saveCalibrationJob(db, job);
  const modelId = evidenceModelId || job?.evidenceModelId || artefact?.scope?.evidenceModelId || null;
  if (parameterSet && modelId) {
    await ensureTu4Link(
      db,
      tu4LinkInputFromParameterSet(modelId, parameterSet, {
        author: parameterSet.calibratedBy,
        districtId: artefact?.scope?.districtId ?? job?.request?.scope?.districtId ?? null,
        schoolId: artefact?.scope?.schoolId ?? job?.request?.scope?.schoolId ?? null,
      })
    );
  }
  if (artefact) await ensureTu4Link(db, tu4LinkInputFromArtefact(artefact));
}
