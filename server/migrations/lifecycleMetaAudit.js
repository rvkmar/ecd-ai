/**
 * D102 — shared collectors for ad hoc lifecycle field → audit backfill
 * and the deferred field-removal preview.
 *
 * Source fields (scattered per entity today):
 *   - reviewMeta.submittedForReviewAt / returnedToDraftAt / submittedBy / returnedBy
 *   - operationalMeta.activatedAt / suspendedAt / suspensionReason / reactivationCount
 *   - deactivation.deactivatedAt (task model force-deactivate)
 *
 * Reconstructed audit rows never invent an actor.role. When a username was
 * stored on the meta blob (submittedBy / returnedBy), it is copied as
 * actor.userId; otherwise actor is null — admitting the historical gap.
 */

const COLLECTIONS = [
  "competencyModels",
  "evidenceModels",
  "taskModels",
  "items",
  "assemblyModels",
  "qMatrixModels",
];

function entityVersion(row) {
  if (typeof row?.versionNumber === "number") return row.versionNumber;
  if (typeof row?.version === "number") return row.version;
  return null;
}

function stableId(collection, entityId, source, at) {
  const raw = `${collection}|${entityId}|${source}|${at}`;
  const safe = raw.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
  return `aud-recon-${safe}`;
}

/**
 * Emit candidate reconstructed audit entries from one entity row.
 * @returns {object[]}
 */
function historyFromEntity(collection, row) {
  if (!row?.id) return [];
  const entries = [];
  const version = entityVersion(row);
  const baseEntity = { collection, id: row.id, version };

  const review = row.reviewMeta;
  if (review && typeof review === "object") {
    if (review.submittedForReviewAt) {
      entries.push({
        id: stableId(collection, row.id, "reviewMeta.submittedForReviewAt", review.submittedForReviewAt),
        at: review.submittedForReviewAt,
        actor: {
          userId: review.submittedBy || null,
          role: null,
        },
        action: "lifecycle.reconstructed",
        entity: baseEntity,
        detail: {
          reconstructed: true,
          source: "reviewMeta.submittedForReviewAt",
          inferredTo: "reviewed",
        },
        requestId: null,
      });
    }
    if (review.returnedToDraftAt) {
      entries.push({
        id: stableId(collection, row.id, "reviewMeta.returnedToDraftAt", review.returnedToDraftAt),
        at: review.returnedToDraftAt,
        actor: {
          userId: review.returnedBy || null,
          role: null,
        },
        action: "lifecycle.reconstructed",
        entity: baseEntity,
        detail: {
          reconstructed: true,
          source: "reviewMeta.returnedToDraftAt",
          inferredTo: "draft",
        },
        requestId: null,
      });
    }
  }

  const op = row.operationalMeta;
  if (op && typeof op === "object") {
    if (op.activatedAt) {
      entries.push({
        id: stableId(collection, row.id, "operationalMeta.activatedAt", op.activatedAt),
        at: op.activatedAt,
        actor: { userId: null, role: null },
        action: "lifecycle.reconstructed",
        entity: baseEntity,
        detail: {
          reconstructed: true,
          source: "operationalMeta.activatedAt",
          inferredTo: "operational",
          reactivationCount:
            typeof op.reactivationCount === "number" ? op.reactivationCount : undefined,
        },
        requestId: null,
      });
    }
    if (op.suspendedAt) {
      entries.push({
        id: stableId(collection, row.id, "operationalMeta.suspendedAt", op.suspendedAt),
        at: op.suspendedAt,
        actor: { userId: null, role: null },
        action: "lifecycle.reconstructed",
        entity: baseEntity,
        detail: {
          reconstructed: true,
          source: "operationalMeta.suspendedAt",
          inferredTo: "suspended",
          suspensionReason: op.suspensionReason || undefined,
        },
        requestId: null,
      });
    }
  }

  const deact = row.deactivation;
  if (deact && typeof deact === "object" && deact.deactivatedAt) {
    entries.push({
      id: stableId(collection, row.id, "deactivation.deactivatedAt", deact.deactivatedAt),
      at: deact.deactivatedAt,
      actor: { userId: null, role: null },
      action: "lifecycle.reconstructed",
      entity: baseEntity,
      detail: {
        reconstructed: true,
        source: "deactivation.deactivatedAt",
        inferredTo: "suspended",
        forced: Boolean(deact.forced),
        closedSessionCount: deact.closedSessionCount,
        reason: deact.reason || undefined,
      },
      requestId: null,
    });
  }

  return entries;
}

/**
 * All reconstructed candidates across the DB (does not mutate).
 * @param {object} db
 */
function collectReconstructedHistory(db) {
  const entries = [];
  for (const collection of COLLECTIONS) {
    for (const row of db[collection] || []) {
      entries.push(...historyFromEntity(collection, row));
    }
  }
  return entries;
}

/**
 * Entries not already present in auditLog (by stable id).
 * @param {object} db
 * @param {object[]} [candidates]
 */
export function pendingReconstructedEntries(db, candidates = collectReconstructedHistory(db)) {
  const existing = new Set((db.auditLog || []).map((e) => e.id));
  return candidates.filter((e) => !existing.has(e.id));
}

/**
 * Paths a future removal migration would delete. Does not mutate.
 * Each item: { collection, id, path, valuePreview }
 * @param {object} db
 */
export function collectRemovableLifecycleFields(db) {
  const removable = [];

  for (const collection of COLLECTIONS) {
    for (const row of db[collection] || []) {
      if (!row?.id) continue;

      if (row.reviewMeta && typeof row.reviewMeta === "object") {
        removable.push({
          collection,
          id: row.id,
          path: "reviewMeta",
          valuePreview: Object.keys(row.reviewMeta),
        });
      }
      if (row.operationalMeta && typeof row.operationalMeta === "object") {
        removable.push({
          collection,
          id: row.id,
          path: "operationalMeta",
          valuePreview: Object.keys(row.operationalMeta),
        });
      }
      if (row.deactivation && typeof row.deactivation === "object") {
        removable.push({
          collection,
          id: row.id,
          path: "deactivation",
          valuePreview: Object.keys(row.deactivation),
        });
      }
    }
  }

  return removable;
}
