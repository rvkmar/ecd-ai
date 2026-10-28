// server/delivery/presentationModelResolution.js
//
// D114 (W23): resolve the Presentation Model overlay for delivery.
//
// ADR 0008: bake only a presentationModelId pointer on the composite
// library package — never copy accessibility / navigation / conditional
// display into compositeLibrary.items[]. Live delivery re-reads the
// authored record so a confirmed edit takes effect without recompile.
//
// SessionPlayer reads layout, review, feedback, and the extra-time factor
// from the overlay this module returns. timeMultiplier is additive: R2's
// deadline helper should multiply administration.timeLimitMinutes by
// presentationTimeMultiplier(overlay). The player does not multiply the
// clock. It shows the deadline the server stored.

/**
 * Extra-time factor for a presentation record or a resolved overlay.
 * Accepts the authored accessibility.timeMultiplier or the additive
 * overlay.timeMultiplier field. Out of range, missing, or no model is 1,
 * which leaves a deadline unchanged.
 *
 * R2's deadline helper should consume it once, at session create:
 *   effectiveMinutes = timeLimitMinutes * presentationTimeMultiplier(overlay)
 *   endTime = startedAt + effectiveMinutes
 * Persist that endTime on the session. The player displays endTime as the
 * remaining time. The default return is 1, so a missing model leaves the
 * time limit unchanged.
 */
export function presentationTimeMultiplier(source) {
  const raw =
    source?.timeMultiplier ??
    source?.accessibility?.timeMultiplier ??
    source?.overlay?.timeMultiplier ??
    source?.overlay?.accessibility?.timeMultiplier;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 1 && raw <= 3) {
    return raw;
  }
  return 1;
}

/** Statuses that may be pointed at by a compiled package / delivery. */
const LINKABLE_PRESENTATION_STATUSES = Object.freeze([
  "confirmed",
  "operational",
  "suspended",
]);

const STATUS_RANK = Object.freeze({
  operational: 3,
  confirmed: 2,
  suspended: 1,
});

/**
 * A Presentation Model is linkable when it is locked and in a delivery-
 * eligible status (same spirit as isInstantiableTaskModel / linkable EM).
 */
function isLinkablePresentationModel(pm) {
  if (!pm || typeof pm !== "object") return false;
  if (!pm.locked) return false;
  return LINKABLE_PRESENTATION_STATUSES.includes(pm.status);
}

/**
 * Pick the best Presentation Model id for a Task Model version to stamp
 * onto a newly compiled composite library package.
 *
 * Preference: operational > confirmed > suspended; then newest updatedAt;
 * then stable id order. Returns null when none are linkable for that
 * (taskModelId, taskModelVersion) pair.
 */
export function selectPresentationModelIdForTaskModel(db, taskModelId, taskModelVersion) {
  if (!db || !taskModelId || typeof taskModelVersion !== "number") return null;

  const candidates = (db.presentationModels || []).filter(
    (pm) =>
      isLinkablePresentationModel(pm) &&
      pm.taskModelId === taskModelId &&
      pm.taskModelVersion === taskModelVersion
  );

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const rankDiff = (STATUS_RANK[b.status] || 0) - (STATUS_RANK[a.status] || 0);
    if (rankDiff !== 0) return rankDiff;
    const aTime = Date.parse(a.updatedAt || a.createdAt || 0) || 0;
    const bTime = Date.parse(b.updatedAt || b.createdAt || 0) || 0;
    if (bTime !== aTime) return bTime - aTime;
    return String(a.id).localeCompare(String(b.id));
  });

  return candidates[0].id;
}

/**
 * Live overlay resolution for delivery.
 *
 * @param {object} db
 * @param {{
 *   presentationModelId?: string|null,
 *   taskModelId?: string|null,
 *   taskModelVersion?: number|null,
 * }} [options]
 *   - When `presentationModelId` is set (e.g. package pointer), that record
 *     is used if still linkable and still bound to the same Task Model.
 *   - Otherwise (or if the pointer is gone / no longer linkable), fall back
 *     to selectPresentationModelIdForTaskModel.
 * @returns {{
 *   ok: true,
 *   presentationModelId: string,
 *   overlay: {
 *     layout: object,
 *     conditionalDisplay: object,
 *     accessibility: object,
 *     timeMultiplier: number,
 *     name: string,
 *     status: string,
 *     taskModelId: string,
 *     taskModelVersion: number,
 *   },
 * } | { ok: false, reason: string }}
 */
export function resolvePresentationModel(db, options = {}) {
  const {
    presentationModelId = null,
    taskModelId = null,
    taskModelVersion = null,
  } = options;

  let chosenId = presentationModelId || null;
  let pm = chosenId
    ? (db.presentationModels || []).find((m) => m.id === chosenId)
    : null;

  // Pointer must still be linkable and still bound to the requested TM
  // when the caller supplied one. Otherwise fall through to live select.
  if (pm && !isLinkablePresentationModel(pm)) {
    pm = null;
    chosenId = null;
  }
  if (
    pm &&
    taskModelId &&
    (pm.taskModelId !== taskModelId ||
      (typeof taskModelVersion === "number" &&
        pm.taskModelVersion !== taskModelVersion))
  ) {
    pm = null;
    chosenId = null;
  }

  if (!pm && taskModelId && typeof taskModelVersion === "number") {
    chosenId = selectPresentationModelIdForTaskModel(db, taskModelId, taskModelVersion);
    pm = chosenId
      ? (db.presentationModels || []).find((m) => m.id === chosenId)
      : null;
  }

  if (!pm || !chosenId) {
    return {
      ok: false,
      reason: taskModelId
        ? `No linkable Presentation Model for task model '${taskModelId}' version ${taskModelVersion}.`
        : "No Presentation Model id or task model binding supplied.",
    };
  }

  // Return live fields from the authored record — never a snapshot copy
  // that would ignore a confirmed edit until recompile.
  return {
    ok: true,
    presentationModelId: chosenId,
    overlay: {
      name: pm.name,
      status: pm.status,
      taskModelId: pm.taskModelId,
      taskModelVersion: pm.taskModelVersion,
      layout: pm.layout ? { ...pm.layout } : {},
      conditionalDisplay: pm.conditionalDisplay ? { ...pm.conditionalDisplay } : {},
      accessibility: pm.accessibility ? { ...pm.accessibility } : {},
      timeMultiplier: presentationTimeMultiplier(pm),
    },
  };
}
