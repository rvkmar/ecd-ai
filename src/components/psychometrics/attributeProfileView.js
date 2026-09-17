// D84 — helpers for attribute-profile-summary artefacts (D79).

export function attributeRowsFromArtefact(artefact) {
  const attrs = artefact?.payload?.parameters?.attributes || {};
  return Object.entries(attrs).map(([attributeId, stats]) => ({
    attributeId,
    probabilityAveragedMasteryRate: stats?.probabilityAveragedMasteryRate ?? null,
    classificationCountedMasteryRate: stats?.classificationCountedMasteryRate ?? null,
    nMaster: stats?.nMaster ?? null,
    nNonmaster: stats?.nNonmaster ?? null,
    nIndeterminate: stats?.nIndeterminate ?? null,
    nAssigned: stats?.nAssigned ?? null,
    meanExpectedClassificationAccuracy:
      stats?.meanExpectedClassificationAccuracy ?? null,
  }));
}

export function profileDistributionFromArtefact(artefact) {
  const dist = artefact?.payload?.parameters?.profileDistribution;
  return Array.isArray(dist) ? dist : [];
}

export function estimandNotesFromArtefact(artefact) {
  return artefact?.payload?.diagnostics?.estimandNotes || {};
}

export const ESTIMAND_LABELS = Object.freeze({
  probabilityAveraged:
    "Probability-averaged mastery rate (mean of posterior.estimate)",
  classificationCounted:
    "Classification-counted mastery rate (nMaster / nAssigned; indeterminate excluded)",
});
