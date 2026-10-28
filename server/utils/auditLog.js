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
import { traitDiagnosticDeparture } from "../../src/utils/perspectiveInheritance.js";

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

function pushTraitDiagnosticProceed(entries, collection, prev, row, before, after) {
  if (collection !== "evidenceModels") return;
  const next = traitDiagnosticDeparture(row, after);
  if (!next) return;
  const previous = prev ? traitDiagnosticDeparture(prev, before) : null;
  if (previous && JSON.stringify(previous) === JSON.stringify(next)) return;
  entries.push(
    buildAuditEntry({
      action: "coherence.proceed",
      entity: {
        collection,
        id: row.id,
        version: entityVersion(row),
      },
      detail: next,
    })
  );
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
 * `before` is either the full previous db or the structural snapshot from
 * `auditBaseline`. If a new field is read off `before`, copy it there too.
 * A missing field looks like a transition that did not happen, or like a
 * create of a row that already existed.
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
        pushTraitDiagnosticProceed(entries, collection, null, row, before, after);
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
      pushTraitDiagnosticProceed(entries, collection, prev, row, before, after);
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

  // D124: human ratings on session responses (saveDB chokepoint — routes
  // must not import this module). Ids only; never rawAnswer / names.
  {
    const prevMap = indexById(before?.sessions);
    for (const session of after.sessions || []) {
      if (!session?.id) continue;
      const prev = prevMap.get(String(session.id));
      const prevResponses = prev?.responses || [];
      const nextResponses = session.responses || [];
      for (let i = 0; i < nextResponses.length; i++) {
        const next = nextResponses[i];
        const prior = prevResponses[i];
        if (!next?.humanRatedAt) continue;
        if (prior?.humanRatedAt === next.humanRatedAt) continue;
        entries.push(
          buildAuditEntry({
            action: "human_rating.complete",
            entity: {
              collection: "sessions",
              id: session.id,
              version: null,
            },
            detail: {
              responseIndex: i,
              taskId: next.taskId ?? null,
              itemId: next.itemId ?? null,
              observationId: next.observationId ?? null,
              evaluationStatus: next.evaluationStatus ?? null,
              activated:
                typeof next.activated === "boolean" ? next.activated : null,
              ratedBy: next.humanRatedBy ?? null,
              adjudicationApplied: next.adjudicationApplied ?? null,
            },
          })
        );
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

/**
 * Unaliased copy of every field `collectSaveAudits` reads from `before`.
 * saveDB caches this for unscoped writes. Callers mutate the object
 * `loadDB` / `readRawDB` returned, so the cache cannot hold that object.
 * A full clone of a multi-megabyte session file costs as much as the parse
 * this cache exists to skip. Hidden tenant rows are not in this snapshot;
 * scoped saves keep a full snapshot instead (see db-server.js).
 *
 * @param {object} db
 */
export function auditBaseline(db) {
  const src = db && typeof db === "object" ? db : {};
  const rowsOf = (collection) =>
    Array.isArray(src[collection]) ? src[collection] : [];
  const slim = (row) => {
    if (!row || typeof row !== "object") return row;
    return {
      id: row.id,
      status: row.status,
      version: row.version,
      versionNumber: row.versionNumber,
    };
  };

  const out = {};
  for (const collection of LIFECYCLE_ENTITY_COLLECTIONS) {
    const rows = rowsOf(collection);
    if (collection === "evidenceModels") {
      out[collection] = rows.map((row) => {
        if (!row || typeof row !== "object") return row;
        return {
          ...slim(row),
          competencyId: row.competencyId,
          statisticalModels: Array.isArray(row.statisticalModels)
            ? row.statisticalModels.map((model) =>
                model && typeof model === "object"
                  ? {
                      id: model.id,
                      type: model.type,
                      active: model.active,
                      activeParameterSetId: model.activeParameterSetId,
                    }
                  : model
              )
            : [],
        };
      });
    } else if (collection === "competencyModels") {
      out[collection] = rows.map((row) => {
        if (!row || typeof row !== "object") return row;
        return {
          ...slim(row),
          domainAnalysisId: row.domainAnalysisId,
          psychologicalPerspective: row.psychologicalPerspective,
        };
      });
    } else {
      out[collection] = rows.map(slim);
    }
  }

  out.competencies = rowsOf("competencies").map((row) =>
    row && typeof row === "object" ? { id: row.id, modelId: row.modelId } : row
  );
  out.domainAnalyses = rowsOf("domainAnalyses").map((row) =>
    row && typeof row === "object"
      ? {
          id: row.id,
          name: row.name,
          psychologicalPerspective: row.psychologicalPerspective,
        }
      : row
  );
  out.calibrationJobs = rowsOf("calibrationJobs").map((row) =>
    row && typeof row === "object"
      ? {
          id: row.id,
          status: row.status,
          ingestedParameterSetId: row.ingestedParameterSetId,
          ingestedAnalysisArtefactId: row.ingestedAnalysisArtefactId,
        }
      : row
  );
  out.sessions = rowsOf("sessions").map((session) => {
    if (!session || typeof session !== "object") return session;
    return {
      id: session.id,
      responses: Array.isArray(session.responses)
        ? session.responses.map((response) =>
            response && typeof response === "object"
              ? { humanRatedAt: response.humanRatedAt }
              : response
          )
        : [],
    };
  });
  return out;
}

/** Sync variant for paths that already hold a db and will saveDB themselves. */
export function pushAuditEvent(db, partial) {
  const entry = buildAuditEntry(partial);
  db.auditLog = Array.isArray(db.auditLog) ? db.auditLog : [];
  db.auditLog.push(entry);
  return entry;
}
