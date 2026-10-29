// Audit log data access.
//
// JSON harness: the auditLog array on the ECD db object. saveDB writes it.
// memory and mongo: one document upsert per entry. List uses a filter over
// time / actor / action / entity. File and memory apply the same filter.
//
// Production uses mongo. Vitest and `npm run dev` stay on json so existing
// tests keep passing. Unit tests for this seam set AUDITLOG_BACKEND=memory.

import {
  resolveAuditLogBackend,
  auditLogUseExternalStore,
} from "./auditBackend.js";
import {
  mongoAuditFind,
  mongoAuditFindOne,
  mongoAuditInsertMany,
  auditEntryToPlain,
} from "./mongoAuditStore.js";

const memoryDocs = new Map();

async function fileAuditRows(db) {
  if (db) return Array.isArray(db.auditLog) ? db.auditLog : [];
  // Lazy import: db-server imports this module for external saves.
  const { loadDB } = await import("../../src/utils/db-server.js");
  const file = loadDB();
  return Array.isArray(file?.auditLog) ? file.auditLog : [];
}

function clone(value) {
  if (value == null) return value;
  return structuredClone(value);
}

export function resetAuditStoreForTests() {
  memoryDocs.clear();
}

export { auditLogUseExternalStore, resolveAuditLogBackend };

function entryMatchesFilter(row, filter = {}) {
  if (!row) return false;
  if (filter.id != null && row.id !== filter.id) return false;
  if (filter.entityCollection != null && row.entity?.collection !== filter.entityCollection) {
    return false;
  }
  if (filter.entityId != null && String(row.entity?.id) !== String(filter.entityId)) {
    return false;
  }
  if (filter.action != null && row.action !== filter.action) return false;
  if (filter.toStatus != null && row.detail?.to !== filter.toStatus) return false;
  if (filter.actor != null) {
    const want = String(filter.actor);
    const got = row.actor?.userId;
    if (got !== want && !(got && String(got).includes(want))) return false;
  }
  if (filter.from != null) {
    const t = Date.parse(filter.from);
    if (!Number.isNaN(t) && !(Date.parse(row.at) >= t)) return false;
  }
  if (filter.to != null) {
    const t = Date.parse(filter.to);
    if (!Number.isNaN(t) && !(Date.parse(row.at) <= t)) return false;
  }
  return true;
}

function mongoFilterFrom(filter = {}) {
  const query = {};
  if (filter.id != null) query.id = filter.id;
  if (filter.entityCollection != null) query["entity.collection"] = filter.entityCollection;
  if (filter.entityId != null) query["entity.id"] = filter.entityId;
  if (filter.action != null) query.action = filter.action;
  if (filter.toStatus != null) query["detail.to"] = filter.toStatus;
  if (filter.actor != null) {
    // Exact match on the indexed field; substring match is applied after.
    query["actor.userId"] = filter.actor;
  }
  if (filter.from != null || filter.to != null) {
    const range = {};
    if (filter.from != null) {
      const t = Date.parse(filter.from);
      if (!Number.isNaN(t)) range.$gte = new Date(filter.from).toISOString();
    }
    if (filter.to != null) {
      const t = Date.parse(filter.to);
      if (!Number.isNaN(t)) range.$lte = new Date(filter.to).toISOString();
    }
    if (Object.keys(range).length) query.at = range;
  }
  return query;
}

function sortNewestFirst(rows) {
  return [...rows].sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/**
 * List audit rows. JSON harness reads the ECD file. External stores query
 * memory or Mongo. Admin routes pass the same filter shape as today.
 */
export async function queryAuditLog(filter = {}, options = {}) {
  if (!auditLogUseExternalStore()) {
    const rows = (await fileAuditRows(options.db)).filter((row) =>
      entryMatchesFilter(row, filter)
    );
    return sortNewestFirst(rows.map(clone));
  }
  let rows;
  if (resolveAuditLogBackend() === "mongo") {
    // Substring actor match is not a Mongo equality. Fetch the equality
    // candidates (or all matching other filters) then apply the full filter.
    const mongoFilter = { ...filter };
    const actorNeedle = mongoFilter.actor;
    if (actorNeedle != null) delete mongoFilter.actor;
    rows = await mongoAuditFind(mongoFilterFrom(mongoFilter), { sort: { at: -1 } });
    if (actorNeedle != null) {
      rows = rows.filter((row) => entryMatchesFilter(row, { actor: actorNeedle }));
    }
    rows = rows.filter((row) => entryMatchesFilter(row, filter));
  } else {
    rows = [...memoryDocs.values()]
      .filter((row) => entryMatchesFilter(row, filter))
      .map(clone);
  }
  return sortNewestFirst(rows);
}

export async function getAuditEntryById(id, options = {}) {
  if (id == null) return null;
  if (!auditLogUseExternalStore()) {
    return (await fileAuditRows(options.db)).find((row) => row && row.id === id) || null;
  }
  if (resolveAuditLogBackend() === "mongo") {
    return mongoAuditFindOne(id);
  }
  return memoryDocs.has(id) ? clone(memoryDocs.get(id)) : null;
}

function writeMemory(doc) {
  const clean = auditEntryToPlain(clone(doc)) || clone(doc);
  if (!clean?.id) {
    throw new Error("Audit store refused a document with no id.");
  }
  memoryDocs.set(clean.id, clean);
  return clean;
}

/**
 * Upsert audit entries into the external store. Idempotent by id.
 * No-op when the backend is the JSON harness (saveDB owns the array).
 */
export async function appendAuditEntries(entries) {
  const list = (Array.isArray(entries) ? entries : []).filter((row) => row?.id);
  if (!list.length) return [];
  if (!auditLogUseExternalStore()) return list;
  if (resolveAuditLogBackend() === "mongo") {
    await mongoAuditInsertMany(list);
    for (const doc of list) writeMemory(doc);
    return list.map((doc) => clone(doc));
  }
  return list.map((doc) => writeMemory(doc));
}

export async function exportAllAuditEntries() {
  if (!auditLogUseExternalStore()) return null;
  if (resolveAuditLogBackend() === "mongo") {
    return mongoAuditFind({}, { sort: { at: -1 } });
  }
  return sortNewestFirst([...memoryDocs.values()].map(clone));
}

export async function upsertAuditEntries(docs) {
  const ids = [];
  for (const doc of docs || []) {
    if (!doc?.id) {
      throw new Error("Audit migration refused a document with no id.");
    }
    ids.push(doc.id);
  }
  if (resolveAuditLogBackend() === "mongo") {
    await mongoAuditInsertMany(docs);
  }
  if (resolveAuditLogBackend() !== "json") {
    for (const doc of docs || []) writeMemory(doc);
  }
  return ids;
}

export async function loadStoredAuditEntries(ids) {
  const want = new Set(ids || []);
  if (resolveAuditLogBackend() === "mongo") {
    const rows = await mongoAuditFind({ id: { $in: [...want] } });
    return rows.filter((row) => want.has(row.id));
  }
  const out = [];
  for (const id of want) {
    if (memoryDocs.has(id)) out.push(clone(memoryDocs.get(id)));
  }
  return out;
}
