// TU4 model criticism shapes.
// Summaries live on fitStatistics. Per-person Zh rows and the Q3 matrix
// are sidecars (personFitRows, q3Matrix) and must not be stored on a
// parameter set. Missing keys are valid: that is today's behaviour.

const BULKY_FIT_KEYS = ["personFitRows", "q3Matrix", "persons", "q3"];

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function fitStatisticsForParameterSet(fitStatistics) {
  if (fitStatistics == null) return undefined;
  if (!isObject(fitStatistics)) return fitStatistics;
  const next = { ...fitStatistics };
  for (const key of BULKY_FIT_KEYS) delete next[key];
  if (isObject(next.personFit)) {
    const pf = { ...next.personFit };
    delete pf.rows;
    delete pf.persons;
    delete pf.personIds;
    if (Array.isArray(pf.Zh)) delete pf.Zh;
    next.personFit = pf;
  }
  if (isObject(next.localDependence)) {
    const ld = { ...next.localDependence };
    delete ld.matrix;
    delete ld.values;
    delete ld.q3Matrix;
    next.localDependence = ld;
  }
  return next;
}

function push(errors, message) {
  errors.push(message);
}

function validateNumber(errors, value, label, { allowNull = false } = {}) {
  if (value == null) {
    if (!allowNull) return;
    return;
  }
  if (!isFiniteNumber(value)) push(errors, `${label} should be a number`);
}

function validatePersonFitSummary(pf, errors, prefix) {
  if (pf == null) return;
  if (!isObject(pf)) {
    push(errors, `${prefix} should be object`);
    return;
  }
  if (pf.rows || pf.persons || pf.personIds || Array.isArray(pf.Zh)) {
    push(errors, `${prefix} must not carry per-person rows`);
  }
  if (pf.available === false) {
    if (pf.note != null && typeof pf.note !== "string") {
      push(errors, `${prefix}.note should be a string`);
    }
    return;
  }
  if (pf.statistic != null && pf.statistic !== "Zh") {
    push(errors, `${prefix}.statistic should be Zh`);
  }
  validateNumber(errors, pf.cutoff, `${prefix}.cutoff`);
  validateNumber(errors, pf.nPersons, `${prefix}.nPersons`);
  validateNumber(errors, pf.nFinite, `${prefix}.nFinite`, { allowNull: true });
  validateNumber(errors, pf.nMisfit, `${prefix}.nMisfit`);
  validateNumber(errors, pf.proportionMisfit, `${prefix}.proportionMisfit`, { allowNull: true });
  if (isFiniteNumber(pf.nPersons) && isFiniteNumber(pf.nMisfit) && pf.nMisfit > pf.nPersons) {
    push(errors, `${prefix}.nMisfit cannot exceed nPersons`);
  }
  if (
    isFiniteNumber(pf.proportionMisfit) &&
    (pf.proportionMisfit < 0 || pf.proportionMisfit > 1)
  ) {
    push(errors, `${prefix}.proportionMisfit must be between 0 and 1`);
  }
}

function validateFlaggedPairs(pairs, errors, prefix) {
  if (pairs == null) return;
  if (!Array.isArray(pairs)) {
    push(errors, `${prefix} should be an array`);
    return;
  }
  pairs.forEach((pair, i) => {
    if (!isObject(pair)) {
      push(errors, `${prefix}[${i}] should be object`);
      return;
    }
    if (typeof pair.itemId1 !== "string" || typeof pair.itemId2 !== "string") {
      push(errors, `${prefix}[${i}] needs itemId1 and itemId2`);
    }
    if (!isFiniteNumber(pair.q3)) push(errors, `${prefix}[${i}].q3 should be a number`);
  });
}

