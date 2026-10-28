// Parameter-set lifecycle for calibration ingest.
//
// An ingested set is a candidate. Scoring and adaptive selection read
// activeParameterSetId only. A person activates a candidate through
// POST /evidenceModels/:id/activate-parameter-set. Recalibrate still
// commits a file as the active set, because that route is the person's
// commit. Sets with no status are legacy rows; the migration stamps them.

export const PARAMETER_SET_CANDIDATE = "candidate";
export const PARAMETER_SET_ACTIVE = "active";

export function isParameterSetStatus(value) {
  return value === PARAMETER_SET_CANDIDATE || value === PARAMETER_SET_ACTIVE;
}

export function markParameterSetCandidate(parameterSet) {
  if (!parameterSet || typeof parameterSet !== "object") return parameterSet;
  parameterSet.status = PARAMETER_SET_CANDIDATE;
  return parameterSet;
}

/**
 * Point the statistical model at one stored set and stamp who activated it.
 * Other sets that were marked active become candidates so a later save
 * does not see two active statuses.
 */
export function applyParameterSetActivation(statisticalModel, parameterSetId, meta = {}) {
  const sets = statisticalModel?.parameterSets || [];
  const chosen = sets.find((ps) => ps?.parameterSetId === parameterSetId);
  if (!chosen) return null;
  for (const ps of sets) {
    if (!ps || ps.parameterSetId === parameterSetId) continue;
    if (ps.status === PARAMETER_SET_ACTIVE) ps.status = PARAMETER_SET_CANDIDATE;
  }
  chosen.status = PARAMETER_SET_ACTIVE;
  chosen.activatedAt = meta.activatedAt || new Date().toISOString();
  if (meta.activatedBy) chosen.activatedBy = meta.activatedBy;
  statisticalModel.activeParameterSetId = parameterSetId;
  return chosen;
}

/**
 * Stamp status on stored sets that predate the candidate field.
 * The set named by activeParameterSetId becomes active. Every other set
 * becomes a candidate. Scoring is unchanged because the pointer is unchanged.
 * A second run finds the statuses and changes nothing.
 */
export function backfillParameterSetStatus(db) {
  const changed = [];
  for (const em of db?.evidenceModels || []) {
    for (const sm of em?.statisticalModels || []) {
      if (!sm || typeof sm !== "object") continue;
      const activeId = typeof sm.activeParameterSetId === "string" ? sm.activeParameterSetId : "";
      for (const ps of sm.parameterSets || []) {
        if (!ps || typeof ps !== "object") continue;
        if (isParameterSetStatus(ps.status)) continue;
        ps.status =
          ps.parameterSetId && ps.parameterSetId === activeId
            ? PARAMETER_SET_ACTIVE
            : PARAMETER_SET_CANDIDATE;
        changed.push([em?.id, sm?.id, ps.parameterSetId].filter(Boolean).join("/"));
      }
    }
  }
  return changed;
}
