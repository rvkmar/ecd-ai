// Column math for the rubric criteria-by-levels grid.
// A new rubric starts at two levels. Add level appends one column on
// every criterion, up to MAX_RUBRIC_LEVELS in the form. The server
// validator still accepts any longer list (it only requires one level),
// so an imported rubric with more columns is shown and saved whole.

export const MIN_RUBRIC_LEVELS = 2;
export const MAX_RUBRIC_LEVELS = 10;

export function columnCount(dimensions) {
  return (dimensions || []).reduce(
    (count, dimension) => Math.max(count, dimension?.levels?.length || 0),
    0
  );
}

export function levelAt(dimensions, index) {
  for (const dimension of dimensions || []) {
    const level = dimension?.levels?.[index];
    if (level && typeof level === "object") return level;
  }
  return null;
}

function finiteScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

export function nextLevelScore(levels) {
  const scores = (levels || [])
    .map((level) => finiteScore(level?.value))
    .filter((score) => score != null);
  if (!scores.length) return (levels || []).length;
  return Math.max(...scores) + 1;
}

export function nextLevelLabel(levels) {
  const used = new Set((levels || []).map((level) => level?.label));
  let n = (levels || []).length + 1;
  let label = `Level ${n}`;
  while (used.has(label)) {
    n += 1;
    label = `Level ${n}`;
  }
  return label;
}

export function alignDimensions(dimensions) {
  const count = columnCount(dimensions);
  return (dimensions || []).map((dimension) => {
    const levels = Array.isArray(dimension?.levels) ? [...dimension.levels] : [];
    while (levels.length < count) {
      const template = levelAt(dimensions, levels.length);
      levels.push({
        value: template?.value ?? levels.length,
        label: template?.label || `Level ${levels.length + 1}`,
        descriptor: "",
        exemplar: "",
      });
    }
    return { ...dimension, levels };
  });
}

export function addLevelColumn(dimensions) {
  const aligned = alignDimensions(dimensions);
  if (columnCount(aligned) >= MAX_RUBRIC_LEVELS) return aligned;
  const headers = aligned[0]?.levels || [];
  const created = {
    value: nextLevelScore(headers),
    label: nextLevelLabel(headers),
    descriptor: "",
    exemplar: "",
  };
  return aligned.map((dimension) => ({
    ...dimension,
    levels: [...dimension.levels, { ...created }],
  }));
}

export function columnHasText(dimensions, index) {
  return (dimensions || []).some((dimension) => {
    const level = dimension?.levels?.[index];
    if (!level || typeof level !== "object") return false;
    const descriptor = String(level.descriptor || "").trim();
    const exemplar = String(level.exemplar || "").trim();
    return descriptor !== "" || exemplar !== "";
  });
}

function retargetActivatesAt(current, removedValue, levels) {
  if (current !== removedValue) return current;
  const scores = levels
    .map((level) => finiteScore(level?.value))
    .filter((score) => score != null);
  if (scores.length) return Math.max(...scores);
  return levels.length ? levels[levels.length - 1].value : current;
}

export function removeLevelColumn(dimensions, index) {
  const aligned = alignDimensions(dimensions);
  if (columnCount(aligned) <= MIN_RUBRIC_LEVELS) return aligned;
  if (index < 0 || index >= columnCount(aligned)) return aligned;
  return aligned.map((dimension) => {
    const removed = dimension.levels[index];
    const levels = dimension.levels.filter((_, levelIndex) => levelIndex !== index);
    return {
      ...dimension,
      levels,
      activatesAt: retargetActivatesAt(dimension.activatesAt, removed?.value, levels),
    };
  });
}

export function patchLevelColumn(dimensions, index, patch) {
  const aligned = alignDimensions(dimensions);
  return aligned.map((dimension) => {
    const current = dimension.levels[index];
    if (!current) return dimension;
    const levels = dimension.levels.map((level, levelIndex) =>
      levelIndex === index ? { ...level, ...patch } : level
    );
    let activatesAt = dimension.activatesAt;
    if (
      Object.prototype.hasOwnProperty.call(patch, "value") &&
      dimension.activatesAt === current.value
    ) {
      activatesAt = patch.value;
    }
    return { ...dimension, levels, activatesAt };
  });
}

// Commit a typed score. A blank or duplicate score keeps the previous
// value so two columns never share a score and the activate threshold
// still points at the same column.
export function commitLevelScore(dimensions, index, raw, fallback) {
  const aligned = alignDimensions(dimensions);
  if (String(raw).trim() === "" || !Number.isFinite(Number(raw))) {
    return patchLevelColumn(aligned, index, { value: fallback });
  }
  const score = Math.round(Number(raw));
  const headers = aligned[0]?.levels || [];
  const clash = headers.some(
    (level, levelIndex) => levelIndex !== index && Number(level.value) === score
  );
  if (!Number.isFinite(score) || clash) {
    return patchLevelColumn(aligned, index, { value: fallback });
  }
  return patchLevelColumn(aligned, index, { value: score });
}
