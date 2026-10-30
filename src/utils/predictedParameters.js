// TU19. Predicted item parameters from an LLTM (Task Model Variable
// covariates). They live on a task spec, and on an analysis artefact.
// They are not a calibrated parameter set. Activation must refuse them
// even when fit statistics are missing, and an override does not apply.

const PREDICTED = "predicted";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function isPredictedParameterSet(parameterSet) {
  if (!parameterSet || typeof parameterSet !== "object" || Array.isArray(parameterSet)) {
    return false;
  }
  if (parameterSet.parameterStatus === PREDICTED) return true;
  if (parameterSet.origin === PREDICTED) return true;
  if (parameterSet.estimation === PREDICTED) return true;
  if (parameterSet.predicted === true) return true;
  const method = text(parameterSet.calibrationMethod).toLowerCase();
  if (method === PREDICTED || method === "lltm-predicted") return true;
  return false;
}

export function formatSigned(value, digits = 3) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unavailable";
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return String(rounded);
}

export function formatEffect(value, digits = 3) {
  const textValue = formatSigned(value, digits);
  if (textValue === "unavailable") return textValue;
  if (value > 0 && !textValue.startsWith("+")) return `+${textValue}`;
  return textValue;
}

/**
 * Covariate effects on task specs that name this Task Model Variable.
 * The same fit is copied onto every spec in the family, so repeats collapse.
 */
export function covariateEffectsForVariable(specs, variableId) {
  if (!variableId) return [];
  const out = [];
  const seen = new Set();
  for (const spec of specs || []) {
    const predicted = spec?.predictedParameters;
    if (!predicted || predicted.parameterStatus !== PREDICTED) continue;
    const effects = Array.isArray(predicted.effects) ? predicted.effects : [];
    for (const effect of effects) {
      if (!effect || effect.taskModelVariableId !== variableId) continue;
      if (effect.role === "intercept") continue;
      const key = [
        effect.name,
        effect.estimate,
        effect.se,
        predicted.sourceModel,
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        ...effect,
        sourceModel: predicted.sourceModel || null,
        normalization: predicted.normalization || null,
        specId: spec.id || null,
      });
    }
  }
  return out;
}

export function predictedParameterErrors(value, label = "predictedParameters") {
  if (value == null) return [];
  if (typeof value !== "object" || Array.isArray(value)) {
    return [`${label} must be an object.`];
  }
  const errors = [];
  if (value.parameterStatus !== PREDICTED) {
    errors.push(`${label}.parameterStatus must be 'predicted'.`);
  }
  if (value.origin !== PREDICTED) {
    errors.push(`${label}.origin must be 'predicted'.`);
  }
  if (typeof value.b !== "number" || !Number.isFinite(value.b)) {
    errors.push(`${label}.b must be a finite number.`);
  }
  if (value.bSe != null && (typeof value.bSe !== "number" || !Number.isFinite(value.bSe))) {
    errors.push(`${label}.bSe must be a finite number when present.`);
  }
  if (!text(value.sourceModel)) {
    errors.push(`${label}.sourceModel is required.`);
  }
  if (!Array.isArray(value.effects)) {
    errors.push(`${label}.effects must be an array.`);
  }
  return errors;
}