function validateLocalDependence(ld, errors, prefix) {
  if (ld == null) return;
  if (!isObject(ld)) {
    push(errors, `${prefix} should be object`);
    return;
  }
  if (ld.matrix || ld.values || ld.q3Matrix) {
    push(errors, `${prefix} must not carry the Q3 matrix`);
  }
  if (ld.available === false) {
    if (ld.note != null && typeof ld.note !== "string") {
      push(errors, `${prefix}.note should be a string`);
    }
    return;
  }
  if (ld.statistic != null && ld.statistic !== "Q3") {
    push(errors, `${prefix}.statistic should be Q3`);
  }
  validateNumber(errors, ld.threshold, `${prefix}.threshold`);
  validateNumber(errors, ld.maxAbsQ3, `${prefix}.maxAbsQ3`, { allowNull: true });
  validateNumber(errors, ld.nPairs, `${prefix}.nPairs`, { allowNull: true });
  validateNumber(errors, ld.nFlaggedPairs, `${prefix}.nFlaggedPairs`, { allowNull: true });
  validateFlaggedPairs(ld.flaggedPairs, errors, `${prefix}.flaggedPairs`);
  if (
    isFiniteNumber(ld.nFlaggedPairs) &&
    Array.isArray(ld.flaggedPairs) &&
    ld.nFlaggedPairs !== ld.flaggedPairs.length
  ) {
    push(errors, `${prefix}.nFlaggedPairs must match flaggedPairs.length`);
  }
}

function validateQVector(vec, errors, label) {
  if (!Array.isArray(vec) || vec.length < 1) {
    push(errors, `${label} should be a q-vector`);
    return;
  }
  if (!vec.every((cell) => isFiniteNumber(cell))) {
    push(errors, `${label} should be numbers`);
  }
}

function validateQValidation(qv, errors) {
  if (qv == null) return;
  const prefix = "fitStatistics.qValidation";
  if (!isObject(qv)) {
    push(errors, `${prefix} should be object`);
    return;
  }
  if (qv.available === false) {
    if (qv.note != null && typeof qv.note !== "string") {
      push(errors, `${prefix}.note should be a string`);
    }
    return;
  }
  validateNumber(errors, qv.eps, `${prefix}.eps`, { allowNull: true });
  validateNumber(errors, qv.nItems, `${prefix}.nItems`, { allowNull: true });
  validateNumber(errors, qv.nChanged, `${prefix}.nChanged`, { allowNull: true });
  if (qv.suggestions != null && !Array.isArray(qv.suggestions)) {
    push(errors, `${prefix}.suggestions should be an array`);
    return;
  }
  (qv.suggestions || []).forEach((row, i) => {
    const label = `${prefix}.suggestions[${i}]`;
    if (!isObject(row)) {
      push(errors, `${label} should be object`);
      return;
    }
    if (typeof row.itemId !== "string" || !row.itemId) {
      push(errors, `${label}.itemId is required`);
    }
    validateQVector(row.original, errors, `${label}.original`);
    validateQVector(row.suggested, errors, `${label}.suggested`);
    if (
      Array.isArray(row.original) &&
      Array.isArray(row.suggested) &&
      row.original.length !== row.suggested.length
    ) {
      push(errors, `${label} original and suggested must have the same length`);
    }
    validateNumber(errors, row.pvaf, `${label}.pvaf`, { allowNull: true });
  });
  if (
    isFiniteNumber(qv.nChanged) &&
    Array.isArray(qv.suggestions) &&
    qv.nChanged !== qv.suggestions.length
  ) {
    push(errors, `${prefix}.nChanged must match suggestions.length`);
  }
}

function validateCdmFit(cdm, errors) {
  if (cdm == null) return;
  const prefix = "fitStatistics.cdmFit";
  if (!isObject(cdm)) {
    push(errors, `${prefix} should be object`);
    return;
  }
  if (cdm.available === false) {
    if (cdm.note != null && typeof cdm.note !== "string") {
      push(errors, `${prefix}.note should be a string`);
    }
    return;
  }
  for (const key of ["M2", "df", "p", "RMSEA2", "SRMSR"]) {
    validateNumber(errors, cdm[key], `${prefix}.${key}`, { allowNull: true });
  }
  if (cdm.rmsea2Ci != null) {
    if (!isObject(cdm.rmsea2Ci)) {
      push(errors, `${prefix}.rmsea2Ci should be object`);
    } else {
      validateNumber(errors, cdm.rmsea2Ci.lower, `${prefix}.rmsea2Ci.lower`, { allowNull: true });
      validateNumber(errors, cdm.rmsea2Ci.upper, `${prefix}.rmsea2Ci.upper`, { allowNull: true });
    }
  }
}

