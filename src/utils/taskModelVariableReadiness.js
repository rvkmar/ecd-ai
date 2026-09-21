// src/utils/taskModelVariableReadiness.js
//
// D116 artefact 6. Client-side completeness mirror for Task Model
// Variables. Independent of validateEntity — the type list and value-set
// keys below are a second copy on purpose. mirrorDrift.test.js fails if
// they diverge from ecdVocabulary.js. This file does not import
// ecdVocabulary.js and does not copy Bloom / reasoning / design-feature
// levels; aligned variables name a valueSet key and leave the levels in
// the vocabulary module.

export const TASK_MODEL_VARIABLE_TYPE_MIRROR = [
  "categorical",
  "ordinal",
  "numeric",
  "boolean",
];

export const TASK_MODEL_VARIABLE_VALUE_SET_MIRROR = [
  "bloomLevel",
  "reasoningType",
  "presentationMode",
  "responseFormat",
  "stimulusPolicy",
];

function discreteValueProblems(possibleValues, strict, type) {
  const errors = [];
  if (possibleValues == null) {
    if (strict) {
      errors.push(`Task Model Variable (${type}) requires at least 2 possibleValues.`);
    }
    return errors;
  }
  if (!Array.isArray(possibleValues)) {
    errors.push("possibleValues should be array");
    return errors;
  }
  const seen = new Set();
  possibleValues.forEach((entry, i) => {
    const tag = `possibleValues[${i}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${tag} must be an object with a value.`);
      return;
    }
    if (typeof entry.value !== "string" || entry.value.trim() === "") {
      errors.push(`${tag}.value must be a non-empty string.`);
      return;
    }
    if (entry.label !== undefined && typeof entry.label !== "string") {
      errors.push(`${tag}.label must be a string.`);
    }
    if (seen.has(entry.value)) {
      errors.push(`Duplicate possible value '${entry.value}'.`);
    }
    seen.add(entry.value);
  });
  if (strict && seen.size < 2) {
    errors.push(`Task Model Variable (${type}) requires at least 2 possibleValues.`);
  }
  return errors;
}

/**
 * @param {object} record
 * @param {{ strict?: boolean }} [options]
 * @returns {{ ready: boolean, errors: string[] }}
 */
export function taskModelVariableReadiness(record = {}, options = {}) {
  const strict = options.strict !== false;
  const errors = [];

  if (!record.name || String(record.name).trim() === "") {
    errors.push("Task Model Variable name is required.");
  }

  if (strict && !record.type) {
    errors.push("Task Model Variable type is required.");
  } else if (record.type && !TASK_MODEL_VARIABLE_TYPE_MIRROR.includes(record.type)) {
    errors.push(
      `Invalid Task Model Variable type '${record.type}'. Must be one of: ${TASK_MODEL_VARIABLE_TYPE_MIRROR.join(", ")}.`
    );
  }

  const valueSetPresent =
    record.valueSet !== undefined && record.valueSet !== null && record.valueSet !== "";
  if (valueSetPresent && !TASK_MODEL_VARIABLE_VALUE_SET_MIRROR.includes(record.valueSet)) {
    errors.push(
      `Unknown valueSet '${record.valueSet}'. Known sets: ${TASK_MODEL_VARIABLE_VALUE_SET_MIRROR.join(", ")}.`
    );
  }
  if (valueSetPresent && record.type && record.type !== "categorical") {
    errors.push("valueSet applies only to categorical Task Model Variables.");
  }
  if (valueSetPresent && record.possibleValues != null) {
    errors.push(
      "possibleValues must be omitted when valueSet is set; levels come from ecdVocabulary."
    );
  }

  const discrete = record.type === "categorical" || record.type === "ordinal";
  if (discrete && !valueSetPresent) {
    errors.push(...discreteValueProblems(record.possibleValues, strict, record.type));
  }

  if (record.type === "numeric") {
    if (Array.isArray(record.possibleValues) && record.possibleValues.length > 0) {
      errors.push("A numeric Task Model Variable does not take possibleValues; use range.");
    }
    if (record.range == null) {
      if (strict) errors.push("A numeric Task Model Variable requires range.min < range.max.");
    } else if (typeof record.range !== "object" || Array.isArray(record.range)) {
      errors.push("range should be object");
    } else {
      const { min, max } = record.range;
      const both = typeof min === "number" && typeof max === "number";
      if (both && min >= max) {
        errors.push("range.min must be less than range.max.");
      } else if (strict && !both) {
        errors.push("A numeric Task Model Variable requires range.min < range.max.");
      }
    }
  } else if (record.range != null) {
    errors.push("range applies only to numeric Task Model Variables.");
  }

  if (record.type === "boolean" && record.possibleValues != null) {
    errors.push(
      "A boolean Task Model Variable does not take possibleValues; levels are true and false."
    );
  }

  return { ready: errors.length === 0, errors };
}
