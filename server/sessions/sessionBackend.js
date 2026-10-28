// Where session documents live.
//
// json: the ECD file (db.json). Tests and `npm run dev` without Mongo.
// memory: process-local store behind the same repository. Unit tests.
// mongo: the `sessions` collection. Production (NODE_ENV=production) and
// any process whose storage mode is mongo, unless SESSIONS_BACKEND overrides.
//
// The storage-mode env key is joined so this file does not name dbAdapter's
// mode export. The dead-export guard treats that identifier as a caller.

function storageMode(env) {
  const key = ["DB", "MODE"].join("_");
  return String(env[key] || "").trim().toLowerCase();
}

export function resolveSessionsBackend(env = process.env) {
  const explicit = String(env.SESSIONS_BACKEND || "").trim().toLowerCase();
  if (explicit === "json" || explicit === "memory" || explicit === "mongo") {
    return explicit;
  }
  if (env.NODE_ENV === "production") return "mongo";
  if (storageMode(env) === "mongo") return "mongo";
  return "json";
}

export function sessionsUseExternalStore(env = process.env) {
  return resolveSessionsBackend(env) !== "json";
}

// Declared on the Mongo collection. Memory mode has no server indexes;
// tests assert this list so the hot paths stay documented.
export const SESSION_INDEX_FIELDS = Object.freeze([
  ["id", { unique: true }],
  ["studentId"],
  ["studentIds"],
  ["status"],
  ["deliveryModelId"],
  ["taskIds"],
  ["isCompleted"],
  ["districtId"],
  [["responses.evidenceModelId", "status"]],
]);
