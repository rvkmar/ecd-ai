// Enforces assemblyModels.constraints during activity selection and
// builds the session.assemblyProgress snapshot. The authoring rules live
// in src/utils/assemblyConstraints.js. An assembly model with no active
// constraints does not change selection or stopping.

import { assemblyConstraintsActive } from "../../src/utils/assemblyConstraints.js";
import { evaluateDeclaredTargets } from "./assemblyProgress.js";

function taskById(db, taskId) {
  return (db.tasks || []).find((task) => task && task.id === taskId) || null;
}

function itemForTask(task, db) {
  if (!task?.itemId) return null;
  return (db.items || []).find((item) => item && item.id === task.itemId) || null;
}

function addCode(set, value) {
  if (typeof value === "string" && value.trim() !== "") set.add(value);
}

function contentStandardCodesForTask(task, db) {
  const codes = new Set();
  const item = itemForTask(task, db);
  for (const code of item?.metadata?.contentStandardCodes || []) addCode(codes, code);
  for (const code of task?.contentStandardCodes || []) addCode(codes, code);

  const taskModel = (db.taskModels || []).find((row) => row && row.id === task?.taskModelId);
  for (const evidenceModelId of taskModel?.evidenceModelIds || []) {
    const evidenceModel = (db.evidenceModels || []).find((row) => row && row.id === evidenceModelId);
    const competency = (db.competencies || []).find((row) => row && row.id === evidenceModel?.competencyId);
    const competencyModel = (db.competencyModels || []).find(
      (row) => row && row.id === (competency?.modelId || evidenceModel?.competencyModelId)
    );
    for (const code of competencyModel?.constructFramework?.curricularGoalCodes || []) {
      addCode(codes, code);
    }
  }
  return codes;
}

function tmvValuesForTask(task, db) {
  const assigned = {};
  const taskModel = (db.taskModels || []).find((row) => row && row.id === task?.taskModelId);
  for (const setting of taskModel?.taskModelVariableSettings || []) {
    if (setting?.variation === "fixed" && setting.fixedValue != null && setting.fixedValue !== "") {
      assigned[setting.taskModelVariableId] = String(setting.fixedValue);
    }
  }
  const item = itemForTask(task, db);
  for (const overlay of [item?.tmvAssignment, task?.tmvAssignment]) {
    if (!overlay || typeof overlay !== "object" || Array.isArray(overlay)) continue;
    for (const [key, value] of Object.entries(overlay)) {
      if (value != null && value !== "") assigned[key] = String(value);
    }
  }
  return assigned;
}

function featuresOf(task, db) {
  return {
    task,
    taskModelId: task?.taskModelId || "",
    itemId: task?.itemId || "",
    codes: contentStandardCodesForTask(task, db),
    tmv: tmvValuesForTask(task, db),
  };
}

function deliveredFeatures(session, db) {
  const features = [];
  for (const response of session?.responses || []) {
    const task = taskById(db, response?.taskId);
    if (task) features.push(featuresOf(task, db));
  }
  return features;
}

function countMatching(features, predicate) {
  return features.reduce((sum, feature) => sum + (predicate(feature) ? 1 : 0), 0);
}

function exceedsMax(delivered, row) {
  return Number.isInteger(row?.max) && delivered >= row.max;
}

function belowMin(delivered, row) {
  return Number.isInteger(row?.min) && delivered < row.min;
}

/**
 * Counts and eligibility for one assembly model's constraints.
 * `strategy` is "fixed" or anything else. Fixed only looks forward from
 * currentTaskIndex and does not revisit an earlier task.
 * `candidateIds`, when an array, replaces the roster. The walk starts at
 * the beginning of that list. Null means the session seed, which is the
 * pre-G20 roster path.
 */
