// src/utils/designPatternReadiness.js
//
// D131 artefact 6. Client-side completeness mirror for design patterns.
// Confirm-time checks that need the stored record go through
// validateEntity. This mirror covers the shape an author screen can
// check without a database snapshot.
//
// DESIGN_PATTERN_STATUS_MIRROR is a deliberate second copy; mirrorDrift
// fails if it diverges from DESIGN_PATTERN_STATUS_VALUES in schema.js.
//
// A confirmed pattern may be referenced by later seeding. It authorises
// no student delivery (ADR 0009).
//
// Menu id shape is the same function validateEntity uses, without a db
// snapshot — missing ids fail here; unknown ids fail on the server.

import { designPatternMenuErrors, designPatternRelationErrors } from "./schema.js";

export const DESIGN_PATTERN_STATUS_MIRROR = ["draft", "confirmed"];

export const DESIGN_PATTERN_MENU_MIRROR = Object.freeze([
  "focalKsas",
  "additionalKsas",
  "potentialObservations",
  "potentialWorkProducts",
  "potentialRubrics",
  "characteristicFeatures",
  "variableFeatures",
]);

/**
 * @param {object} record
 * @param {{ strict?: boolean }} [options]
 * @returns {{ ready: boolean, errors: string[] }}
 */
export function designPatternReadiness(record = {}, options = {}) {
  const strict = options.strict !== false;
  const errors = [];

  if (!record.name || String(record.name).trim() === "") {
    errors.push("Design pattern name is required.");
  }

  if (record.status && !DESIGN_PATTERN_STATUS_MIRROR.includes(record.status)) {
    errors.push(
      `Invalid design pattern status '${record.status}'. Must be draft or confirmed.`
    );
  }

  const claimComplete = strict || record.status === "confirmed";
  if (claimComplete) {
    if (!record.summary || String(record.summary).trim() === "") {
      errors.push("Design pattern summary is required to confirm.");
    }
    if (!record.rationale || String(record.rationale).trim() === "") {
      errors.push("Design pattern rationale is required. An empty rationale is not a pattern.");
    }
  }

  for (const key of DESIGN_PATTERN_MENU_MIRROR) {
    if (record[key] == null) continue;
    if (!Array.isArray(record[key])) {
      errors.push(`${key} must be an array.`);
    }
  }

  errors.push(...designPatternMenuErrors(record, null, { claimComplete }));
  errors.push(...designPatternRelationErrors(record, null));

  return { ready: errors.length === 0, errors };
}
