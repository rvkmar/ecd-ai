// D81 — provenance contract for every W17 psychometric figure.
// A figure whose provenance cannot be stated is not defensible. Charts
// compose through PsychometricFigure, which refuses incomplete stamps.

/**
 * @typedef {object} PsychometricProvenance
 * @property {string} jobId
 * @property {string} packageVersion
 * @property {number} sampleSize
 * @property {string|Date} computedAt
 * @property {string} [parameterSetId]
 * @property {string} [statisticalModelId]
 * @property {string} [evidenceModelId]
 * @property {string} [derivedFrom]
 */

const REQUIRED_STRINGS = ["jobId", "packageVersion"];

/**
 * Analysis artefacts carry job/package/sample/computedAt at the top level.
 * The "derived from" pointer is parameterSetId when present, else the
 * statistical model / evidence-model scope fields already on the record.
 */
export function provenanceFromArtefact(artefact) {
  if (!artefact || typeof artefact !== "object") return null;
  const payload = artefact.payload || {};
  const scope = artefact.scope || {};
  return {
    jobId: artefact.jobId,
    packageVersion: artefact.packageVersion,
    sampleSize: artefact.sampleSize,
    computedAt: artefact.computedAt,
    parameterSetId: payload.parameterSetId || undefined,
    statisticalModelId: payload.statisticalModelId || undefined,
    evidenceModelId: scope.evidenceModelId || undefined,
    derivedFrom:
      payload.parameterSetId ||
      payload.statisticalModelId ||
      scope.evidenceModelId ||
      undefined,
  };
}

/** Human-readable source label for the stamp footer. */
export function derivedFromLabel(provenance) {
  if (!provenance) return null;
  if (provenance.parameterSetId) {
    return `Parameter set ${provenance.parameterSetId}`;
  }
  if (provenance.statisticalModelId) {
    return `Statistical model ${provenance.statisticalModelId}`;
  }
  if (provenance.evidenceModelId) {
    return `Evidence model ${provenance.evidenceModelId}`;
  }
  if (provenance.derivedFrom) {
    return String(provenance.derivedFrom);
  }
  return null;
}

/**
 * Throws when provenance is incomplete. Used by PsychometricFigure so a
 * chart without a stamp cannot render — enforced in tests, not by convention.
 */
export function assertPsychometricProvenance(provenance) {
  if (!provenance || typeof provenance !== "object") {
    throw new Error(
      "PsychometricFigure requires provenance (job id, package version, sample size, computed-at, and source)."
    );
  }
  for (const key of REQUIRED_STRINGS) {
    const value = provenance[key];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`PsychometricFigure provenance.${key} is required.`);
    }
  }
  if (
    typeof provenance.sampleSize !== "number" ||
    !Number.isFinite(provenance.sampleSize) ||
    provenance.sampleSize < 0
  ) {
    throw new Error(
      "PsychometricFigure provenance.sampleSize must be a non-negative number."
    );
  }
  if (provenance.computedAt == null || provenance.computedAt === "") {
    throw new Error("PsychometricFigure provenance.computedAt is required.");
  }
  if (!derivedFromLabel(provenance)) {
    throw new Error(
      "PsychometricFigure provenance must name what the figure was derived from (parameterSetId, statisticalModelId, evidenceModelId, or derivedFrom)."
    );
  }
  return true;
}
