// TU2 (T15). Optional performance-level descriptors on a competency.
//
// Absent or empty performanceLevels means no standard is set.
// Reports then use the labelled default cuts in server/delivery/reportLevels.js.
//
// Each cut is the lowest score that reaches that level. Cuts are strictly
// ascending from the lowest level to the highest. performanceLevelScale
// says which score the cuts use: "theta" or "probability".
//
// levelForScore returns the highest level whose cut is less than or equal
// to the value, or null when no levels are authored, the scales differ,
// the value is not a finite number, or the value sits below every cut.

export const PERFORMANCE_LEVEL_SCALES = Object.freeze(["theta", "probability"]);

function scaleProblem(scale, required) {
  if (scale == null || scale === "") {
    return required
      ? "performanceLevelScale must be theta or probability when performance levels are authored."
      : null;
  }
  if (typeof scale !== "string" || !PERFORMANCE_LEVEL_SCALES.includes(scale)) {
    return "performanceLevelScale must be theta or probability.";
  }
  return null;
}

/**
 * Value errors for competency.performanceLevels and performanceLevelScale.
 * An absent field, null, or an empty array is valid.
 */
export function performanceLevelErrors(competency = {}) {
  const errors = [];
  const levels = competency?.performanceLevels;

  if (levels == null) {
    const problem = scaleProblem(competency?.performanceLevelScale, false);
    if (problem) errors.push(problem);
    return errors;
  }

  if (!Array.isArray(levels)) {
    return errors;
  }

  const scaleProblemText = scaleProblem(
    competency?.performanceLevelScale,
    levels.length > 0
  );
  if (scaleProblemText) errors.push(scaleProblemText);

  if (levels.length === 0) return errors;

  const scale = competency?.performanceLevelScale;
  const labels = [];
  const cuts = [];
  let cutsAreNumeric = true;

  levels.forEach((level, i) => {
    const where = `performanceLevels[${i}]`;
    if (!level || typeof level !== "object" || Array.isArray(level)) {
      errors.push(`${where} must be an object with label, descriptor, and cut.`);
      cutsAreNumeric = false;
      return;
    }

    const label = typeof level.label === "string" ? level.label.trim() : "";
    if (!label) {
      errors.push(`${where}.label is required.`);
    } else {
      labels.push(label);
    }

    if (level.descriptor != null && typeof level.descriptor !== "string") {
      errors.push(`${where}.descriptor should be string.`);
    }

    if (typeof level.cut !== "number" || !Number.isFinite(level.cut)) {
      errors.push(`${where}.cut must be a finite number.`);
      cutsAreNumeric = false;
    } else {
      if (scale === "probability" && (level.cut < 0 || level.cut > 1)) {
        errors.push(
          `${where}.cut must be between 0 and 1 on the probability scale.`
        );
      }
      cuts.push(level.cut);
    }
  });

  const seen = new Set();
  for (const label of labels) {
    if (seen.has(label)) {
      errors.push("performanceLevels labels must be unique.");
      break;
    }
    seen.add(label);
  }

  if (cutsAreNumeric) {
    for (let i = 1; i < cuts.length; i += 1) {
      if (!(cuts[i] > cuts[i - 1])) {
        errors.push("performanceLevels cuts must be strictly ascending.");
        break;
      }
    }
  }

  return errors;
}

export function performanceLevelsReady(competency) {
  return performanceLevelErrors(competency || {}).length === 0;
}

function asLevel(level) {
  return {
    label: typeof level.label === "string" ? level.label : "",
    descriptor: typeof level.descriptor === "string" ? level.descriptor : "",
    cut: level.cut,
  };
}

/**
 * @param {object | null | undefined} competency
 * @param {number} value score on `scale`
 * @param {"theta" | "probability"} scale scale of `value`
 * @returns {{ label: string, descriptor: string, cut: number } | null}
 */
export function levelForScore(competency, value, scale) {
  const levels = competency?.performanceLevels;
  if (!Array.isArray(levels) || levels.length === 0) return null;
  if (scale !== competency?.performanceLevelScale) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  let best = null;
  for (const level of levels) {
    if (!level || typeof level.cut !== "number" || !Number.isFinite(level.cut)) {
      return null;
    }
    if (value >= level.cut && (best == null || level.cut >= best.cut)) {
      best = level;
    }
  }
  return best ? asLevel(best) : null;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Angoff cut on the probability scale.
 * `ratingsByItem` is one array of panelist probabilities per item.
 * The cut is the mean of the per-item means (each item weighs the same).
 * Returns null when any rating is missing, non-numeric, or outside [0, 1].
 */
export function angoffCut(ratingsByItem) {
  if (!Array.isArray(ratingsByItem) || ratingsByItem.length === 0) return null;

  const itemMeans = [];
  for (const ratings of ratingsByItem) {
    if (!Array.isArray(ratings) || ratings.length === 0) return null;
    let sum = 0;
    for (const rating of ratings) {
      if (!finiteNumber(rating) || rating < 0 || rating > 1) return null;
      sum += rating;
    }
    itemMeans.push(sum / ratings.length);
  }

  const total = itemMeans.reduce((sum, mean) => sum + mean, 0);
  return total / itemMeans.length;
}

function difficultyOf(item) {
  if (finiteNumber(item)) return item;
  if (item && typeof item === "object" && finiteNumber(item.difficulty)) {
    return item.difficulty;
  }
  return null;
}

/**
 * Bookmark cut on the theta scale.
 * `orderedItems` is item difficulties, already in increasing order
 * (numbers, or objects with `difficulty`). `position` is the 0-based
 * index of the first item a borderline examinee is not expected to
 * answer correctly. The cut is that item's difficulty.
 * Returns null when the list is empty, not strictly increasing, or
 * the position is outside the list.
 */
export function bookmarkCut(orderedItems, position) {
  if (!Array.isArray(orderedItems) || orderedItems.length === 0) return null;
  if (!Number.isInteger(position) || position < 0 || position >= orderedItems.length) {
    return null;
  }

  const difficulties = [];
  for (const item of orderedItems) {
    const difficulty = difficultyOf(item);
    if (difficulty == null) return null;
    difficulties.push(difficulty);
  }

  for (let i = 1; i < difficulties.length; i += 1) {
    if (!(difficulties[i] > difficulties[i - 1])) return null;
  }

  return difficulties[position];
}
