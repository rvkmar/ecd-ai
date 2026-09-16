// src/utils/studentModelBulkNormalize.js
// ------------------------------------------------------------
// Shared Student Model bulk-upload normalization.
// Accepts the shapes authors actually produce (array, wrapper,
// Step 9 specification export, single model object) and returns
// a flat CompetencyModel[] suitable for POST /models/bulk.
// ------------------------------------------------------------

function looksLikeStudentModelRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const has = (k) => Object.prototype.hasOwnProperty.call(row, k);
  // Exclude other ECD entity shapes that also appear as JSON arrays.
  if (has("claimStatement") || has("warrants") || has("observables") || has("evidenceRules"))
    return false;
  if (has("evidenceModelIds") || has("primaryEvidenceModelId") || has("expectedObservations"))
    return false;
  if (has("taskModelId") || has("observationId")) return false;
  if (has("password") && has("username") && has("role")) return false;

  return (
    has("measurementIntent") ||
    has("competencies") ||
    has("constructFramework") ||
    has("smVariables") ||
    has("psychologicalPerspective") ||
    (has("name") && has("description") && !has("type") && !has("config"))
  );
}

/**
 * @param {unknown} parsed
 * @param {{ assumeArrayIsStudentModel?: boolean }} [options]
 *   assumeArrayIsStudentModel — true for the Student Model card / server
 *   bulk endpoint (caller already chose the SM route). False for the
 *   unified picker, where a bare array might be evidence/task/items.
 * @returns {object[] | null} null when the shape is not a Student Model upload
 */
export function normalizeStudentModelBulkRows(
  parsed,
  { assumeArrayIsStudentModel = false } = {}
) {
  if (Array.isArray(parsed)) {
    if (!parsed.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
      return null;
    }
    if (assumeArrayIsStudentModel) return parsed;
    if (parsed.length === 0) return null;
    return parsed.every(looksLikeStudentModelRow) ? parsed : null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  // { "competencyModels": [ ... ] } or { "studentModels": [ ... ] }
  for (const key of ["competencyModels", "studentModels", "models"]) {
    if (Array.isArray(parsed[key])) {
      return parsed[key];
    }
  }

  // Step 9 / buildStudentModelSpecification download:
  // { specificationVersion, model, competencies, smVariables, ... }
  if (parsed.model && typeof parsed.model === "object" && Array.isArray(parsed.competencies)) {
    const m = parsed.model;
    return [
      {
        name: m.name,
        description: m.description,
        measurementIntent: m.measurementIntent,
        psychologicalPerspective: m.psychologicalPerspective,
        constructFramework: m.constructFramework,
        smVariables: Array.isArray(parsed.smVariables)
          ? parsed.smVariables
          : Array.isArray(m.smVariables)
            ? m.smVariables
            : [],
        competencies: parsed.competencies,
      },
    ];
  }

  // Single model object (with or without nested competencies)
  if (looksLikeStudentModelRow(parsed) && parsed.measurementIntent) {
    return [parsed];
  }

  // Single-key wrapper whose value is the array (generic tolerance),
  // but only when the key names a Student Model collection.
  const entries = Object.entries(parsed);
  if (entries.length === 1 && Array.isArray(entries[0][1])) {
    const key = String(entries[0][0]).toLowerCase();
    if (
      key.includes("competenc") ||
      key.includes("studentmodel") ||
      key === "models"
    ) {
      return entries[0][1];
    }
  }

  return null;
}

/**
 * Strip lifecycle / identity fields so a downloaded confirmed model
 * re-imports as a fresh draft row.
 */
export function stripStudentModelImportIdentity(row = {}) {
  const {
    id: _id,
    status: _status,
    locked: _locked,
    versionNumber: _versionNumber,
    parentModelId: _parentModelId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    reviewMeta: _reviewMeta,
    confirmMeta: _confirmMeta,
    specification: _specification,
    ...rest
  } = row || {};
  return rest;
}
