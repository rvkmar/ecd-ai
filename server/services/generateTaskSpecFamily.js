// server/services/generateTaskSpecFamily.js
//
// D152. First production caller of insertGeneratedTaskSpec. Loops the
// D120 projector from the bound Task Model's settings. Authored POST
// /api/taskSpecs stays 405. Regeneration of an existing family is D153.

import { insertGeneratedTaskSpec } from "./insertGeneratedTaskSpec.js";
import {
  projectTaskSpecFamily,
  projectTaskSpecFamilySize,
  TASK_SPEC_FAMILY_MAX,
} from "../../src/utils/taskModelVariableFamily.js";

export function generateTaskSpecFamily(db, templateId, meta = {}) {
  const template = (db.templates || []).find((row) => row && row.id === templateId);
  if (!template) {
    return { ok: false, status: 404, error: "Template not found" };
  }
  if (template.status !== "confirmed") {
    return {
      ok: false,
      status: 400,
      error: "Confirm the template before generating task specs.",
    };
  }
  if (!template.taskModelId) {
    return { ok: false, status: 400, error: "Template has no bound Task Model." };
  }

  const existing = (db.taskSpecs || []).filter(
    (spec) => spec && spec.templateId === templateId
  );
  if (existing.length) {
    return {
      ok: false,
      status: 409,
      error: "This template already has generated task specs.",
      citingIds: existing.map((spec) => spec.id),
    };
  }

  const taskModel = (db.taskModels || []).find(
    (row) => row && row.id === template.taskModelId
  );
  if (!taskModel) {
    return {
      ok: false,
      status: 400,
      error: `Task Model '${template.taskModelId}' was not found.`,
    };
  }

  const settings = taskModel.taskModelVariableSettings || [];
  const variables = db.taskModelVariables || [];
  const size = projectTaskSpecFamilySize(settings, variables);

  if (size === 0) {
    return {
      ok: false,
      status: 400,
      error: "Task Model variable settings cannot generate a family.",
    };
  }
  if (size > TASK_SPEC_FAMILY_MAX) {
    return {
      ok: false,
      status: 400,
      error: `Family size ${size} exceeds ${TASK_SPEC_FAMILY_MAX}.`,
      projectedSize: size,
    };
  }

  const family = projectTaskSpecFamily(settings, variables, {
    max: TASK_SPEC_FAMILY_MAX,
  });
  if (family.length !== size) {
    return {
      ok: false,
      status: 500,
      error: "Projected family size does not match generated assignments.",
    };
  }

  const start = (db.taskSpecs || []).length;
  const specs = [];
  for (const tmvAssignment of family) {
    const result = insertGeneratedTaskSpec(
      db,
      { templateId, tmvAssignment },
      meta
    );
    if (!result.ok) {
      db.taskSpecs = (db.taskSpecs || []).slice(0, start);
      return {
        ok: false,
        status: 400,
        error: result.error,
        details: result.details,
      };
    }
    specs.push(result.record);
  }

  return { ok: true, specs, count: specs.length };
}
