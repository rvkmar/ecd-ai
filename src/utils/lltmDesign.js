// TU19. Design matrix for an LLTM. Task Model Variable assignments are
// the item covariates. Categorical and ordinal variables use treatment
// contrasts: the reference level (first library level that appears in
// the estimation rows, otherwise the first observed level) is omitted.
// The reference pattern, every covariate at its reference level, has a
// row of zeros. There is no intercept column. Conditional maximum
// likelihood does not identify an intercept, and a zero row fixes that
// pattern's difficulty at 0.
//
// Numeric variables contribute one column, the number itself. A column
// that does not vary, or that is linearly dependent on earlier columns,
// is omitted.

import { taskModelVariableValueIds } from "./ecdVocabulary.js";

function variableMap(variables) {
  const map = new Map();
  for (const variable of variables || []) {
    if (variable?.id) map.set(variable.id, variable);
  }
  return map;
}

function assignmentMap(assignment) {
  const values = new Map();
  for (const cell of assignment || []) {
    if (!cell || cell.taskModelVariableId == null) continue;
    const value = cell.value == null ? "" : String(cell.value).trim();
    if (!value) continue;
    values.set(String(cell.taskModelVariableId), value);
  }
  return values;
}

function observedValues(rows, variableId) {
  const values = [];
  for (const row of rows || []) {
    const value = assignmentMap(row?.assignment).get(variableId);
    if (value && !values.includes(value)) values.push(value);
  }
  return values;
}

function orderedLevels(variable, observed) {
  const library = taskModelVariableValueIds(variable);
  const inLibrary = library.filter((value) => observed.includes(value));
  const extra = observed.filter((value) => !inLibrary.includes(value));
  return [...inLibrary, ...extra];
}

function variableLabel(variable, id) {
  return (variable && variable.name) || id;
}

function levelLabel(variable, value) {
  const options = variable?.possibleValues;
  if (Array.isArray(options)) {
    const hit = options.find((row) => row && (row.value === value || row === value));
    if (hit && typeof hit === "object" && hit.label) return hit.label;
  }
  return value;
}

function numericValue(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  return null;
}

function rankOf(rows) {
  if (!rows.length || !rows[0]?.length) return 0;
  const a = rows.map((row) => row.slice());
  const n = a.length;
  const m = a[0].length;
  const used = new Array(n).fill(false);
  let rank = 0;
  for (let col = 0; col < m; col += 1) {
    let pivot = -1;
    let best = 0;
    for (let i = 0; i < n; i += 1) {
      if (used[i]) continue;
      const value = Math.abs(a[i][col]);
      if (value > best) {
        best = value;
        pivot = i;
      }
    }
    if (pivot < 0 || best < 1e-8) continue;
    used[pivot] = true;
    const pivotValue = a[pivot][col];
    for (let i = 0; i < n; i += 1) {
      if (i === pivot) continue;
      const factor = a[i][col] / pivotValue;
      if (!factor) continue;
      for (let k = col; k < m; k += 1) a[i][k] -= factor * a[pivot][k];
    }
    rank += 1;
  }
  return rank;
}

function keepIndependent(matrix) {
  const width = matrix[0]?.length || 0;
  const selected = [];
  for (let column = 0; column < width; column += 1) {
    const trial = matrix.map((row) => [...selected, column].map((index) => row[index]));
    if (rankOf(trial) > selected.length) selected.push(column);
  }
  return selected;
}

/**
 * @param {Array<{ id?: string, assignment?: Array<{ taskModelVariableId: string, value: string }> }>} rows
 * @param {Array<object>} variables
 */
export function buildLltmDesign(rows, variables = []) {
  const byId = variableMap(variables);
  const input = Array.isArray(rows) ? rows : [];
  const variableIds = [];
  const seen = new Set();
  for (const row of input) {
    for (const cell of row?.assignment || []) {
      const id = cell?.taskModelVariableId;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      variableIds.push(id);
    }
  }

  const candidates = [];
  const held = [];
  for (const variableId of variableIds) {
    const variable = byId.get(variableId) || null;
    const observed = observedValues(input, variableId);
    if (observed.length === 0) continue;
    const type = variable?.type || "categorical";
    if (type === "numeric") {
      const numbers = observed.map(numericValue);
      if (numbers.some((value) => value == null)) continue;
      if (new Set(numbers).size < 2) {
        held.push({ taskModelVariableId: variableId, value: observed[0] });
        continue;
      }
      candidates.push({
        name: variableId,
        role: "numeric",
        taskModelVariableId: variableId,
        level: null,
        reference: null,
        label: variableLabel(variable, variableId),
      });
      continue;
    }
    if (observed.length < 2) {
      held.push({ taskModelVariableId: variableId, value: observed[0] });
      continue;
    }
    const levels = orderedLevels(variable, observed);
    const reference = levels[0];
    const nameOfVariable = variableLabel(variable, variableId);
    const referenceText = levelLabel(variable, reference);
    for (const level of levels.slice(1)) {
      candidates.push({
        name: `${variableId}=${level}`,
        role: "level",
        taskModelVariableId: variableId,
        level,
        reference,
        label: `${nameOfVariable}: ${levelLabel(variable, level)} vs ${referenceText}`,
      });
    }
  }

  const scored = input.map((row) => scoreAgainst(row, candidates, held));
  const usable = scored.filter((row) => row.ok);
  const matrix = usable.map((row) => row.x);
  const keep = matrix.length ? keepIndependent(matrix) : [];
  const columns = keep.map((index) => candidates[index]);
  const omitted = candidates
    .filter((_, index) => !keep.includes(index))
    .map((column) => ({
      name: column.name,
      reason: "This column does not vary independently of the columns already kept.",
    }));

  return {
    columns,
    omitted,
    held,
    rows: usable.map((row) => ({
      id: row.id,
      x: keep.map((index) => row.x[index]),
    })),
    unscored: scored
      .filter((row) => !row.ok)
      .map((row) => ({ id: row.id, reason: row.reason })),
  };
}

