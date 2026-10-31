// Where validityEvidence documents live.
//
// json: the ECD file (db.json). Tests and `npm run dev` without Mongo.
// memory: process-local store behind the same repository. Unit tests.
// mongo: the `validityEvidence` collection. Production
// (NODE_ENV=production) and any process whose storage mode is mongo,
// unless VALIDITY_EVIDENCE_BACKEND overrides.
//
// The storage-mode env key is joined so this file does not name dbAdapter's
// mode export. The dead-export guard treats that identifier as a caller.

function storageMode(env) {
  const key = ["DB", "MODE"].join("_");
  return String(env[key] || "").trim().toLowerCase();
}

export function resolveValidityEvidenceBackend(env = process.env) {
  const explicit = String(env.VALIDITY_EVIDENCE_BACKEND || "").trim().toLowerCase();
  if (explicit === "json" || explicit === "memory" || explicit === "mongo") return explicit;
  if (env.NODE_ENV === "production") return "mongo";
  if (storageMode(env) === "mongo") return "mongo";
  return "json";
}

export function validityEvidenceUseExternalStore(env = process.env) {
  return resolveValidityEvidenceBackend(env) !== "json";
}

// evidenceModelId + type is the panel query. analysisArtefactId is unique
// when it is a string, so one auto-linked row per analysis artefact.
export const VALIDITY_EVIDENCE_INDEX_FIELDS = Object.freeze([
  ["id", { unique: true }],
  [["evidenceModelId", "type"]],
  [
    "analysisArtefactId",
    {
      unique: true,
      partialFilterExpression: { analysisArtefactId: { $type: "string" } },
    },
  ],
]);
