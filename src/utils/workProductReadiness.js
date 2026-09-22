// src/utils/workProductReadiness.js
//
// D121 artefact 6. Client-side completeness mirror for Work Products.
// Independent of validateEntity — the type list below is a second copy
// on purpose. mirrorDrift.test.js fails if it diverges from
// ecdVocabulary.js WORK_PRODUCT_TYPE_VALUES / OBSERVABLE_RESPONSE_MODE_VALUES.

export const WORK_PRODUCT_TYPE_MIRROR = [
  "selected_response",
  "constructed_response",
  "numeric_response",
  "performance",
  "artifact",
  "behavior",
  "process_trace",
];

/**
 * @param {object} record
 * @param {{ strict?: boolean }} [options]
 * @returns {{ ready: boolean, errors: string[] }}
 */
export function workProductReadiness(record = {}, options = {}) {
  const strict = options.strict !== false;
  const errors = [];

  if (!record.name || String(record.name).trim() === "") {
    errors.push("Work Product name is required.");
  }

  if (strict && !record.type) {
    errors.push("Work Product type is required.");
  } else if (record.type && !WORK_PRODUCT_TYPE_MIRROR.includes(record.type)) {
    errors.push(
      `Invalid Work Product type '${record.type}'. Must be one of: ${WORK_PRODUCT_TYPE_MIRROR.join(", ")}.`
    );
  }

  return { ready: errors.length === 0, errors };
}
