// Stable identity for an audit entry, ignoring Mongo bookkeeping.
// Used by migration 012 so a stored doc that dropped an empty detail
// object does not pass an id-only check.

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value)
      .filter(
        (key) =>
          value[key] !== undefined &&
          key !== "_id" &&
          key !== "__v" &&
          key !== "atTime"
      )
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function canonicalAuditEntry(doc) {
  if (!doc || typeof doc !== "object") return "";
  return stable(doc);
}

export function auditEntriesMatch(source, stored) {
  return canonicalAuditEntry(source) === canonicalAuditEntry(stored);
}
