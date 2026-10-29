// Student model record data access.
//
// JSON harness: the studentModelRecords array on the ECD db object.
// saveDB writes it. memory and mongo: one document per student and
// competency model. A session finish merges that session's history
// entry in one update so two finishes cannot drop each other's snapshot.
//
// Production uses mongo. Vitest and `npm run dev` stay on json so existing
// tests keep passing. Unit tests for this seam set
// STUDENT_MODEL_RECORDS_BACKEND=memory.

import { getTenancyContext } from "../utils/tenancyContext.js";
import { filterRows, rowVisible } from "../utils/tenancyScope.js";
import {
  commitFinishedSession,
  identityOverlaps,
  resolveStudentIdentity,
  seedSessionStudentModel,
} from "../../src/utils/studentModelRecord.js";
import {
  resolveStudentModelRecordsBackend,
  studentModelRecordsUseExternalStore,
} from "./studentModelRecordBackend.js";
import {
  mongoApplySessionFinish,
  mongoRecordFind,
  mongoRecordFindOne,
  mongoRecordReplace,
  studentModelRecordToPlain,
} from "./mongoStudentModelRecordStore.js";

const memoryDocs = new Map();

function clone(value) {
  if (value == null) return value;
  return structuredClone(value);
}

export function resetStudentModelRecordStoreForTests() {
  memoryDocs.clear();
}

export { studentModelRecordsUseExternalStore, resolveStudentModelRecordsBackend };

function aliasesOf(filter, db) {
  if (filter?.identity) {
    return (filter.identity.identityAliases || []).map((value) => String(value));
  }
  if (filter?.studentId != null && String(filter.studentId) !== "") {
    return resolveStudentIdentity(filter.studentId, db).identityAliases;
  }
  if (filter?.studentId != null) return [];
  return null;
}

function recordMatchesFilter(row, filter = {}, db) {
  if (!row) return false;
  if (filter.id != null && row.id !== filter.id) return false;
  if (filter.competencyModelId != null && row.competencyModelId !== filter.competencyModelId) {
    return false;
  }
  if (filter.sessionId != null) {
    const inHistory = (row.history || []).some((entry) => entry?.sessionId === filter.sessionId);
    const inProvenance = row.provenance?.sessionId === filter.sessionId;
    if (!inHistory && !inProvenance) return false;
  }
  const aliases = aliasesOf(filter, db);
  if (aliases) {
    const identity = filter.identity || { identityAliases: aliases };
    if (!identityOverlaps(identity, row)) return false;
  }
  if (filter.districtId != null && String(row.districtId || "") !== String(filter.districtId)) {
    return false;
  }
  return true;
}

function mongoFilterFrom(filter = {}, db) {
  const query = {};
  const groups = [];
  if (filter.id != null) query.id = filter.id;
  if (filter.competencyModelId != null) query.competencyModelId = filter.competencyModelId;
  if (filter.districtId != null) query.districtId = filter.districtId;
  if (filter.sessionId != null) {
    groups.push({
      $or: [
        { "history.sessionId": filter.sessionId },
        { "provenance.sessionId": filter.sessionId },
      ],
    });
  }
  const aliases = aliasesOf(filter, db);
  if (aliases?.length) {
    groups.push({
      $or: [
        { studentId: { $in: aliases } },
        { identityAliases: { $in: aliases } },
      ],
    });
  }
  if (groups.length === 1) Object.assign(query, groups[0]);
  else if (groups.length > 1) query.$and = groups;
  return query;
}

function applyTenancy(rows, db, filter) {
  if (filter?.unscoped) return rows;
  return filterRows(
    "studentModelRecords",
    rows,
    getTenancyContext(),
    db || { studentModelRecords: rows }
  );
}

async function readStoredRecords(filter, db) {
  if (resolveStudentModelRecordsBackend() === "mongo") {
    const rows = await mongoRecordFind(mongoFilterFrom(filter, db));
    return rows.filter((row) => recordMatchesFilter(row, filter, db));
  }
  return [...memoryDocs.values()]
    .filter((row) => recordMatchesFilter(row, filter, db))
    .map(clone);
}

export async function queryStudentModelRecords(db, filter = {}) {
  if (!studentModelRecordsUseExternalStore()) {
    return (db?.studentModelRecords || []).filter((row) => recordMatchesFilter(row, filter, db));
  }
  const rows = await readStoredRecords(filter, db);
  return applyTenancy(rows, db, filter);
}

export async function getStudentModelRecordById(db, id) {
  if (id == null) return null;
  if (!studentModelRecordsUseExternalStore()) {
    return (db?.studentModelRecords || []).find((row) => row && row.id === id) || null;
  }
  const row =
    resolveStudentModelRecordsBackend() === "mongo"
      ? await mongoRecordFindOne(id)
      : memoryDocs.has(id)
        ? clone(memoryDocs.get(id))
        : null;
  if (!row) return null;
  const ctx = getTenancyContext();
  const peer = db || { studentModelRecords: [row] };
  if (!rowVisible("studentModelRecords", row, ctx, peer)) return null;
  return row;
}

function latestSnapshot(history) {
  return (history || []).reduce((best, row) => {
    if (!row) return best;
    if (!best) return row;
    return String(row.timestamp) >= String(best.timestamp) ? row : best;
  }, null);
}

