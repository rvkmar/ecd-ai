// Session data access.
//
// JSON harness: the sessions array on the ECD db object. saveDB writes it.
// memory and mongo: one document read or write per call. List uses a
// query plus the tenancy filter. It does not clone the collection twice
// or stringify every session to find a diff.

import { getTenancyContext } from "../utils/tenancyContext.js";
import { filterRows, rowVisible } from "../utils/tenancyScope.js";
import { auditsForSessionChange } from "../utils/auditLog.js";
import {
  resolveSessionsBackend,
  sessionsUseExternalStore,
} from "./sessionBackend.js";
import {
  mongoFind,
  mongoFindOne,
  mongoRemove,
  mongoReplace,
  sessionToPlain,
} from "./mongoSessionStore.js";
import { EVALUATION_STATUS } from "../delivery/evaluationPhases.js";

const memoryDocs = new Map();
const writeLog = [];

function clone(value) {
  if (value == null) return value;
  return structuredClone(value);
}

export function resetSessionStoreForTests() {
  memoryDocs.clear();
  writeLog.length = 0;
}

export { sessionsUseExternalStore };

function noteWrite(op, id) {
  writeLog.push({ op, id });
}

const PENDING_RATING = [
  EVALUATION_STATUS.PENDING_HUMAN,
  EVALUATION_STATUS.PENDING_ADJUDICATION,
];

function assigneeIdsOf(row) {
  const ids = [];
  if (row?.studentId != null && row.studentId !== "") ids.push(String(row.studentId));
  for (const id of row?.studentIds || []) {
    if (id != null && id !== "") ids.push(String(id));
  }
  return ids;
}

function sessionMatchesFilter(row, filter = {}) {
  if (!row) return false;
  if (filter.id != null && row.id !== filter.id) return false;
  if (filter.status != null && row.status !== filter.status) return false;
  if (filter.statusNe != null && row.status === filter.statusNe) return false;
  if (Array.isArray(filter.statusIn) && !filter.statusIn.includes(row.status)) return false;
  if (filter.taskId != null && !(row.taskIds || []).includes(filter.taskId)) return false;
  if (filter.deliveryModelId != null && row.deliveryModelId !== filter.deliveryModelId) return false;
  if (filter.studentId != null && !assigneeIdsOf(row).includes(String(filter.studentId))) return false;
  if (Array.isArray(filter.assigneeIds) && filter.assigneeIds.length) {
    const want = new Set(filter.assigneeIds.map(String));
    if (!assigneeIdsOf(row).some((id) => want.has(id))) return false;
  }
  if (filter.pendingRating) {
    const pending = new Set(PENDING_RATING);
    if (!(row.responses || []).some((response) => pending.has(response?.evaluationStatus))) {
      return false;
    }
  }
  if (filter.evidenceModelId != null) {
    if (!(row.responses || []).some((response) => response?.evidenceModelId === filter.evidenceModelId)) {
      return false;
    }
  }
  if (filter.questionId != null) {
    if (!(row.responses || []).some((response) => response?.questionId === filter.questionId)) {
      return false;
    }
  }
  if (filter.closed) {
    const closed = new Set(["completed", "submitted", "reviewed"]);
    if (row.isCompleted !== true && !closed.has(row.status)) return false;
  }
  if (filter.dependency) {
    const taskIds = new Set(filter.dependency.taskIds || []);
    const itemIds = new Set(filter.dependency.itemIds || []);
    const viaTasks = (row.taskIds || []).some((id) => taskIds.has(id));
    const viaResponses = (row.responses || []).some(
      (response) => taskIds.has(response?.taskId) || itemIds.has(response?.itemId)
    );
    if (!viaTasks && !viaResponses) return false;
  }
  return true;
}