export function bulkyFitStatisticsErrors(fitStatistics) {
  if (fitStatistics == null) return [];
  if (!isObject(fitStatistics)) return ["fitStatistics should be object"];
  const errors = [];
  for (const key of BULKY_FIT_KEYS) {
    if (fitStatistics[key] != null) {
      errors.push(`fitStatistics.${key} is a sidecar and cannot be stored on a parameter set`);
    }
  }
  if (isObject(fitStatistics.personFit)) {
    const pf = fitStatistics.personFit;
    if (pf.rows || pf.persons || pf.personIds || Array.isArray(pf.Zh)) {
      errors.push("fitStatistics.personFit must not carry per-person rows");
    }
  }
  if (isObject(fitStatistics.localDependence)) {
    const ld = fitStatistics.localDependence;
    if (ld.matrix || ld.values || ld.q3Matrix) {
      errors.push("fitStatistics.localDependence must not carry the Q3 matrix");
    }
  }
  return errors;
}

function validatePersonFitRows(rows, errors) {
  if (rows == null) return;
  if (!Array.isArray(rows)) {
    push(errors, "personFitRows should be an array");
    return;
  }
  rows.forEach((row, i) => {
    if (!isObject(row)) {
      push(errors, `personFitRows[${i}] should be object`);
      return;
    }
    if (typeof row.personId !== "string" || !row.personId) {
      push(errors, `personFitRows[${i}].personId is required`);
    }
    validateNumber(errors, row.Zh, `personFitRows[${i}].Zh`, { allowNull: true });
    if (typeof row.misfit !== "boolean") {
      push(errors, `personFitRows[${i}].misfit should be a boolean`);
    }
  });
}

function validateQ3Matrix(matrix, errors) {
  if (matrix == null) return;
  if (!isObject(matrix)) {
    push(errors, "q3Matrix should be object");
    return;
  }
  if (!Array.isArray(matrix.itemIds) || matrix.itemIds.length < 2) {
    push(errors, "q3Matrix.itemIds must name at least two items");
    return;
  }
  if (!matrix.itemIds.every((id) => typeof id === "string" && id)) {
    push(errors, "q3Matrix.itemIds should be strings");
  }
  if (!Array.isArray(matrix.values) || matrix.values.length !== matrix.itemIds.length) {
    push(errors, "q3Matrix.values must be a square matrix aligned to itemIds");
    return;
  }
  matrix.values.forEach((row, i) => {
    if (!Array.isArray(row) || row.length !== matrix.itemIds.length) {
      push(errors, `q3Matrix.values[${i}] must have one cell per item`);
      return;
    }
    row.forEach((cell, j) => {
      if (cell != null && !isFiniteNumber(cell)) {
        push(errors, `q3Matrix.values[${i}][${j}] should be a number`);
      }
    });
  });
}

export function modelCriticismResponseErrors(body) {
  const errors = [];
  if (!body || typeof body !== "object") return errors;
  const fit = body.fitStatistics;
  if (fit != null && !isObject(fit)) return errors;
  if (isObject(fit)) {
    errors.push(...bulkyFitStatisticsErrors(fit));
    validateCdmFit(fit.cdmFit, errors);
    validateQValidation(fit.qValidation, errors);
    validatePersonFitSummary(fit.personFit, errors, "fitStatistics.personFit");
    validateLocalDependence(fit.localDependence, errors, "fitStatistics.localDependence");
  }
  validatePersonFitRows(body.personFitRows, errors);
  validateQ3Matrix(body.q3Matrix, errors);
  return errors;
}

export function hasModelCriticism(fitStatistics) {
  if (!isObject(fitStatistics)) return false;
  return Boolean(
    fitStatistics.cdmFit ||
      fitStatistics.qValidation ||
      fitStatistics.personFit ||
      fitStatistics.localDependence
  );
}
