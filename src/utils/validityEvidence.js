// TU17. Empirical validity evidence for an evidence model.
// Types follow the validity argument: response processes, internal
// structure, relations to other variables, and consequences.
// TU4 fit summaries are internal-structure evidence.

export const VALIDITY_EVIDENCE_TYPES = Object.freeze([
  "response-process",
  "internal-structure",
  "relations",
  "consequences",
]);

export const VALIDITY_EVIDENCE_TYPE_LABELS = Object.freeze({
  "response-process": "Response process",
  "internal-structure": "Internal structure",
  relations: "Relations to other variables",
  consequences: "Consequences",
});

const TU4_FIT_KEYS = Object.freeze([
  "cdmFit",
  "qValidation",
  "personFit",
  "localDependence",
]);

export const TU4_FIT_SOURCE = "tu4-fit";

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function validityEvidenceMatchesFilter(row, filter = {}) {
  if (!row) return false;
  if (filter.id != null && row.id !== filter.id) return false;
  if (filter.evidenceModelId != null && row.evidenceModelId !== filter.evidenceModelId) {
    return false;
  }
  if (filter.type != null && row.type !== filter.type) return false;
  if (filter.analysisArtefactId != null && row.analysisArtefactId !== filter.analysisArtefactId) {
    return false;
  }
  if (filter.calibrationJobId != null && row.calibrationJobId !== filter.calibrationJobId) {
    return false;
  }
  return true;
}

export function hasTu4Fit(fitStatistics) {
  if (!isObject(fitStatistics)) return false;
  return TU4_FIT_KEYS.some((key) => isObject(fitStatistics[key]));
}

export function hasTu4Sidecar(value) {
  if (!value) return false;
  if (Array.isArray(value.personFitRows) && value.personFitRows.length > 0) return true;
  if (isObject(value.q3Matrix)) return true;
  return false;
}

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function joinBits(bits) {
  return bits.filter(Boolean).join(", ");
}

/**
 * Prose for a TU4 fit summary. Counts only. Person ids and the Q3
 * matrix stay on the job or the analysis artefact.
 */
export function summariseTu4Fit(input = {}) {
  const fit = isObject(input.fitStatistics) ? input.fitStatistics : isObject(input) && hasTu4Fit(input) ? input : null;
  const parts = [];
  const personFit = fit?.personFit;
  if (isObject(personFit)) {
    const nMisfit = num(personFit.nMisfit);
    const nPersons = num(personFit.nPersons);
    const cutoff = num(personFit.cutoff);
    if (personFit.available === false) parts.push("Person fit was not available.");
    else if (nMisfit != null && nPersons != null) {
      const cut = cutoff == null ? -2 : cutoff;
      parts.push(`Person fit: ${nMisfit} of ${nPersons} persons with Zh below ${cut}.`);
    } else parts.push("Person fit summary recorded.");
  }
  const localDependence = fit?.localDependence;
  if (isObject(localDependence)) {
    const maxAbs = num(localDependence.maxAbsQ3);
    const flagged = Array.isArray(localDependence.flaggedPairs)
      ? localDependence.flaggedPairs.length
      : null;
    if (maxAbs != null && flagged != null) {
      const pairWord = flagged === 1 ? "pair" : "pairs";
      parts.push(`Local dependence: max absolute Q3 ${maxAbs}, ${flagged} ${pairWord} flagged.`);
    } else if (maxAbs != null) {
      parts.push(`Local dependence: max absolute Q3 ${maxAbs}.`);
    } else parts.push("Local dependence summary recorded.");
  }
  const cdmFit = fit?.cdmFit;
  if (isObject(cdmFit)) {
    if (cdmFit.available === false) parts.push("CDM absolute fit was not available.");
    else {
      const bits = [];
      if (cdmFit.RMSEA2 != null) bits.push(`RMSEA2 ${cdmFit.RMSEA2}`);
      if (cdmFit.SRMSR != null) bits.push(`SRMSR ${cdmFit.SRMSR}`);
      if (cdmFit.M2 != null) bits.push(`M2 ${cdmFit.M2}`);
      parts.push(bits.length ? `CDM fit: ${joinBits(bits)}.` : "CDM fit summary recorded.");
    }
  }
  const qValidation = fit?.qValidation;
  if (isObject(qValidation)) {
    if (qValidation.available === false) parts.push("Q-matrix validation was not available.");
    else if (num(qValidation.nChanged) != null) {
      const n = qValidation.nChanged;
      parts.push(`Q-matrix validation suggested ${n} change${n === 1 ? "" : "s"}.`);
    } else parts.push("Q-matrix validation summary recorded.");
  }
  if (!parts.length && hasTu4Sidecar(input)) {
    parts.push("Person-fit rows or a Q3 matrix were stored with this fit. Person ids stay on the artefact.");
  }
  return parts.join(" ") || "Internal structure fit recorded.";
}

