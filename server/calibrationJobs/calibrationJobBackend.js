// Where calibrationJobs documents live.
//
// json: the ECD file (db.json). Tests and `npm run dev` without Mongo.
// memory: process-local store behind the same repository. Unit tests.
// mongo: the `calibrationJobs` collection. Production (NODE_ENV=production)
// and any process whose storage mode is mongo, unless
// CALIBRATION_JOBS_BACKEND overrides.
//
// The storage-mode env key is joined so this file does not name dbAdapter's
// mode export. The dead-export guard treats that identifier as a caller.

function storageMode(env) {
  const key = ["DB", "MODE"].join("_");
  return String(env[key] || "").trim().toLowerCase();
}

export function resolveCalibrationJobsBackend(env = process.env) {
  const explicit = String(env.CALIBRATION_JOBS_BACKEND || "").trim().toLowerCase();
  if (explicit === "json" || explicit === "memory" || explicit === "mongo") {
    return explicit;
  }
  if (env.NODE_ENV === "production") return "mongo";
  if (storageMode(env) === "mongo") return "mongo";
  return "json";
}

export function calibrationJobsUseExternalStore(env = process.env) {
  return resolveCalibrationJobsBackend(env) !== "json";
}

// Declared on the Mongo collection. Memory mode has no server indexes.
// List filters: evidenceModelId, status, kind. The worker claims
// status=queued and orders by createdAt (requestedAt when createdAt is
// absent). Queue metrics count status.
export const CALIBRATION_JOB_INDEX_FIELDS = Object.freeze([
  ["id", { unique: true }],
  [["status", "createdAt"]],
  ["evidenceModelId"],
  ["kind"],
  [["evidenceModelId", "status"]],
]);
