// src/utils/taskSpecFamilyMatrix.js
//
// D153. Turn a family of TMV assignments into a table: varying
// dimensions become columns; fixed dimensions become a one-line note.
// Preview (planned assignments) and generated specs share this so the
// family view cannot drift from generation.

function variableById(variables) {
  const map = new Map();
  for (const variable of variables || []) {
    if (variable?.id) map.set(variable.id, variable);
  }
  return map;
}

function variableLabel(variable, id) {
  return (variable && variable.name) || id;
}

function valueLabel(variable, value) {
  if (value == null || value === "") return "";
  const options = variable?.possibleValues;
  if (Array.isArray(options)) {
    const hit = options.find((row) => row && row.value === value);
    if (hit?.label) return hit.label;
  }
  return String(value);
}

export function assignmentsFromSpecs(specs) {
  return (specs || []).map((spec) => spec?.tmvAssignment || []);
}

/**
 * @param {Array<Array<{ taskModelVariableId: string, value: string }>>} assignments
 * @param {Array<object>} variables
 */
export function taskSpecFamilyMatrix(assignments = [], variables = []) {
  const byId = variableById(variables);
  const ids = [];
  const seen = new Set();
  const valuesById = new Map();

  for (const assignment of assignments || []) {
    for (const cell of assignment || []) {
      const id = cell?.taskModelVariableId;
      if (!id) continue;
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
        valuesById.set(id, []);
      }
      const value = cell.value == null ? "" : String(cell.value);
      const list = valuesById.get(id);
      if (!list.includes(value)) list.push(value);
    }
  }

  const varyingIds = ids.filter((id) => (valuesById.get(id) || []).length > 1);
  const columns = varyingIds.map((id) => ({
    id,
    label: variableLabel(byId.get(id), id),
  }));
  const fixed = ids
    .filter((id) => (valuesById.get(id) || []).length === 1)
    .map((id) => {
      const value = valuesById.get(id)[0];
      return {
        id,
        label: variableLabel(byId.get(id), id),
        value,
        valueLabel: valueLabel(byId.get(id), value),
      };
    });

  const rows = (assignments || []).map((assignment, index) => {
    const byVar = new Map();
    for (const cell of assignment || []) {
      if (cell?.taskModelVariableId) {
        byVar.set(
          cell.taskModelVariableId,
          cell.value == null ? "" : String(cell.value)
        );
      }
    }
    const cells = {};
    const labels = {};
    for (const id of varyingIds) {
      const value = byVar.get(id) ?? "";
      cells[id] = value;
      labels[id] = valueLabel(byId.get(id), value);
    }
    return { index, cells, labels };
  });

  return {
    columns,
    rows,
    fixed,
    size: (assignments || []).length,
  };
}
