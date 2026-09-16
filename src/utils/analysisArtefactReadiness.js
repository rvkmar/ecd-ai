// src/utils/analysisArtefactReadiness.js
// Client-side readiness mirror for analysisArtefacts (artefact 6 of the
// seven-artefact contract). Independent of validateEntity — a drift test
// asserts the two land in the same place.

import { ANALYSIS_ARTEFACT_KIND_VALUES } from "./ecdVocabulary.js";

export function analysisArtefactReadiness(artefact, db) {
  const checks = [];

  const idOk = Boolean(artefact?.id);
  checks.push({
    id: "id",
    ok: idOk,
    message: idOk ? "id is present" : "id is required",
  });

  const kindOk = ANALYSIS_ARTEFACT_KIND_VALUES.includes(artefact?.kind);
  checks.push({
    id: "kind",
    ok: kindOk,
    message: kindOk
      ? "Kind is an analysis artefact kind"
      : `Unknown or missing kind '${artefact?.kind || ""}'`,
  });

  const jobOk = Boolean(artefact?.jobId);
  checks.push({
    id: "jobId",
    ok: jobOk,
    message: jobOk ? "jobId is present" : "jobId is required",
  });

  if (db && artefact?.jobId) {
    const found = Boolean(db.calibrationJobs?.find((j) => j.id === artefact.jobId));
    checks.push({
      id: "jobExists",
      ok: found,
      message: found ? "Calibration job exists" : `Unknown jobId '${artefact.jobId}'`,
    });
  }

  const scope = artefact?.scope;
  const scopeOk = Boolean(scope && typeof scope === "object" && !Array.isArray(scope));
  checks.push({
    id: "scope",
    ok: scopeOk,
    message: scopeOk ? "scope is an object" : "scope is required and must be an object",
  });

  const emOk = Boolean(scope?.evidenceModelId);
  checks.push({
    id: "scope.evidenceModelId",
    ok: emOk,
    message: emOk ? "scope.evidenceModelId is present" : "scope.evidenceModelId is required",
  });

  if (db && scope?.evidenceModelId) {
    const found = Boolean(db.evidenceModels?.find((m) => m.id === scope.evidenceModelId));
    checks.push({
      id: "evidenceModelExists",
      ok: found,
      message: found
        ? "Evidence model exists"
        : `Unknown scope.evidenceModelId '${scope.evidenceModelId}'`,
    });
  }

  const pkgOk = typeof artefact?.packageVersion === "string" && artefact.packageVersion.length > 0;
  checks.push({
    id: "packageVersion",
    ok: pkgOk,
    message: pkgOk ? "packageVersion is present" : "packageVersion is required",
  });

  const nOk = typeof artefact?.sampleSize === "number" && artefact.sampleSize > 0;
  checks.push({
    id: "sampleSize",
    ok: nOk,
    message: nOk ? "sampleSize is positive" : "sampleSize must be a positive number",
  });

  const computedOk = Boolean(artefact?.computedAt);
  checks.push({
    id: "computedAt",
    ok: computedOk,
    message: computedOk ? "computedAt is present" : "computedAt is required",
  });

  const payloadOk =
    Boolean(artefact?.payload) &&
    typeof artefact.payload === "object" &&
    !Array.isArray(artefact.payload);
  checks.push({
    id: "payload",
    ok: payloadOk,
    message: payloadOk ? "payload is an object" : "payload is required and must be an object",
  });

  const createdOk = Boolean(artefact?.createdAt);
  checks.push({
    id: "createdAt",
    ok: createdOk,
    message: createdOk ? "createdAt is present" : "createdAt is required",
  });

  return { ready: checks.every((c) => c.ok), checks };
}
