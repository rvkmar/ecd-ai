// src/utils/taskSpecReadiness.js
//
// D151 artefact 6. A task spec is derived from a template with TMVs
// fixed. It is not drafted. Shape the author UI (D153) can check
// without the graph: templateId + tmvAssignment. Binding existence is
// validateEntity's job when a db snapshot is present.
//
// Template-change policy (ADR 0003b): a write to the source template
// marks existing specs stale. It does not regenerate them.

export function taskSpecErrors(obj = {}, db = null) {
  const errors = [];

  if (obj.templateId == null || String(obj.templateId).trim() === "") {
    errors.push("templateId is required.");
  } else if (typeof obj.templateId !== "string") {
    errors.push("templateId must be a string.");
  } else if (db) {
    const found = (db.templates || []).some((row) => row && row.id === obj.templateId);
    if (!found) {
      errors.push(`templateId '${obj.templateId}' does not match a template.`);
    }
  }

  if (obj.tmvAssignment == null) {
    errors.push("tmvAssignment is required.");
  } else if (!Array.isArray(obj.tmvAssignment)) {
    errors.push("tmvAssignment must be an array.");
  } else {
    obj.tmvAssignment.forEach((entry, i) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        errors.push(`tmvAssignment[${i}] must be an object.`);
        return;
      }
      if (
        entry.taskModelVariableId == null ||
        String(entry.taskModelVariableId).trim() === ""
      ) {
        errors.push(`tmvAssignment[${i}].taskModelVariableId is required.`);
      }
      if (entry.value == null || String(entry.value).trim() === "") {
        errors.push(`tmvAssignment[${i}].value is required.`);
      }
    });
  }

  if (obj.stale != null && typeof obj.stale !== "boolean") {
    errors.push("stale must be a boolean.");
  }

  return errors;
}

/**
 * @param {object} record
 * @returns {{ ready: boolean, errors: string[] }}
 */
export function taskSpecReadiness(record = {}) {
  const errors = taskSpecErrors(record, null);
  return { ready: errors.length === 0, errors };
}

/**
 * Marks every spec generated from this template stale. Does not rewrite
 * tmvAssignment. Returns how many rows flipped.
 */
export function markTaskSpecsStaleForTemplate(db, templateId) {
  if (!db || !templateId) return 0;
  const now = new Date().toISOString();
  let n = 0;
  for (const spec of db.taskSpecs || []) {
    if (spec && spec.templateId === templateId && spec.stale !== true) {
      spec.stale = true;
      spec.updatedAt = now;
      n += 1;
    }
  }
  return n;
}
