// Compare two parameterSets[].parameters maps. Rows are sorted by
// largest |Δ| first — the D65 calendar leftover that ParameterDrift
// listed in file order instead of movement order.

function isReservedKey(key) {
  return typeof key === "string" && key.startsWith("_");
}

function numericOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function delta(left, right) {
  const a = numericOrNull(left);
  const b = numericOrNull(right);
  if (a == null || b == null) return null;
  return a - b;
}

function observableIds(parameters = {}) {
  return Object.keys(parameters).filter((key) => !isReservedKey(key));
}

export function movementMagnitude(row) {
  if (!row) return 0;
  return Math.max(
    Math.abs(row.da ?? 0),
    Math.abs(row.db ?? 0),
    Math.abs(row.dSlip ?? 0),
    Math.abs(row.dGuess ?? 0)
  );
}

export function diffParameterSets(activeParameters = {}, otherParameters = {}) {
  const ids = [
    ...new Set([
      ...observableIds(activeParameters),
      ...observableIds(otherParameters),
    ]),
  ];

  const rows = ids.map((id) => {
    const active = activeParameters?.[id] || {};
    const other = otherParameters?.[id] || {};
    return {
      id,
      aActive: numericOrNull(active.a),
      aOther: numericOrNull(other.a),
      da: delta(active.a, other.a),
      bActive: numericOrNull(active.b),
      bOther: numericOrNull(other.b),
      db: delta(active.b, other.b),
      slipActive: numericOrNull(active.slip),
      slipOther: numericOrNull(other.slip),
      dSlip: delta(active.slip, other.slip),
      guessActive: numericOrNull(active.guess),
      guessOther: numericOrNull(other.guess),
      dGuess: delta(active.guess, other.guess),
    };
  });

  rows.sort((left, right) => {
    const mag = movementMagnitude(right) - movementMagnitude(left);
    if (mag !== 0) return mag;
    return String(left.id).localeCompare(String(right.id));
  });

  return rows;
}

export function diffFamily(rows = []) {
  const irt = rows.some((row) => row.da != null || row.db != null);
  const dina = rows.some((row) => row.dSlip != null || row.dGuess != null);
  if (irt) return "irt";
  if (dina) return "dina";
  return "none";
}
