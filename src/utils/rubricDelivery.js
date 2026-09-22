// src/utils/rubricDelivery.js
//
// D122. Project a library rubric onto the EM-R1 delivery artifact shape
// ({ kind: "rubric", dimensions: [{ id, levels, activatesAt? }] }).
// Exemplars stay on the library record — they are authoring aids, not
// scored at Identification time.

/**
 * Normalize a dimension's levels to the primitive list Identification
 * compares with `levels.includes(rating)`.
 */
export function levelValues(levels) {
  if (!Array.isArray(levels)) return [];
  return levels
    .map((entry) => {
      if (entry == null) return null;
      if (typeof entry === "number" || typeof entry === "string") return entry;
      if (typeof entry === "object" && "value" in entry) return entry.value;
      return null;
    })
    .filter((v) => v !== null && v !== undefined && v !== "");
}

/**
 * @param {object} rubric
 * @returns {{ kind: "rubric", dimensions: object[] } | null}
 */
export function artifactFromRubric(rubric) {
  if (!rubric || !Array.isArray(rubric.dimensions) || rubric.dimensions.length === 0) {
    return null;
  }
  const dimensions = [];
  for (const dim of rubric.dimensions) {
    if (!dim?.id) continue;
    const levels = levelValues(dim.levels);
    const out = { id: dim.id, levels };
    if (dim.activatesAt !== undefined && dim.activatesAt !== null) {
      out.activatesAt = dim.activatesAt;
    }
    if (dim.name) out.name = dim.name;
    dimensions.push(out);
  }
  if (!dimensions.length) return null;
  return { kind: "rubric", dimensions };
}

/**
 * Count non-empty exemplars across all dimensions/levels.
 */
export function exemplarCount(rubric) {
  let n = 0;
  for (const dim of rubric?.dimensions || []) {
    if (dim?.exemplars && typeof dim.exemplars === "object") {
      for (const text of Object.values(dim.exemplars)) {
        if (text != null && String(text).trim() !== "") n += 1;
      }
    }
    for (const entry of dim?.levels || []) {
      if (entry && typeof entry === "object" && entry.exemplar != null) {
        if (String(entry.exemplar).trim() !== "") n += 1;
      }
    }
  }
  return n;
}
