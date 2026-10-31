// Link TU4 model-criticism fit to one internal-structure validity
// evidence row. One row per analysis artefact. A calibration job or a
// parameter set that cites that artefact updates the same row. A second
// call with the same artefact, job, or parameter set does not insert.

import { randomBytes } from "crypto";
import { getTenancyContext } from "../utils/tenancyContext.js";
import { rowVisible } from "../utils/tenancyScope.js";
import {
  TU4_FIT_SOURCE,
  hasTu4Fit,
  hasTu4Sidecar,
  summariseTu4Fit,
} from "../../src/utils/validityEvidence.js";

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function newValidityEvidenceId() {
  return `ve${randomBytes(8).toString("hex")}`;
}

function present(input) {
  if (!input) return false;
  if (hasTu4Fit(input.fitStatistics)) return true;
  if (hasTu4Sidecar(input)) return true;
  return false;
}

export function tu4LinkInputFromParameterSet(evidenceModelId, parameterSet, extra = {}) {
  if (!evidenceModelId || !parameterSet || !hasTu4Fit(parameterSet.fitStatistics)) return null;
  return {
    evidenceModelId,
    analysisArtefactId: parameterSet.analysisArtefactId || null,
    calibrationJobId: parameterSet.calibrationJobId || null,
    parameterSetId: parameterSet.parameterSetId || null,
    fitStatistics: parameterSet.fitStatistics,
    author: extra.author || parameterSet.calibratedBy || "system",
    districtId: extra.districtId ?? null,
    schoolId: extra.schoolId ?? null,
    computedAt: parameterSet.calibratedAt || null,
  };
}

export function tu4LinkInputFromArtefact(artefact) {
  if (!artefact?.id) return null;
  const fit = artefact.payload?.fitStatistics;
  const sidecar = hasTu4Sidecar(artefact.payload);
  if (!hasTu4Fit(fit) && !sidecar) return null;
  const evidenceModelId = artefact.scope?.evidenceModelId;
  if (!evidenceModelId) return null;
  return {
    evidenceModelId,
    analysisArtefactId: artefact.id,
    calibrationJobId: artefact.jobId || null,
    parameterSetId: artefact.scope?.parameterSetId || null,
    fitStatistics: isObject(fit) ? fit : null,
    personFitRows: artefact.payload?.personFitRows,
    q3Matrix: artefact.payload?.q3Matrix,
    author: artefact.payload?.calibratedBy || "system",
    districtId: artefact.scope?.districtId ?? null,
    schoolId: artefact.scope?.schoolId ?? null,
    computedAt: artefact.computedAt || artefact.createdAt || null,
  };
}

export function tu4LinkInputFromJob(job) {
  if (!job?.id || job.status !== "succeeded" || !job.evidenceModelId) return null;
  const response = job.response;
  if (!response) return null;
  const fit = response.fitStatistics;
  if (!hasTu4Fit(fit) && !hasTu4Sidecar(response)) return null;
  return {
    evidenceModelId: job.evidenceModelId,
    analysisArtefactId: null,
    calibrationJobId: job.id,
    parameterSetId: null,
    fitStatistics: isObject(fit) ? fit : null,
    personFitRows: response.personFitRows,
    q3Matrix: response.q3Matrix,
    author: job.requestedBy || "system",
    districtId: job.districtId || job.scope?.districtId || job.request?.scope?.districtId || null,
    schoolId: job.schoolId || job.scope?.schoolId || job.request?.scope?.schoolId || null,
    computedAt: response.calibratedAt || null,
  };
}

function sameLink(row, input) {
  if (!row || row.type !== "internal-structure") return false;
  if (input.analysisArtefactId && row.analysisArtefactId === input.analysisArtefactId) return true;
  if (input.calibrationJobId && row.calibrationJobId === input.calibrationJobId) return true;
  if (
    input.parameterSetId &&
    row.parameterSetId === input.parameterSetId &&
    row.evidenceModelId === input.evidenceModelId
  ) {
    return true;
  }
  return false;
}

function mergeById(primary, secondary) {
  const map = new Map();
  for (const row of primary || []) {
    if (row?.id) map.set(row.id, row);
  }
  for (const row of secondary || []) {
    if (row?.id) map.set(row.id, row);
  }
  return [...map.values()];
}

function buildRecord(input, now) {
  const summary = summariseTu4Fit(input);
  const districtId = typeof input.districtId === "string" && input.districtId ? input.districtId : null;
  const schoolId = typeof input.schoolId === "string" && input.schoolId ? input.schoolId : null;
  return {
    id: input.id || newValidityEvidenceId(),
    evidenceModelId: input.evidenceModelId,
    type: "internal-structure",
    summary,
    body: summary,
    source: TU4_FIT_SOURCE,
    author: typeof input.author === "string" && input.author.trim() ? input.author.trim() : "system",
    warrantIds: [],
    alternativeExplanationIndexes: [],
    analysisArtefactId: input.analysisArtefactId || null,
    calibrationJobId: input.calibrationJobId || null,
    parameterSetId: input.parameterSetId || null,
    districtId,
    schoolId,
    createdAt: input.computedAt || now,
    updatedAt: now,
  };
}

/**
 * Insert or reuse one internal-structure row on `db.validityEvidence`.
 * `knownRows` may include rows the caller cannot see (another tenant,
 * or the external store). Those rows block a second insert and are not
 * copied onto `db`.
 */
export function linkTu4FitEvidence(db, input, knownRows = null) {
  if (!db || !present(input) || !input.evidenceModelId) {
    return { created: false, updated: false, record: null };
  }
  if (!Array.isArray(db.validityEvidence)) db.validityEvidence = [];
  const pool = mergeById(knownRows, db.validityEvidence);
  const existing = pool.find((row) => sameLink(row, input)) || null;
  if (existing) {
    const local = db.validityEvidence.find((row) => row && row.id === existing.id) || null;
    if (local && input.analysisArtefactId && !local.analysisArtefactId) {
      local.analysisArtefactId = input.analysisArtefactId;
      if (input.calibrationJobId && !local.calibrationJobId) local.calibrationJobId = input.calibrationJobId;
      if (input.parameterSetId && !local.parameterSetId) local.parameterSetId = input.parameterSetId;
      local.updatedAt = new Date().toISOString();
      return { created: false, updated: true, record: local };
    }
    return { created: false, updated: false, record: existing };
  }

  const now = new Date().toISOString();
  const record = buildRecord(input, now);
  const ctx = getTenancyContext();
  if (ctx && !ctx.unscoped && ctx.role !== "admin") {
    if (!rowVisible("validityEvidence", record, ctx, db)) {
      return { created: false, updated: false, record: null, skipped: "tenancy" };
    }
  }
  db.validityEvidence.push(record);
  return { created: true, updated: false, record };
}