function mongoFilterFrom(filter = {}) {
  const query = {};
  const parts = [];
  if (filter.id != null) query.id = filter.id;
  if (filter.status != null) query.status = filter.status;
  if (filter.statusNe != null) query.status = { $ne: filter.statusNe };
  if (Array.isArray(filter.statusIn)) query.status = { $in: filter.statusIn };
  if (filter.taskId != null) query.taskIds = filter.taskId;
  if (filter.deliveryModelId != null) query.deliveryModelId = filter.deliveryModelId;
  if (filter.studentId != null) {
    parts.push({ studentId: filter.studentId }, { studentIds: filter.studentId });
  }
  if (Array.isArray(filter.assigneeIds) && filter.assigneeIds.length) {
    parts.push(
      { studentId: { $in: filter.assigneeIds } },
      { studentIds: { $in: filter.assigneeIds } }
    );
  }
  if (filter.pendingRating) {
    query["responses.evaluationStatus"] = { $in: PENDING_RATING };
  }
  if (filter.evidenceModelId != null) {
    query["responses.evidenceModelId"] = filter.evidenceModelId;
  }
  if (filter.questionId != null) {
    query["responses.questionId"] = filter.questionId;
  }
  if (filter.closed) {
    parts.push(
      { isCompleted: true },
      { status: { $in: ["completed", "submitted", "reviewed"] } }
    );
  }
  if (filter.dependency) {
    const taskIds = filter.dependency.taskIds || [];
    const itemIds = filter.dependency.itemIds || [];
    const or = [];
    if (taskIds.length) {
      or.push({ taskIds: { $in: taskIds } });
      or.push({ "responses.taskId": { $in: taskIds } });
    }
    if (itemIds.length) or.push({ "responses.itemId": { $in: itemIds } });
    if (or.length) parts.push(...or);
    else return { id: { $in: [] } };
  }
  if (parts.length === 1) Object.assign(query, parts[0]);
  else if (parts.length > 1) query.$or = parts;
  return query;
}

function applyTenancy(rows, db, filter) {
  if (filter?.unscoped) return rows;
  return filterRows("sessions", rows, getTenancyContext(), db || { sessions: rows });
}

export async function querySessions(db, filter = {}) {
  if (!sessionsUseExternalStore()) {
    // loadDB already applied tenancy to the file. Filtering again throws
    // for a staff token that has no district claim and hides rows the
    // caller already scoped.
    return (db?.sessions || []).filter((row) => sessionMatchesFilter(row, filter));
  }
  let rows;
  if (resolveSessionsBackend() === "mongo") {
    rows = await mongoFind(mongoFilterFrom(filter));
    rows = rows.filter((row) => sessionMatchesFilter(row, filter));
  } else {
    rows = [...memoryDocs.values()]
      .filter((row) => sessionMatchesFilter(row, filter))
      .map(clone);
  }
  return applyTenancy(rows, db, filter);
}

export async function ensureSessionCache() {
  // Kept so boot can call it. Reads go to Mongo or the memory map directly.
  return;
}

export function sessionsForDependencyCheck(db) {
  if (!sessionsUseExternalStore()) return db?.sessions || [];
  if (db?._sessionsBound) return db.sessions || [];
  return db?.sessions || [];
}

export async function attachEvidenceSessions(db, evidenceModelId) {
  if (!sessionsUseExternalStore()) return db?.sessions || [];
  const rows = evidenceModelId
    ? await querySessions(db, { evidenceModelId })
    : [];
  db.sessions = rows;
  db._sessionsBound = true;
  return rows;
}

export async function attachTaskModelSessions(db, taskModelId) {
  if (!sessionsUseExternalStore()) return db?.sessions || [];
  const taskIds = (db?.tasks || []).filter((task) => task?.taskModelId === taskModelId).map((task) => task.id);
  const itemIds = (db?.items || []).filter((item) => item?.taskModelId === taskModelId).map((item) => item.id);
  const rows =
    taskIds.length || itemIds.length
      ? await querySessions(db, { dependency: { taskIds, itemIds } })
      : [];
  db.sessions = rows;
  db._sessionsBound = true;
  return rows;
}

export async function attachItemSessions(db, item) {
  if (!sessionsUseExternalStore()) return db?.sessions || [];
  const taskIds = (db?.tasks || [])
    .filter((task) => task?.taskModelId && task.taskModelId === item?.taskModelId)
    .map((task) => task.id);
  const itemIds = item?.id ? [item.id] : [];
  const rows =
    taskIds.length || itemIds.length
      ? await querySessions(db, { dependency: { taskIds, itemIds } })
      : [];
  db.sessions = rows;
  db._sessionsBound = true;
  return rows;
}