export function planConstraintSelection(session, assemblyModel, db, strategy, candidateIds) {
  const constraints = assemblyModel?.constraints;
  if (!assemblyConstraintsActive(constraints)) {
    return { active: false, warnings: [], stop: null, eligibleIds: null, unmetMinimums: false, summary: null };
  }

  const delivered = deliveredFeatures(session, db);
  const answered = new Set((session?.responses || []).map((response) => response?.taskId).filter(Boolean));
  const summary = summarize(constraints, delivered);
  const unmetMinimums = hasUnmetMinimum(summary);

  // Fixed order only looks forward from currentTaskIndex. Every other
  // strategy may use any unanswered roster task. An explicit candidate
  // list is already the adaptive pool, in pool order, and is not sliced.
  const usingPool = Array.isArray(candidateIds);
  const taskIds = usingPool ? candidateIds : (session?.taskIds || []);
  const start = usingPool ? 0 : strategy === "fixed" ? Math.max(0, session?.currentTaskIndex || 0) : 0;
  const candidates = [];
  for (let index = start; index < taskIds.length; index += 1) {
    const taskId = taskIds[index];
    if (answered.has(taskId)) continue;
    const task = taskById(db, taskId);
    if (!task) continue;
    candidates.push({ taskId, feature: featuresOf(task, db) });
  }

  const fillers = candidates.filter((candidate) => fillsDeficit(candidate.feature, summary));
  const legal = candidates.filter((candidate) => !violates(candidate.feature, delivered, constraints));
  const useFillers = unmetMinimums && fillers.some((candidate) => legal.includes(candidate));
  const eligible = (useFillers ? legal.filter((candidate) => fillsDeficit(candidate.feature, summary)) : legal)
    .map((candidate) => candidate.taskId);

  const warnings = [];
  if (unmetMinimums && !useFillers && candidates.length > 0) {
    warnings.push(
      `Assembly Model '${assemblyModel.id}' still has an open minimum, but no remaining task can fill it.`
    );
  }

  let stop = null;
  if (candidates.length > 0 && eligible.length === 0) {
    stop = {
      rule: "constraints",
      assemblyModelId: assemblyModel.id,
      reason: `No remaining task satisfies Assembly Model '${assemblyModel.id}' content constraints.`,
      constraints: summary,
    };
  }

  return {
    active: true,
    warnings,
    stop,
    eligibleIds: eligible,
    unmetMinimums,
    fillerUnanswered: candidates.some((candidate) => fillsDeficit(candidate.feature, summary) && !violates(candidate.feature, delivered, constraints)),
    summary,
  };
}

function summarize(constraints, delivered) {
  const summary = {};
  if (Array.isArray(constraints.taskModelCounts) && constraints.taskModelCounts.length) {
    summary.taskModelCounts = constraints.taskModelCounts.map((row) => ({
      taskModelId: row.taskModelId,
      delivered: countMatching(delivered, (feature) => feature.taskModelId === row.taskModelId),
      ...(row.min != null ? { min: row.min } : {}),
      ...(row.max != null ? { max: row.max } : {}),
    }));
  }
  if (Array.isArray(constraints.contentStandardCounts) && constraints.contentStandardCounts.length) {
    summary.contentStandardCounts = constraints.contentStandardCounts.map((row) => ({
      code: row.code,
      delivered: countMatching(delivered, (feature) => feature.codes.has(row.code)),
      ...(row.min != null ? { min: row.min } : {}),
      ...(row.max != null ? { max: row.max } : {}),
    }));
  }
  if (Array.isArray(constraints.taskModelVariableCounts) && constraints.taskModelVariableCounts.length) {
    summary.taskModelVariableCounts = constraints.taskModelVariableCounts.map((row) => ({
      taskModelVariableId: row.taskModelVariableId,
      value: row.value,
      delivered: countMatching(
        delivered,
        (feature) => feature.tmv[row.taskModelVariableId] === row.value
      ),
      ...(row.min != null ? { min: row.min } : {}),
      ...(row.max != null ? { max: row.max } : {}),
    }));
  }
  if (Number.isInteger(constraints.exposure?.maxPerItem)) {
    summary.exposure = { maxPerItem: constraints.exposure.maxPerItem };
  }
  if (Array.isArray(constraints.enemies) && constraints.enemies.length) {
    const deliveredItemIds = new Set(delivered.map((feature) => feature.itemId).filter(Boolean));
    summary.enemies = constraints.enemies.map((row) => ({
      itemIds: row.itemIds || [],
      deliveredItemIds: (row.itemIds || []).filter((id) => deliveredItemIds.has(id)),
    }));
  }
  return summary;
}

