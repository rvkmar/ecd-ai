// Stable identity for a session document, ignoring Mongo bookkeeping.
// Used by migration 011 so a stored doc that dropped an empty object
// (studentModel.smvPosteriors = {}) does not pass an id-only check.

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined && key !== "_id" && key !== "__v")
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function canonicalSession(doc) {
  if (!doc || typeof doc !== "object") return "";
  return stable(doc);
}

export function sessionsMatch(source, stored) {
  return canonicalSession(source) === canonicalSession(stored);
}
