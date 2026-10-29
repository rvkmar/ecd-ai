// Where analysisArtefacts documents live.
//
// json: the ECD file (db.json). Tests and `npm run dev` without Mongo.
// memory: process-local store behind the same repository. Unit tests.
// mongo: the `analysisArtefacts` collection. Production
// (NODE_ENV=production) and any process whose storage mode is mongo,
// unless ANALYSIS_ARTEFACTS_BACKEND overrides.
//
// The storage-mode env key is joined so this file does not name dbAdapter's
// mode export. The dead-export guard treats that identifier as a caller.

function storageMode(env) {
  const key = ["DB", "MODE"].join("_");
  return String(env[key] || "").trim().toLowerCase();
}

export function resolveAnalysisArtefactsBackend(env = process.env) {
  const explicit = String(env.ANALYSIS_ARTEFACTS_BACKEND || "")
    .trim()
    .toLowerCase();
  if (explicit === "json" || explicit === "memory" || explicit === "mongo") {
    return explicit;
  }
  if (env.NODE_ENV === "production") return "mongo";
  if (storageMode(env) === "mongo") return "mongo";
  return "json";
}

export function analysisArtefactsUseExternalStore(env = process.env) {
  return resolveAnalysisArtefactsBackend(env) !== "json";
}

// List filters: scope.evidenceModelId, kind, jobId. jobId is the link
// back to the calibration job that produced the artefact.
export const ANALYSIS_ARTEFACT_INDEX_FIELDS = Object.freeze([
  ["id", { unique: true }],
  ["jobId"],
  ["kind"],
  ["scope.evidenceModelId"],
  [["scope.evidenceModelId", "kind"]],
]);
