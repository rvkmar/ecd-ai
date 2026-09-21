/**
 * D101 — unified append-only auditLog.
 *
 * Design rule: lifecycle transitions are recorded by the SAME write path
 * that persists them (saveDB), never by callers remembering to log. A
 * route that never imports this module still produces an entry when it
 * changes an entity's status through loadDB/saveDB.
 *
 * Explicit recordAuditEvent() is reserved for events that never touch
 * the JSON entity store (auth failures) or that dbAdapter owns (users).
 */
import { randomUUID } from "crypto";
import { STATUS, CALIBRATION_JOB_STATUS } from "./lifecycleMatrix.js";
import { getAuditActor, getAuditRequestId } from "./auditContext.js";
import { logger } from "./logger.js";

/** Authored entities on the shared STATUS machine. */
const LIFECYCLE_ENTITY_COLLECTIONS = Object.freeze([
  "competencyModels",
  "evidenceModels",
  "taskModels",
  "items",
  "assemblyModels",
  "qMatrixModels",
  "presentationModels",
  "policies",
  "curricularPolicies",
]);

const STATUS_SET = new Set(STATUS);
const JOB_STATUS_SET = new Set(CALIBRATION_JOB_STATUS);

/**
 * @param {{
 *   action: string,
 *   entity?: { collection?: string, id?: string, version?: number|null },
 *   detail?: object,
 *   actor?: { userId?: string, role?: string } | null,
 *   requestId?: string | null,
 *   at?: string,
 *   id?: string,
 * }} partial
 */
