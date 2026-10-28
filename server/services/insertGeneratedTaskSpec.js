// server/services/insertGeneratedTaskSpec.js
//
// D151. The only legal insert for taskSpecs. Authored POST is refused
// on the route. D152 will loop this for a family; this unit stamps one
// row with templateId + tmvAssignment.

import { validateEntity } from "../../src/utils/schema.js";

let idCounter = 0;
const genId = () => `tspec${Date.now()}${(idCounter++ % 1000).toString().padStart(3, "0")}`;

export function insertGeneratedTaskSpec(db, payload = {}, meta = {}) {
  const now = new Date().toISOString();
  const record = {
    id: payload.id || genId(),
    templateId: payload.templateId,
    tmvAssignment: payload.tmvAssignment,
    stale: false,
    generatedAt: now,
    districtId: meta.districtId ?? null,
    schoolId: meta.schoolId ?? null,
    createdBy: meta.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const { valid, errors } = validateEntity("taskSpecs", record, db);
  if (!valid) {
    return {
      ok: false,
      error: errors[0] || "Task spec validation failed",
      details: errors,
    };
  }

  db.taskSpecs = db.taskSpecs || [];
  db.taskSpecs.push(record);
  return { ok: true, record };
}
