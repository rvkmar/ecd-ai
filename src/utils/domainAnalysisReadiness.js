// src/utils/domainAnalysisReadiness.js
//
// D141 artefact 6. Client-side completeness mirror for a Domain Analysis.
// Section rules are domainAnalysisSectionErrors, the same function
// validateEntity calls. The status list and the seven field names below
// are a second copy on purpose. mirrorDrift fails if they diverge.

import {
  DOMAIN_ANALYSIS_ENTITIES,
  domainAnalysisSectionErrors,
} from "./schema.js";

export const DOMAIN_ANALYSIS_STATUS_MIRROR = ["draft", "confirmed"];

export const DOMAIN_ANALYSIS_ENTITY_MIRROR = Object.freeze([
  "valuedWork",
  "taskFeatures",
  "representationalForms",
  "performanceOutcomes",
  "valuedKnowledge",
  "knowledgeStructure",
  "knowledgeTaskRelationships",
]);

/**
 * @param {object} record
 * @param {{ strict?: boolean }} [options]
 * @returns {{ ready: boolean, errors: string[] }}
 */
export function domainAnalysisReadiness(record = {}, options = {}) {
  const strict = options.strict !== false;
  const errors = [];

  if (!record.name || String(record.name).trim() === "") {
    errors.push("Domain Analysis name is required.");
  }

  if (record.status && !DOMAIN_ANALYSIS_STATUS_MIRROR.includes(record.status)) {
    errors.push(
      `Invalid Domain Analysis status '${record.status}'. Must be draft or confirmed. A Domain Analysis authorises no student delivery, so operational is not a status.`
    );
  }

  const claimComplete = strict || record.status === "confirmed";
  errors.push(...domainAnalysisSectionErrors(record, { claimComplete }));

  const mirrored = DOMAIN_ANALYSIS_ENTITY_MIRROR;
  const declared = DOMAIN_ANALYSIS_ENTITIES.map((row) => row.field);
  if (mirrored.join() !== declared.join()) {
    errors.push("Domain Analysis sections do not match the schema.");
  }

  return { ready: errors.length === 0, errors };
}
