// src/utils/rubricReadiness.js
//
// D122 artefact 6. Client-side completeness mirror for rubrics.

export const RUBRIC_STATUS_MIRROR = ["draft", "confirmed"];

/**
 * @param {object} record
 * @param {{ strict?: boolean }} [options]
 * @returns {{ ready: boolean, errors: string[] }}
 */
export function rubricReadiness(record = {}, options = {}) {
  const strict = options.strict !== false;
  const errors = [];

  if (!record.name || String(record.name).trim() === "") {
    errors.push("Rubric name is required.");
  }

  if (record.status && !RUBRIC_STATUS_MIRROR.includes(record.status)) {
    errors.push(
      `Invalid rubric status '${record.status}'. Must be draft or confirmed.`
    );
  }

  const dims = record.dimensions;
  if (dims == null) {
    if (strict) errors.push("Rubric requires at least one dimension.");
  } else if (!Array.isArray(dims)) {
    errors.push("dimensions should be array");
  } else if (strict && dims.length === 0) {
    errors.push("Rubric requires at least one dimension.");
  } else {
    dims.forEach((dim, i) => {
      const tag = `dimensions[${i}]`;
      if (!dim?.id || String(dim.id).trim() === "") {
        errors.push(`${tag}.id is required.`);
      }
      if (!Array.isArray(dim?.levels) || dim.levels.length === 0) {
        if (strict) errors.push(`${tag} requires at least one level.`);
      }
    });
  }

  if (strict && record.status === "confirmed") {
    let exemplars = 0;
    for (const dim of dims || []) {
      if (dim?.exemplars && typeof dim.exemplars === "object") {
        for (const text of Object.values(dim.exemplars)) {
          if (text != null && String(text).trim() !== "") exemplars += 1;
        }
      }
      for (const entry of dim?.levels || []) {
        if (entry && typeof entry === "object" && String(entry.exemplar || "").trim()) {
          exemplars += 1;
        }
      }
    }
    if (exemplars < 1) {
      errors.push("A confirmed rubric requires at least one level exemplar.");
    }
  }

  return { ready: errors.length === 0, errors };
}