function evidenceModel(db, id) {
  if (!db || !id) return null;
  return (db.evidenceModels || []).find((row) => row && row.id === id) || null;
}

export function validityEvidenceErrors(obj, db = null) {
  const errors = [];
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    errors.push("Validity evidence must be an object.");
    return errors;
  }
  if (!obj.id || typeof obj.id !== "string") errors.push("id is required.");
  if (!obj.evidenceModelId || typeof obj.evidenceModelId !== "string") {
    errors.push("evidenceModelId is required.");
  }
  if (!obj.type || typeof obj.type !== "string") errors.push("type is required.");
  else if (!VALIDITY_EVIDENCE_TYPES.includes(obj.type)) {
    errors.push(`type must be one of: ${VALIDITY_EVIDENCE_TYPES.join(", ")}.`);
  }
  if (typeof obj.summary !== "string" || !obj.summary.trim()) {
    errors.push("summary is required.");
  }
  if (obj.body != null && typeof obj.body !== "string") errors.push("body should be string.");
  if (typeof obj.source !== "string" || !obj.source.trim()) errors.push("source is required.");
  if (typeof obj.author !== "string" || !obj.author.trim()) errors.push("author is required.");
  for (const key of ["createdAt", "updatedAt"]) {
    if (obj[key] == null || obj[key] === "") errors.push(`${key} is required.`);
    else if (Number.isNaN(new Date(obj[key]).getTime())) errors.push(`${key} should be date.`);
  }
  for (const key of ["analysisArtefactId", "calibrationJobId", "parameterSetId", "districtId", "schoolId"]) {
    if (obj[key] != null && typeof obj[key] !== "string") errors.push(`${key} should be string.`);
  }

  if (obj.warrantIds != null && !Array.isArray(obj.warrantIds)) {
    errors.push("warrantIds should be array.");
  }
  if (obj.alternativeExplanationIndexes != null && !Array.isArray(obj.alternativeExplanationIndexes)) {
    errors.push("alternativeExplanationIndexes should be array.");
  }

  const warrantIds = Array.isArray(obj.warrantIds) ? obj.warrantIds : [];
  const seenWarrants = new Set();
  for (const id of warrantIds) {
    if (typeof id !== "string" || !id.trim()) {
      errors.push("warrantIds entries must be non-empty strings.");
      continue;
    }
    if (seenWarrants.has(id)) errors.push(`warrantIds duplicates '${id}'.`);
    seenWarrants.add(id);
  }

  const indexes = Array.isArray(obj.alternativeExplanationIndexes)
    ? obj.alternativeExplanationIndexes
    : [];
  const seenIndexes = new Set();
  for (const index of indexes) {
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
      errors.push("alternativeExplanationIndexes entries must be non-negative integers.");
      continue;
    }
    if (seenIndexes.has(index)) errors.push(`alternativeExplanationIndexes duplicates ${index}.`);
    seenIndexes.add(index);
  }

  const model = evidenceModel(db, obj.evidenceModelId);
  if (db && obj.evidenceModelId && !model) {
    errors.push(`Evidence model '${obj.evidenceModelId}' not found.`);
  }
  if (model) {
    const knownWarrants = new Set((model.warrants || []).map((row) => row?.id).filter(Boolean));
    for (const id of warrantIds) {
      if (typeof id === "string" && id && !knownWarrants.has(id)) {
        errors.push(`Warrant '${id}' is not on evidence model '${model.id}'.`);
      }
    }
    const explanations = Array.isArray(model.alternativeExplanations) ? model.alternativeExplanations : [];
    for (const index of indexes) {
      if (typeof index === "number" && Number.isInteger(index) && index >= 0 && !explanations[index]) {
        errors.push(
          `Alternative explanation index ${index} is not on evidence model '${model.id}'.`
        );
      }
    }
  }

  if (obj.analysisArtefactId && Array.isArray(db?.validityEvidence)) {
    const clash = db.validityEvidence.find(
      (row) => row && row.id !== obj.id && row.analysisArtefactId === obj.analysisArtefactId
    );
    if (clash) {
      errors.push(
        `Analysis artefact '${obj.analysisArtefactId}' is already linked by '${clash.id}'.`
      );
    }
  }

  return errors;
}
