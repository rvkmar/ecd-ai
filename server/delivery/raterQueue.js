// server/delivery/raterQueue.js
//
// D124: rater-facing projections. Measurement constraints (not UI prefs):
//   - never expose automated/provisional results before the human rates
//   - never expose examinee identity
// Staff inspect / Accumulation honesty (D123 pendingHumanRatings) stays
// separate — this module is what the HumanRatingQueue may call.

import { EVALUATION_STATUS } from "./evaluationPhases.js";

const PENDING_STATUSES = new Set([
  EVALUATION_STATUS.PENDING_HUMAN,
  EVALUATION_STATUS.PENDING_ADJUDICATION,
]);

/**
 * Blinded queue row for one pending response. No provisional / automated
 * boolean; no student identity. Rubric id (if any) is safe to surface so
 * the UI can load exemplars.
 */
export function blindedQueueRow(session, response, responseIndex) {
  if (!session || !response || !PENDING_STATUSES.has(response.evaluationStatus)) {
    return null;
  }
  const pendingPhase = response.pendingPhase
    ? {
        order: response.pendingPhase.order,
        kind: response.pendingPhase.kind,
        rubricId: response.pendingPhase.rubricId ?? null,
        // adjudicationRule is process metadata, not an automated score.
        adjudicationRule: response.pendingPhase.adjudicationRule ?? null,
      }
    : null;

  const row = {
    sessionId: session.id,
    responseIndex,
    taskId: response.taskId ?? null,
    itemId: response.itemId ?? null,
    observationId: response.observationId ?? null,
    evaluationStatus: response.evaluationStatus,
    pendingPhase,
    // Work product only — never the automated OV.
    workProduct:
      response.rawAnswer &&
      typeof response.rawAnswer === "object" &&
      !Array.isArray(response.rawAnswer)
        ? response.rawAnswer
        : { selected: response.rawAnswer ?? null },
  };

  // For adjudication (after a blind human rating already happened), the
  // panel may need both booleans to apply the declared rule. Only then.
  if (response.evaluationStatus === EVALUATION_STATUS.PENDING_ADJUDICATION) {
    row.adjudication = {
      automatedActivated: response.automatedPhaseResult?.activated ?? null,
      humanActivated: response.humanPhaseResult?.activated ?? null,
      adjudicationRule:
        response.pendingPhase?.adjudicationRule ||
        response.adjudicationApplied ||
        "require_agreement",
    };
  }

  return row;
}

/**
 * All pending ratings across sessions visible in the caller's scoped db.
 * Never includes studentId / provisionalActivated.
 */
export function blindedRatingQueueFromSessions(sessions) {
  const out = [];
  for (const session of sessions || []) {
    (session.responses || []).forEach((response, responseIndex) => {
      const row = blindedQueueRow(session, response, responseIndex);
      if (row) out.push(row);
    });
  }
  return out;
}

/**
 * Resolve a library rubric for the rater card (dimensions + exemplars).
 * Returns null when none — UI still rates activated true/false.
 */
export function rubricForPendingPhase(db, pendingPhase) {
  const rid = pendingPhase?.rubricId && String(pendingPhase.rubricId).trim();
  if (!rid) return null;
  const rubric = (db?.rubrics || []).find((r) => r?.id === rid);
  if (!rubric) return null;
  return {
    id: rubric.id,
    name: rubric.name ?? null,
    dimensions: (rubric.dimensions || []).map((d) => ({
      id: d.id,
      name: d.name,
      levels: (d.levels || []).map((l) =>
        typeof l === "object" && l != null
          ? {
              value: l.value,
              label: l.label ?? String(l.value),
              descriptor: l.descriptor ?? "",
              exemplar: l.exemplar ?? "",
            }
          : { value: l, label: String(l), descriptor: "", exemplar: "" }
      ),
      activatesAt: d.activatesAt,
    })),
  };
}
