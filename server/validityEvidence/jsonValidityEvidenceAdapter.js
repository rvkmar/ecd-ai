// JSON adapter. Rows live on db.validityEvidence in the ECD file.
// The caller saves the file. This module does not touch the disk.

import { validityEvidenceMatchesFilter } from "../../src/utils/validityEvidence.js";

function rowsOf(db) {
  if (!db) return [];
  if (!Array.isArray(db.validityEvidence)) db.validityEvidence = [];
  return db.validityEvidence;
}

export function jsonListValidityEvidence(db, filter = {}) {
  return rowsOf(db).filter((row) => validityEvidenceMatchesFilter(row, filter));
}

export function jsonGetValidityEvidence(db, id) {
  if (id == null) return null;
  return rowsOf(db).find((row) => row && row.id === id) || null;
}

export function jsonInsertValidityEvidence(db, record) {
  const rows = rowsOf(db);
  if (rows.some((row) => row && row.id === record.id)) {
    throw new Error(`Validity evidence '${record.id}' already exists.`);
  }
  if (
    record.analysisArtefactId &&
    rows.some((row) => row && row.analysisArtefactId === record.analysisArtefactId)
  ) {
    throw new Error(
      `Analysis artefact '${record.analysisArtefactId}' is already linked.`
    );
  }
  rows.push(record);
  return record;
}

export function jsonReplaceValidityEvidence(db, record) {
  const rows = rowsOf(db);
  const idx = rows.findIndex((row) => row && row.id === record.id);
  if (idx === -1) {
    const err = new Error("Validity evidence not found");
    err.status = 404;
    throw err;
  }
  if (
    record.analysisArtefactId &&
    rows.some(
      (row) => row && row.id !== record.id && row.analysisArtefactId === record.analysisArtefactId
    )
  ) {
    throw new Error(
      `Analysis artefact '${record.analysisArtefactId}' is already linked.`
    );
  }
  rows[idx] = record;
  return record;
}

export function jsonDeleteValidityEvidence(db, id) {
  const rows = rowsOf(db);
  const idx = rows.findIndex((row) => row && row.id === id);
  if (idx === -1) return null;
  const [removed] = rows.splice(idx, 1);
  return removed;
}
