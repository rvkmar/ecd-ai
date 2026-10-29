// Stable identity for a calibrationJobs or analysisArtefacts document.
// Migration 013 compares this form so a stored doc that dropped an empty
// object inside response or payload does not pass an id-only check.

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value)
      .filter(
        (key) => value[key] !== undefined && key !== "_id" && key !== "__v"
      )
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function documentsMatch(source, stored) {
  if (!source || typeof source !== "object") return false;
  if (!stored || typeof stored !== "object") return false;
  return stable(source) === stable(stored);
}
