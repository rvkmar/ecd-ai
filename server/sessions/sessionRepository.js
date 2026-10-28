// Session data access.
//
// JSON harness: callers keep using the sessions array on the ECD db object.
// bindSessions / commitSessions / replaceStoredSession are no-ops there,
// and saveDB still writes the array into db.json.
//
// memory and mongo: the array on a request db is a clone. commitSessions
// and replaceStoredSession write only the documents that changed. saveDB
// omits sessions from the file (see db-server.js).

import { getTenancyContext } from "../utils/tenancyContext.js";
import { filterRows, rowVisible } from "../utils/tenancyScope.js";
import { auditsForSessionChange } from "../utils/auditLog.js";
import {
  resolveSessionsBackend,
  sessionsUseExternalStore,
} from "./sessionBackend.js";
import {
  mongoFindIds,
  mongoLoadAll,
  mongoRemove,
  mongoReplace,
} from "./mongoSessionStore.js";

const memoryDocs = new Map();
let memoryLoaded = false;
const writeLog = [];
const boundSnap = new WeakMap();

function clone(value) {
  if (value == null) return value;
  return structuredClone(value);
}

function cacheMap() {
  return memoryDocs;
}

export function resetSessionStoreForTests() {
  memoryDocs.clear();
  memoryLoaded = false;
  writeLog.length = 0;
}

export { sessionsUseExternalStore };

function noteWrite(op, id) {
  writeLog.push({ op, id });
}

async function driverLoadAll() {
  const backend = resolveSessionsBackend();
  if (backend === "mongo") return mongoLoadAll();
  return [...memoryDocs.values()].map(clone);
}

async function driverReplace(doc) {
  const clean = clone(doc);
  delete clean._id;
  delete clean.__v;
  const backend = resolveSessionsBackend();
  if (backend === "mongo") {
    await mongoReplace(clean);
  }
  memoryDocs.set(clean.id, clone(clean));
  return clean;
}

async function driverRemove(id) {
  const backend = resolveSessionsBackend();
  if (backend === "mongo") await mongoRemove(id);
  memoryDocs.delete(id);
}

export async function ensureSessionCache() {
  if (!sessionsUseExternalStore()) return;
  if (memoryLoaded && resolveSessionsBackend() !== "mongo") return;
  if (resolveSessionsBackend() === "memory") {
    memoryLoaded = true;
    return;
  }
  if (memoryLoaded) return;
  const rows = await driverLoadAll();
  memoryDocs.clear();
  for (const row of rows) {
    if (row?.id) memoryDocs.set(row.id, clone(row));
  }
  memoryLoaded = true;
}

function visibleRows(db) {
  const rows = [...cacheMap().values()].map(clone);
  return filterRows("sessions", rows, getTenancyContext(), db || { sessions: rows });
}

export function sessionsForDependencyCheck(db) {
  if (!sessionsUseExternalStore()) return db?.sessions || [];
  if (db?._sessionsBound) return db.sessions || [];
  if (!memoryLoaded) return db?.sessions || [];
  return visibleRows(db);
}

export async function bindSessions(db) {
  if (!db || typeof db !== "object") return [];
  if (!sessionsUseExternalStore()) {
    if (!Array.isArray(db.sessions)) db.sessions = [];
    return db.sessions;
  }
  await ensureSessionCache();
  const rows = visibleRows(db);
  db.sessions = rows.map(clone);
  db._sessionsBound = true;
  boundSnap.set(db, rows.map(clone));
  return db.sessions;
}

export async function listSessions(db) {
  if (!sessionsUseExternalStore()) return db?.sessions || [];
  await ensureSessionCache();
  return visibleRows(db);
}

export async function getSessionById(db, id) {
  if (id == null) return null;
  if (!sessionsUseExternalStore()) {
    return (db?.sessions || []).find((row) => row && row.id === id) || null;
  }
  await ensureSessionCache();
  const row = cacheMap().get(id);
  if (!row) return null;
  const ctx = getTenancyContext();
  const peer = db || { sessions: [row] };
  if (!rowVisible("sessions", row, ctx, peer)) return null;
  return clone(row);
}

function rememberAudit(db, before, after) {
  const entries = auditsForSessionChange(before, after);
  if (!entries.length || !db) return;
  db.auditLog = Array.isArray(db.auditLog) ? db.auditLog : [];
  for (const entry of entries) db.auditLog.push(entry);
}

export async function replaceStoredSession(db, doc) {
  if (!doc?.id) return null;
  if (!sessionsUseExternalStore()) {
    if (!db) return doc;
    db.sessions = db.sessions || [];
    const idx = db.sessions.findIndex((row) => row && row.id === doc.id);
    if (idx >= 0) {
      if (db.sessions[idx] !== doc) db.sessions[idx] = doc;
    } else {
      db.sessions.push(doc);
    }
    return doc;
  }
  await ensureSessionCache();
  const before = cacheMap().has(doc.id) ? clone(cacheMap().get(doc.id)) : null;
  noteWrite(before ? "replace" : "insert", doc.id);
  await driverReplace(doc);
  rememberAudit(db, before, doc);
  return doc;
}

export async function commitSessions(db) {
  if (!sessionsUseExternalStore()) return [];
  if (!db || !boundSnap.has(db)) return [];
  const before = boundSnap.get(db);
  const after = Array.isArray(db.sessions) ? db.sessions : [];
  const beforeMap = new Map(before.filter((row) => row?.id).map((row) => [String(row.id), row]));
  const afterMap = new Map();
  const ops = [];
  for (const row of after) {
    if (!row?.id) continue;
    afterMap.set(String(row.id), row);
    const prev = beforeMap.get(String(row.id));
    if (!prev) ops.push({ op: "insert", doc: row });
    else if (JSON.stringify(prev) !== JSON.stringify(row)) {
      ops.push({ op: "replace", before: prev, doc: row });
    }
  }
  for (const [id, prev] of beforeMap) {
    if (!afterMap.has(id)) ops.push({ op: "delete", id: prev.id, before: prev });
  }
  for (const op of ops) {
    if (op.op === "delete") {
      noteWrite("delete", op.id);
      await driverRemove(op.id);
    } else {
      noteWrite(op.op, op.doc.id);
      await driverReplace(op.doc);
      rememberAudit(db, op.before || null, op.doc);
    }
  }
  boundSnap.set(
    db,
    after.filter((row) => row?.id).map((row) => clone(row))
  );
  return ops;
}

export async function exportAllSessions() {
  if (!sessionsUseExternalStore()) return null;
  await ensureSessionCache();
  return [...cacheMap().values()].map(clone);
}

export async function upsertSessions(docs) {
  await ensureSessionCache();
  const ids = [];
  for (const doc of docs || []) {
    if (!doc?.id) {
      throw new Error("Session migration refused a document with no id.");
    }
    ids.push(doc.id);
    await driverReplace(doc);
  }
  memoryLoaded = true;
  return ids;
}

export async function findStoredSessionIds(ids) {
  const backend = resolveSessionsBackend();
  if (backend === "mongo") return mongoFindIds(ids);
  const have = [];
  for (const id of ids) {
    if (memoryDocs.has(id)) have.push(id);
  }
  return have;
}