function scoreAgainst(row, columns, held) {
  const id = row?.id == null ? null : String(row.id);
  const values = assignmentMap(row?.assignment);
  for (const hold of held || []) {
    const value = values.get(hold.taskModelVariableId);
    if (value != null && value !== hold.value) {
      return {
        id,
        ok: false,
        reason: `${hold.taskModelVariableId} is '${value}', but the fit only saw '${hold.value}'.`,
      };
    }
  }
  const x = [];
  const grouped = new Map();
  for (const column of columns) {
    if (!grouped.has(column.taskModelVariableId)) grouped.set(column.taskModelVariableId, []);
    grouped.get(column.taskModelVariableId).push(column);
  }
  for (const [variableId, group] of grouped) {
    const value = values.get(variableId);
    if (value == null) {
      return { id, ok: false, reason: `Missing a value for ${variableId}.` };
    }
    if (group[0].role === "numeric") {
      const number = numericValue(value);
      if (number == null) {
        return { id, ok: false, reason: `${variableId} is not numeric ('${value}').` };
      }
      continue;
    }
    const known = new Set(group.map((column) => column.level));
    known.add(group[0].reference);
    if (!known.has(value)) {
      return {
        id,
        ok: false,
        reason: `Level '${value}' of ${variableId} was not in the fitted design.`,
      };
    }
  }
  for (const column of columns) {
    const value = values.get(column.taskModelVariableId);
    if (column.role === "numeric") {
      x.push(numericValue(value));
    } else {
      x.push(value === column.level ? 1 : 0);
    }
  }
  return { id, ok: true, x };
}

/**
 * Score rows with a design that was already fit. Levels that were not
 * in that design cannot be predicted.
 */
export function scoreLltmRows(rows, design) {
  const columns = design?.columns || [];
  const held = design?.held || [];
  return (rows || []).map((row) => scoreAgainst(row, columns, held));
}

function asSquare(vcov, width) {
  if (!Array.isArray(vcov) || width < 1) return null;
  if (vcov.length === width && vcov.every((row) => Array.isArray(row) && row.length === width)) {
    return vcov.map((row) => row.map((value) => Number(value)));
  }
  if (width === 1 && vcov.length === 1 && typeof vcov[0] === "number") {
    return [[Number(vcov[0])]];
  }
  return null;
}

function deltaSe(weights, vcov) {
  const matrix = asSquare(vcov, weights.length);
  if (!matrix) return null;
  let variance = 0;
  for (let i = 0; i < weights.length; i += 1) {
    for (let j = 0; j < weights.length; j += 1) {
      const cell = matrix[i][j];
      if (!Number.isFinite(cell)) return null;
      variance += weights[i] * cell * weights[j];
    }
  }
  if (!Number.isFinite(variance) || variance < 0) return null;
  return Math.sqrt(variance);
}

/**
 * Predicted Rasch difficulty for one design row.
 * `fit.effects` aligns with `design.columns`. `fit.intercept` is added
 * when the engine estimated a location (the mirt projection). eRm leaves
 * it null, so the reference pattern is difficulty 0.
 */
export function predictedDifficulty(x, fit) {
  const effects = Array.isArray(fit?.effects) ? fit.effects : [];
  if (!Array.isArray(x) || x.length !== effects.length) return null;
  const intercept = fit?.intercept && typeof fit.intercept.estimate === "number"
    ? fit.intercept.estimate
    : 0;
  let b = intercept;
  for (let i = 0; i < x.length; i += 1) {
    const estimate = effects[i]?.estimate;
    if (typeof estimate !== "number" || !Number.isFinite(estimate)) return null;
    if (typeof x[i] !== "number" || !Number.isFinite(x[i])) return null;
    b += x[i] * estimate;
  }
  const weights = fit?.intercept ? [1, ...x] : x.slice();
  const vcov = fit?.intercept ? fit.vcov : fit?.vcov;
  const bSe = deltaSe(weights, vcov);
  return { b, bSe };
}
