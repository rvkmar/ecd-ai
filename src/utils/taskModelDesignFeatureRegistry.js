// src/utils/taskModelDesignFeatureRegistry.js
//
// D119 / W24. Task Model design-feature enums (Bloom, reasoning,
// presentation mode, response format, stimulus policy) are authored and
// validated through the Task Model Variable registry contract:
//   valueSet key → TMV_VALUE_SET_SOURCES in ecdVocabulary.js
//
// Stored field values remain vocabulary strings (re-pointing, not a new
// declaration). When a Task Model binds a library variable with a matching
// valueSet, options / constraints follow that variable's settings
// (fixed / varying / allowedValues). Unbound fields use the full
// vocabulary list — every level that validated before D119 still validates.

import { TMV_VALUE_SET_SOURCES } from "./ecdVocabulary.js";
import { discreteLevelsForSetting } from "./taskModelVariableFamily.js";

/** valueSet keys the Task Model layer may re-point at the TMV registry. */
export const TASK_MODEL_DESIGN_FEATURE_VALUE_SETS = Object.freeze([
  "bloomLevel",
  "reasoningType",
  "presentationMode",
  "responseFormat",
  "stimulusPolicy",
]);

function vocabularyEntries(valueSetKey) {
  const source = TMV_VALUE_SET_SOURCES[valueSetKey];
  return Array.isArray(source) ? source : [];
}

export function vocabularyValuesForDesignFeature(valueSetKey) {
  return vocabularyEntries(valueSetKey).map((e) => e.value);
}

function settingFor(settings, variableId) {
  return (
    (settings || []).find((s) => s.taskModelVariableId === variableId) || {
      taskModelVariableId: variableId,
    }
  );
}

/**
 * Bound library variable whose valueSet matches, if any.
 */
export function boundVariableForDesignFeature(valueSetKey, ctx = {}) {
  const ids = ctx.taskModelVariableIds || [];
  const variables = ctx.variables || ctx.taskModelVariables || [];
  for (const id of ids) {
    const row = variables.find((v) => v?.id === id);
    if (row?.valueSet === valueSetKey) return row;
  }
  return null;
}

/**
 * Discrete levels a Task Model may record for this design feature.
 * Always a subset of (or equal to) the vocabulary list for that valueSet.
 */
export function designFeatureValues(valueSetKey, ctx = {}) {
  const vocab = vocabularyValuesForDesignFeature(valueSetKey);
  if (!vocab.length) return [];

  const bound = boundVariableForDesignFeature(valueSetKey, ctx);
  if (!bound) return vocab;

  const levels = discreteLevelsForSetting(
    settingFor(ctx.taskModelVariableSettings, bound.id),
    bound
  );
  // Broken / empty setting must not wipe the vocabulary floor (D22).
  if (!levels.length) return vocab;
  return levels.filter((v) => vocab.includes(v));
}

/**
 * Select options `{ value, label }` for wizard fields.
 */
export function designFeatureOptions(valueSetKey, ctx = {}) {
  const allowed = new Set(designFeatureValues(valueSetKey, ctx));
  return vocabularyEntries(valueSetKey).filter((e) => allowed.has(e.value));
}

export function isDesignFeatureValueAllowed(valueSetKey, value, ctx = {}) {
  if (value == null || value === "") return true;
  return designFeatureValues(valueSetKey, ctx).includes(value);
}

/**
 * Build the ctx bag schema / wizards pass from a Task Model + db.
 */
export function designFeatureContextFromTaskModel(obj, db) {
  return {
    taskModelVariableIds: obj?.taskModelVariableIds,
    taskModelVariableSettings: obj?.taskModelVariableSettings,
    variables: db?.taskModelVariables,
  };
}
