// server/services/generateTaskSpecFamily.js
//
// D152 / D153. planTaskSpecFamily is the shared projector: preview and
// generate must return the same assignment array. Generate inserts
// those assignments; replace deletes the template's specs first;
// retire deletes them without inserting. Authored POST /api/taskSpecs
// stays 405.

import { insertGeneratedTaskSpec } from "./insertGeneratedTaskSpec.js";
import {
  projectTaskSpecFamily,
  projectTaskSpecFamilySize,
  TASK_SPEC_FAMILY_MAX,
} from "../../src/utils/taskModelVariableFamily.js";

export function planTaskSpecFamily(db, templateId) {
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

  const assignments = projectTaskSpecFamily(settings, variables, {
    max: TASK_SPEC_FAMILY_MAX,
  });
  if (assignments.length !== size) {
    return {
      ok: false,
      status: 500,
      error: "Projected family size does not match generated assignments.",
    };
  }

  return { ok: true, template, assignments, count: assignments.length };
}

function specsForTemplate(db, templateId) {
  return (db.taskSpecs || []).filter((spec) => spec && spec.templateId === templateId);
}

export function retireTaskSpecFamily(db, templateId) {
  const template = (db.templates || []).find((row) => row && row.id === templateId);
  if (!template) {
    return { ok: false, status: 404, error: "Template not found" };
  }
  const existing = specsForTemplate(db, templateId);
  db.taskSpecs = (db.taskSpecs || []).filter(
    (spec) => !spec || spec.templateId !== templateId
  );
  return { ok: true, deleted: existing.length };
}

export function generateTaskSpecFamily(db, templateId, meta = {}, options = {}) {
  const plan = planTaskSpecFamily(db, templateId);
  if (!plan.ok) return plan;

  const existing = specsForTemplate(db, templateId);
  if (existing.length && !options.replace) {
    return {
      ok: false,
      status: 409,
      error: "This template already has generated task specs.",
      citingIds: existing.map((spec) => spec.id),
    };
  }

  const snapshot = (db.taskSpecs || []).slice();
  if (existing.length && options.replace) {
    db.taskSpecs = snapshot.filter((spec) => !spec || spec.templateId !== templateId);
  }

  const specs = [];
  for (const tmvAssignment of plan.assignments) {
    const result = insertGeneratedTaskSpec(
      db,
      { templateId, tmvAssignment },
      meta
    );
    if (!result.ok) {
      db.taskSpecs = snapshot;
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
