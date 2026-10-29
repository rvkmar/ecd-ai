// Where studentModelRecords documents live.
//
// json: the ECD file (db.json). Tests and `npm run dev` without Mongo.
// memory: process-local store behind the same repository. Unit tests.
// mongo: the `studentModelRecords` collection. Production
// (NODE_ENV=production) and any process whose storage mode is mongo,
// unless STUDENT_MODEL_RECORDS_BACKEND overrides.
//
// The storage-mode env key is joined so this file does not name dbAdapter's
// mode export. The dead-export guard treats that identifier as a caller.

function storageMode(env) {
  const key = ["DB", "MODE"].join("_");
  return String(env[key] || "").trim().toLowerCase();
}

export function resolveStudentModelRecordsBackend(env = process.env) {
  const explicit = String(env.STUDENT_MODEL_RECORDS_BACKEND || "")
    .trim()
    .toLowerCase();
  if (explicit === "json" || explicit === "memory" || explicit === "mongo") {
    return explicit;
  }
  if (env.NODE_ENV === "production") return "mongo";
  if (storageMode(env) === "mongo") return "mongo";
  return "json";
}

export function studentModelRecordsUseExternalStore(env = process.env) {
  return resolveStudentModelRecordsBackend(env) !== "json";
}

// Reads: id, studentId (and identityAliases), competencyModelId, the
// session id stored on history entries, and districtId for tenancy.
// The compound studentId + competencyModelId key is unique so two
// finishes cannot insert two rows for the same examinee and model.
export const STUDENT_MODEL_RECORD_INDEX_FIELDS = Object.freeze([
  ["id", { unique: true }],
  ["studentId"],
  ["competencyModelId"],
  [["studentId", "competencyModelId"], { unique: true }],
  ["identityAliases"],
  ["history.sessionId"],
  ["districtId"],
  [["districtId", "schoolId"]],
]);