function buildAuditEntry(partial = {}) {
  const actorIn = partial.actor !== undefined ? partial.actor : getAuditActor();
  const requestId =
    partial.requestId !== undefined ? partial.requestId : getAuditRequestId();
  return {
    id: partial.id || `aud${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    at: partial.at || new Date().toISOString(),
    actor: {
      userId: actorIn?.userId || actorIn?.username || null,
      role: actorIn?.role || null,
    },
    action: String(partial.action || ""),
    entity: {
      collection: partial.entity?.collection ?? null,
      id: partial.entity?.id ?? null,
      version:
        partial.entity?.version !== undefined ? partial.entity.version : null,
    },
    detail: partial.detail && typeof partial.detail === "object" ? partial.detail : {},
    requestId: requestId || null,
  };
}

function indexById(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row && row.id != null) map.set(String(row.id), row);
  }
  return map;
}

function entityVersion(row) {
  if (!row || typeof row !== "object") return null;
  if (typeof row.versionNumber === "number") return row.versionNumber;
  if (typeof row.version === "number") return row.version;
  return null;
}

/**
 * Diff previous vs next DB snapshots and return audit entries for
 * lifecycle / calibration / parameter-set / create events.
 * Does not mutate either argument.
 *
 * @param {object} before
 * @param {object} after
 */
function collectSaveAudits(before, after) {
  const entries = [];
  if (!after || typeof after !== "object") return entries;

  for (const collection of LIFECYCLE_ENTITY_COLLECTIONS) {
    const prevMap = indexById(before?.[collection]);
    const nextRows = after[collection] || [];
    for (const row of nextRows) {
      if (!row?.id) continue;
      const prev = prevMap.get(String(row.id));
      const nextStatus = row.status;
      if (!prev) {
        entries.push(
          buildAuditEntry({
            action: "entity.create",
            entity: {
              collection,
              id: row.id,
              version: entityVersion(row),
            },
            detail: {
              status: nextStatus ?? null,
            },
          })
        );
        continue;
      }
      const prevStatus = prev.status;
      if (prevStatus !== nextStatus && (STATUS_SET.has(nextStatus) || STATUS_SET.has(prevStatus))) {
        entries.push(
          buildAuditEntry({
            action: "lifecycle.transition",
            entity: {
              collection,
              id: row.id,
              version: entityVersion(row),
            },
            detail: {
              from: prevStatus ?? null,
              to: nextStatus ?? null,
            },
          })
        );
      }
    }
  }

  // Calibration job status machine (queued → running → …).
  {
    const prevMap = indexById(before?.calibrationJobs);
    for (const row of after.calibrationJobs || []) {
      if (!row?.id) continue;
      const prev = prevMap.get(String(row.id));
      if (!prev) {
        entries.push(
          buildAuditEntry({
            action: "calibration_job.create",
            entity: { collection: "calibrationJobs", id: row.id, version: null },
            detail: { status: row.status ?? null, kind: row.kind ?? null },
          })
        );
        continue;
      }
      if (prev.status !== row.status && (JOB_STATUS_SET.has(row.status) || JOB_STATUS_SET.has(prev.status))) {
        entries.push(
          buildAuditEntry({
            action: "calibration_job.transition",
            entity: { collection: "calibrationJobs", id: row.id, version: null },
            detail: { from: prev.status ?? null, to: row.status ?? null, kind: row.kind ?? null },
          })
        );
      }
      if (!prev.ingestedParameterSetId && row.ingestedParameterSetId) {
        entries.push(
          buildAuditEntry({
            action: "calibration.ingest",
            entity: { collection: "calibrationJobs", id: row.id, version: null },
            detail: {
              parameterSetId: row.ingestedParameterSetId,
              evidenceModelId: row.evidenceModelId ?? null,
            },
          })
        );
      }
      if (!prev.ingestedAnalysisArtefactId && row.ingestedAnalysisArtefactId) {
        entries.push(
          buildAuditEntry({
            action: "calibration.ingest",
            entity: { collection: "calibrationJobs", id: row.id, version: null },
            detail: {
              analysisArtefactId: row.ingestedAnalysisArtefactId,
              evidenceModelId: row.evidenceModelId ?? null,
            },
          })
        );
      }
    }
  }

  // Active parameter-set pointer changes (ingest or activate-parameter-set).
  {
    const prevMap = indexById(before?.evidenceModels);
    for (const em of after.evidenceModels || []) {
      if (!em?.id) continue;
      const prev = prevMap.get(String(em.id));
      if (!prev) continue;
      const prevSms = indexById(prev.statisticalModels);
      for (const sm of em.statisticalModels || []) {
        if (!sm?.id) continue;
        const prevSm = prevSms.get(String(sm.id));
        const prevActive = prevSm?.activeParameterSetId ?? null;
        const nextActive = sm.activeParameterSetId ?? null;
        if (prevActive !== nextActive) {
          entries.push(
            buildAuditEntry({
              action: "parameter_set.replace",
              entity: {
                collection: "evidenceModels",
                id: em.id,
                version: entityVersion(em),
              },
              detail: {
                statisticalModelId: sm.id,
                from: prevActive,
                to: nextActive,
              },
            })
          );
        }
      }
    }
  }

  return entries;
}

/**
 * Append collected audits onto `db.auditLog` (mutates db).
 * @param {object} db
 * @param {object[]} entries
 */
function appendAuditsToDb(db, entries) {
  if (!entries?.length) return db;
  db.auditLog = Array.isArray(db.auditLog) ? db.auditLog : [];
  for (const entry of entries) {
    db.auditLog.push(entry);
  }
  return db;
}

/**
 * Apply save-path auditing: diff before→after, append entries, return db.
 * Skips when `options.skipAudit` is true (used by recordAuditEvent itself).
 *
 * @param {object} before raw DB before write
 * @param {object} after DB about to be written
 * @param {{ skipAudit?: boolean }} [options]
 */
export function applySaveAudits(before, after, options = {}) {
  if (options.skipAudit) return after;
  const entries = collectSaveAudits(before, after);
  if (!entries.length) return after;
  // Prefer mutating the same object routes already hold so in-memory
  // fixtures see the audit rows without a second load.
  appendAuditsToDb(after, entries);
  // D103: structured log for lifecycle transitions (ids only).
  for (const entry of entries) {
    if (entry.action === "lifecycle.transition") {
      logger.info("lifecycle.transition", {
        collection: entry.entity?.collection,
        entityId: entry.entity?.id,
        from: entry.detail?.from,
        to: entry.detail?.to,
      });
    }
  }
  return after;
}

/** Sync variant for paths that already hold a db and will saveDB themselves. */
export function pushAuditEvent(db, partial) {
  const entry = buildAuditEntry(partial);
  db.auditLog = Array.isArray(db.auditLog) ? db.auditLog : [];
  db.auditLog.push(entry);
  return entry;
}