function hasUnmetMinimum(summary) {
  const rows = [
    ...(summary.taskModelCounts || []),
    ...(summary.contentStandardCounts || []),
    ...(summary.taskModelVariableCounts || []),
  ];
  return rows.some((row) => belowMin(row.delivered, row));
}

function fillsDeficit(feature, summary) {
  for (const row of summary.taskModelCounts || []) {
    if (belowMin(row.delivered, row) && feature.taskModelId === row.taskModelId) return true;
  }
  for (const row of summary.contentStandardCounts || []) {
    if (belowMin(row.delivered, row) && feature.codes.has(row.code)) return true;
  }
  for (const row of summary.taskModelVariableCounts || []) {
    if (belowMin(row.delivered, row) && feature.tmv[row.taskModelVariableId] === row.value) return true;
  }
  return false;
}

function violates(feature, delivered, constraints) {
  for (const row of constraints.taskModelCounts || []) {
    if (feature.taskModelId !== row.taskModelId) continue;
    const count = countMatching(delivered, (item) => item.taskModelId === row.taskModelId);
    if (exceedsMax(count, row)) return true;
  }
  for (const row of constraints.contentStandardCounts || []) {
    if (!feature.codes.has(row.code)) continue;
    const count = countMatching(delivered, (item) => item.codes.has(row.code));
    if (exceedsMax(count, row)) return true;
  }
  for (const row of constraints.taskModelVariableCounts || []) {
    if (feature.tmv[row.taskModelVariableId] !== row.value) continue;
    const count = countMatching(
      delivered,
      (item) => item.tmv[row.taskModelVariableId] === row.value
    );
    if (exceedsMax(count, row)) return true;
  }
  if (feature.itemId && Number.isInteger(constraints.exposure?.maxPerItem)) {
    const uses = countMatching(delivered, (item) => item.itemId === feature.itemId);
    if (uses >= constraints.exposure.maxPerItem) return true;
  }
  if (feature.itemId && Array.isArray(constraints.enemies)) {
    const deliveredItemIds = new Set(delivered.map((item) => item.itemId).filter(Boolean));
    for (const group of constraints.enemies) {
      const ids = group?.itemIds || [];
      if (!ids.includes(feature.itemId)) continue;
      const otherDelivered = ids.some((id) => id !== feature.itemId && deliveredItemIds.has(id));
      if (otherDelivered) return true;
    }
  }
  return false;
}

export function selectFixedConstrained(session, eligibleIds) {
  const answered = new Set((session?.responses || []).map((response) => response?.taskId).filter(Boolean));
  const ids = Array.isArray(eligibleIds) ? eligibleIds : (session?.taskIds || []);
  for (let index = 0; index < ids.length; index += 1) {
    const taskId = ids[index];
    if (answered.has(taskId)) continue;
    return {
      taskId,
      strategy: "fixed",
      debug: { index, constraints: true },
    };
  }
  return {};
}

export function targetsMetHeldForConstraints(plan) {
  return Boolean(plan?.active && plan.unmetMinimums && plan.fillerUnanswered);
}

export function constraintHoldWarning(assemblyModelId) {
  return `Stopping rule targetsMet is met, but Assembly Model '${assemblyModelId}' still has an open minimum that a remaining task can fill, so the session continues.`;
}

export function maxItemsMinimumWarning(assemblyModelId) {
  return `Stopping rule maxItems reached before Assembly Model '${assemblyModelId}' minimums were met.`;
}

export function persistableAssemblyProgress(session, assemblyModel, db, smvProgress) {
  const declared = evaluateDeclaredTargets(assemblyModel, smvProgress || []);
  const plan = planConstraintSelection(session, assemblyModel, db, "adaptive");
  const snapshot = {
    assemblyModelId: assemblyModel.id,
    updatedAt: new Date().toISOString(),
    delivered: Array.isArray(session?.responses) ? session.responses.length : 0,
    targets: {
      declared: declared.declaredCount,
      scored: declared.scoredCount,
      met: declared.metCount,
    },
  };
  if (plan.summary) snapshot.constraints = plan.summary;
  return snapshot;
}

