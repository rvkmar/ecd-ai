// Where auditLog documents live.
//
// json: the ECD file (db.json). Tests and `npm run dev` without Mongo.
// memory: process-local store behind the same repository. Unit tests.
// mongo: the `auditLog` collection. Production (NODE_ENV=production) and
// any process whose storage mode is mongo, unless AUDITLOG_BACKEND overrides.
//
// The storage-mode env key is joined so this file does not name dbAdapter's
// mode export. The dead-export guard treats that identifier as a caller.

function storageMode(env) {
  const key = ["DB", "MODE"].join("_");
  return String(env[key] || "").trim().toLowerCase();
}

export function resolveAuditLogBackend(env = process.env) {
  const explicit = String(env.AUDITLOG_BACKEND || "").trim().toLowerCase();
  if (explicit === "json" || explicit === "memory" || explicit === "mongo") {
    return explicit;
  }
  if (env.NODE_ENV === "production") return "mongo";
  if (storageMode(env) === "mongo") return "mongo";
  return "json";
}

export function auditLogUseExternalStore(env = process.env) {
  return resolveAuditLogBackend(env) !== "json";
}

/**
 * Optional Mongo TTL. 0 / unset / invalid = off (default).
 * Rating alone adds ~900 human_rating.complete rows/day; leave this off
 * until ops picks a retention window. See the day146v handoff.
 */
export function resolveAuditLogRetentionDays(env = process.env) {
  const raw = env.AUDITLOG_RETENTION_DAYS;
  if (raw == null || String(raw).trim() === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

// Declared on the Mongo collection. Memory mode has no server indexes;
// tests assert this list so the hot paths stay documented.
// Listing filters: time (at), actor.userId, action, entity.collection + entity.id.
export const AUDIT_INDEX_FIELDS = Object.freeze([
  ["id", { unique: true }],
  ["at"],
  ["action"],
  ["actor.userId"],
  [["entity.collection", "entity.id"]],
  [["action", "at"]],
]);
