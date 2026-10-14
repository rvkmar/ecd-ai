// src/utils/templateReadiness.js
//
// D126 artefact 6. Client-side completeness mirror for templates.
// Binding coherence that needs a db snapshot is validated only through
// validateEntity / templateBindingErrors — this mirror covers shape that
// the author UI can check without the full graph.
//
// TEMPLATE_STATUS_MIRROR is a deliberate second copy; mirrorDrift.test.js
// fails if it diverges from TEMPLATE_STATUS_VALUES in schema.js.

export const TEMPLATE_STATUS_MIRROR = ["draft", "confirmed"];

export const TEMPLATE_BINDING_KEYS = Object.freeze([
  "competencyModelId",
  "evidenceModelId",
  "taskModelId",
  "presentationModelId",
]);

/**
 * @param {object} record
 * @param {{ strict?: boolean }} [options]
 * @returns {{ ready: boolean, errors: string[] }}
 */
export function templateReadiness(record = {}, options = {}) {
  const strict = options.strict !== false;
  const errors = [];

  if (!record.name || String(record.name).trim() === "") {
    errors.push("Template name is required.");
  }

  if (record.status && !TEMPLATE_STATUS_MIRROR.includes(record.status)) {
    errors.push(
      `Invalid template status '${record.status}'. Must be draft or confirmed.`
    );
  }

  if (
    record.designPatternId != null &&
    record.designPatternId !== "" &&
    typeof record.designPatternId !== "string"
  ) {
    errors.push("designPatternId must be a string.");
  }

  const requireAll = strict || record.status === "confirmed";
  for (const key of TEMPLATE_BINDING_KEYS) {
    const value = record[key];
    if (value == null || value === "") {
      if (requireAll) errors.push(`${key} is required.`);
    } else if (typeof value !== "string") {
      errors.push(`${key} must be a string.`);
    }
  }

  return { ready: errors.length === 0, errors };
}