// Pure merge used by the memory store. Mongo runs the same rules inside
// one findOneAndUpdate so a concurrent finish cannot replace the document.
function applySessionFinishToRecord(current, computed, sessionId) {
  const entry = (computed?.history || []).find((row) => row && row.sessionId === sessionId);
  if (!computed?.id || !entry) return current ? clone(current) : null;
  const base = current ? clone(current) : {};
  const history = (Array.isArray(base.history) ? base.history : []).filter(
    (row) => row && row.sessionId !== sessionId
  );
  history.push(clone(entry));
  const latest = latestSnapshot(history);
  return {
    ...base,
    ...clone(computed),
    id: base.id || computed.id,
    createdAt: base.createdAt || computed.createdAt,
    competencyModelName: computed.competencyModelName || base.competencyModelName || "",
    history,
    smvPosteriors: clone(latest?.posteriorSnapshot || {}),
  };
}

function remember(record) {
  const clean = studentModelRecordToPlain(clone(record)) || clone(record);
  memoryDocs.set(clean.id, clean);
  return clone(clean);
}

function naturalKeyMatch(record) {
  if (!record?.studentId || !record?.competencyModelId) return null;
  for (const row of memoryDocs.values()) {
    if (
      row.studentId === record.studentId &&
      row.competencyModelId === record.competencyModelId
    ) {
      return row;
    }
  }
  return null;
}

function commitMemory(db, session, options) {
  const identity = resolveStudentIdentity(session?.studentId, db);
  const existing = [...memoryDocs.values()]
    .filter((row) => identityOverlaps(identity, row))
    .map(clone);
  const scratch = { ...db, studentModelRecords: existing };
  const updated = commitFinishedSession(scratch, session, options);
  const stored = [];
  for (const computed of updated) {
    const prior = memoryDocs.get(computed.id) || naturalKeyMatch(computed);
    const merged = applySessionFinishToRecord(prior, computed, session.id);
    if (!merged?.id) continue;
    stored.push(remember(merged));
  }
  return stored;
}

function finishFields(record) {
  const scalars = { ...record };
  delete scalars.history;
  delete scalars.smvPosteriors;
  delete scalars.id;
  delete scalars._id;
  delete scalars.__v;
  return scalars;
}

function isDuplicateKey(err) {
  return err?.code === 11000 || err?.cause?.code === 11000;
}

async function applyMongoFinish(record, entry) {
  const fields = finishFields(record);
  const byNaturalKey = {
    filter: {
      studentId: record.studentId,
      competencyModelId: record.competencyModelId,
    },
    entry,
    fields,
    insertId: record.id,
    upsert: true,
  };
  try {
    const saved = await mongoApplySessionFinish({
      filter: { id: record.id },
      entry,
      fields,
      insertId: record.id,
      upsert: false,
    });
    if (saved) return saved;
    return await mongoApplySessionFinish(byNaturalKey);
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    return mongoApplySessionFinish(byNaturalKey);
  }
}

async function commitMongo(db, session, options) {
  const identity = resolveStudentIdentity(session?.studentId, db);
  const existing = await readStoredRecords({ identity, unscoped: true }, db);
  const scratch = { ...db, studentModelRecords: existing.map(clone) };
  const updated = commitFinishedSession(scratch, session, options);
  const stored = [];
  for (const computed of updated) {
    const entry = (computed.history || []).find((row) => row && row.sessionId === session.id);
    if (!entry) continue;
    const saved = await applyMongoFinish(computed, entry);
    if (!saved?.id) continue;
    stored.push(remember(saved));
  }
  return stored;
}

export async function commitFinishedStudentModel(db, session, options = {}) {
  if (!studentModelRecordsUseExternalStore()) {
    return commitFinishedSession(db, session, options);
  }
  if (!db || !session) return [];
  if (resolveStudentModelRecordsBackend() === "memory") {
    return commitMemory(db, session, options);
  }
  return commitMongo(db, session, options);
}

export async function seedStoredSessionStudentModel(session, db, options = {}) {
  if (!studentModelRecordsUseExternalStore()) {
    return seedSessionStudentModel(session, db, options);
  }
  if (!session) return session;
  const identity = resolveStudentIdentity(session.studentId, db);
  const rows = await queryStudentModelRecords(db, { identity });
  const scratch = { ...db, studentModelRecords: rows };
  return seedSessionStudentModel(session, scratch, options);
}

export async function exportAllStudentModelRecords() {
  if (!studentModelRecordsUseExternalStore()) return null;
  if (resolveStudentModelRecordsBackend() === "mongo") return mongoRecordFind({});
  return [...memoryDocs.values()].map(clone);
}

export async function upsertStudentModelRecords(docs) {
  const ids = [];
  for (const doc of docs || []) {
    if (!doc?.id) {
      throw new Error("Student model record migration refused a document with no id.");
    }
    ids.push(doc.id);
    if (resolveStudentModelRecordsBackend() === "mongo") await mongoRecordReplace(doc);
    if (resolveStudentModelRecordsBackend() !== "json") {
      const clean = studentModelRecordToPlain(clone(doc)) || clone(doc);
      memoryDocs.set(clean.id, clean);
    }
  }
  return ids;
}

export async function loadStoredStudentModelRecords(ids) {
  const want = new Set(ids || []);
  if (resolveStudentModelRecordsBackend() === "mongo") {
    const rows = await mongoRecordFind({ id: { $in: [...want] } });
    return rows.filter((row) => want.has(row.id));
  }
  const out = [];
  for (const id of want) {
    if (memoryDocs.has(id)) out.push(clone(memoryDocs.get(id)));
  }
  return out;
}