export async function getSessionById(db, id) {
  if (id == null) return null;
  if (!sessionsUseExternalStore()) {
    return (db?.sessions || []).find((row) => row && row.id === id) || null;
  }
  const row =
    resolveSessionsBackend() === "mongo"
      ? await mongoFindOne(id)
      : memoryDocs.has(id)
        ? clone(memoryDocs.get(id))
        : null;
  if (!row) return null;
  const ctx = getTenancyContext();
  const peer = db || { sessions: [row] };
  if (!rowVisible("sessions", row, ctx, peer)) return null;
  return row;
}

function rememberAudit(db, before, after) {
  const entries = auditsForSessionChange(before, after);
  if (!entries.length || !db) return;
  db.auditLog = Array.isArray(db.auditLog) ? db.auditLog : [];
  for (const entry of entries) db.auditLog.push(entry);
}

async function writeDoc(doc) {
  const clean = sessionToPlain(clone(doc));
  if (resolveSessionsBackend() === "mongo") {
    await mongoReplace(clean);
  }
  if (resolveSessionsBackend() !== "json") {
    memoryDocs.set(clean.id, clone(clean));
  }
  return clean;
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
  const before =
    resolveSessionsBackend() === "mongo"
      ? await mongoFindOne(doc.id)
      : memoryDocs.has(doc.id)
        ? clone(memoryDocs.get(doc.id))
        : null;
  noteWrite(before ? "replace" : "insert", doc.id);
  await writeDoc(doc);
  rememberAudit(db, before, doc);
  return doc;
}

export async function insertStoredSessions(db, docs) {
  const list = Array.isArray(docs) ? docs : [];
  if (!sessionsUseExternalStore()) {
    if (db) {
      db.sessions = db.sessions || [];
      db.sessions.push(...list);
    }
    return list;
  }
  for (const doc of list) {
    if (!doc?.id) continue;
    noteWrite("insert", doc.id);
    await writeDoc(doc);
  }
  return list;
}

export async function deleteStoredSession(db, id) {
  if (!id) return null;
  if (!sessionsUseExternalStore()) {
    if (!db) return null;
    const idx = (db.sessions || []).findIndex((row) => row && row.id === id);
    if (idx < 0) return null;
    return db.sessions.splice(idx, 1)[0];
  }
  const before =
    resolveSessionsBackend() === "mongo" ? await mongoFindOne(id) : memoryDocs.get(id) || null;
  if (!before) return null;
  noteWrite("delete", id);
  if (resolveSessionsBackend() === "mongo") await mongoRemove(id);
  memoryDocs.delete(id);
  return before;
}

export async function deleteSessionsWithTask(db, taskId) {
  const matches = await querySessions(db, { taskId });
  if (!sessionsUseExternalStore()) {
    const drop = new Set(matches.map((row) => row.id));
    db.sessions = (db.sessions || []).filter((row) => !drop.has(row?.id));
    return matches;
  }
  for (const row of matches) {
    noteWrite("delete", row.id);
    if (resolveSessionsBackend() === "mongo") await mongoRemove(row.id);
    memoryDocs.delete(row.id);
  }
  return matches;
}

export async function exportAllSessions() {
  if (!sessionsUseExternalStore()) return null;
  if (resolveSessionsBackend() === "mongo") return mongoFind({});
  return [...memoryDocs.values()].map(clone);
}

export async function upsertSessions(docs) {
  const ids = [];
  for (const doc of docs || []) {
    if (!doc?.id) {
      throw new Error("Session migration refused a document with no id.");
    }
    ids.push(doc.id);
    await writeDoc(doc);
  }
  return ids;
}

export async function loadStoredSessions(ids) {
  const want = new Set(ids || []);
  if (resolveSessionsBackend() === "mongo") {
    const rows = await mongoFind({ id: { $in: [...want] } });
    return rows.filter((row) => want.has(row.id));
  }
  const out = [];
  for (const id of want) {
    if (memoryDocs.has(id)) out.push(clone(memoryDocs.get(id)));
  }
  return out;
}

