// src/utils/db-server.js
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  applyTenancyToDb,
  isTenantScopedCollection,
  mergeScopedDbSave,
} from "../../server/utils/tenancyScope.js";
import { getTenancyContext } from "../../server/utils/tenancyContext.js";
import {
  applySaveAudits,
  auditBaseline,
  pushAuditEvent,
  makeAuditEntry,
} from "../../server/utils/auditLog.js";
import { sessionsUseExternalStore } from "../../server/sessions/sessionBackend.js";
import {
  appendAuditEntries,
  auditLogUseExternalStore,
} from "../../server/auditLog/auditRepository.js";
import { calibrationJobsUseExternalStore } from "../../server/calibrationJobs/calibrationJobBackend.js";
import { analysisArtefactsUseExternalStore } from "../../server/analysisArtefacts/analysisArtefactBackend.js";
import { studentModelRecordsUseExternalStore } from "../../server/studentModelRecords/studentModelRecordBackend.js";

function dbFilePath() {
  return process.env.ECD_DB_FILE || path.join(process.cwd(), "db.json");
}

export function backupDirPath() {
  return process.env.ECD_BACKUP_DIR || path.join(path.dirname(dbFilePath()), "backups");
}

// ------------------------------
// Helpers: atomic write + backup
// ------------------------------

function atomicWrite(filePath, dataStr) {
  const tmp = `${filePath}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, dataStr);
  fs.renameSync(tmp, filePath);
}

// db.json.<ISO> with ":" and "." written as "-". Same stamp saveDB has
// always used. Other names in the backup folder are not snapshots.
const SNAPSHOT_NAME = /^db\.json\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)$/;

function envNonNegative(name, fallback) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function snapshotStamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function snapshotInstantMs(name) {
  const match = SNAPSHOT_NAME.exec(name);
  if (!match) return null;
  const iso = match[1].replace(
    /T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    "T$1:$2:$3.$4Z"
  );
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function listCrashSnapshots(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const ms = snapshotInstantMs(name);
    if (ms == null) continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    out.push({ name, full, ms });
  }
  return out;
}

function snapshotNow(options = {}) {
  if (options.now == null) return new Date();
  const now = options.now instanceof Date ? options.now : new Date(options.now);
  if (Number.isNaN(now.getTime())) return new Date();
  return now;
}

/**
 * Crash copy of the current db file. Cadence is ECD_SNAPSHOT_INTERVAL_MS
 * (default 300000). Retention keeps the newest ECD_SNAPSHOT_KEEP files
 * (default 20) whose names are db.json.<timestamp>. Encrypted full backups,
 * meta sidecars, and any other name in the folder are left alone.
 * runFullBackup does not call this; that path stays unthrottled.
 *
 * @param {{ now?: Date | number | string }} [options]
 */
function backupDB(options = {}) {
  const dir = backupDirPath();
  const dbFile = dbFilePath();
  fs.mkdirSync(dir, { recursive: true });
  const interval = envNonNegative("ECD_SNAPSHOT_INTERVAL_MS", 300_000);
  const keep = envNonNegative("ECD_SNAPSHOT_KEEP", 20);
  const now = snapshotNow(options);
  const nowMs = now.getTime();
  const existing = listCrashSnapshots(dir);
  let newest = null;
  for (const row of existing) {
    if (newest == null || row.ms > newest) newest = row.ms;
  }
  const due = newest == null || nowMs - newest >= interval;
  if (due && fs.existsSync(dbFile)) {
    const dest = path.join(dir, `db.json.${snapshotStamp(now)}`);
    fs.copyFileSync(dbFile, dest);
  }
  const after = due ? listCrashSnapshots(dir) : existing;
  after.sort((a, b) => b.ms - a.ms || (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  for (const row of after.slice(keep)) {
    fs.unlinkSync(row.full);
  }
}

// ------------------------------
// Default structure
// ------------------------------

function defaultDB() {
  return {
    items: [],
    evidenceModels: [],
    tasks: [],
    sessions: [],
    studentModelRecords: [],
    competencyModels: [],
    competencies: [],   // ✅ added
    taskModels: [],
    taskModelVariables: [],
    workProducts: [],
    rubrics: [],
    templates: [],
    psychometricReportTemplates: [],
    taskSpecs: [],
    deliveryModels: [],
    designPatterns: [],
    students: [],
    questions: [],      // ✅ added
    calibrationJobs: [],
    analysisArtefacts: [],
    announcements: [],
    auditLog: [],
  };
}

// ------------------------------
// Load & Save DB
// ------------------------------

/**
 * Previous-state cache so saveDB does not parse the file a second time.
 *
 * { obj, mtimeMs, size, file, kind }
 * kind "baseline": obj is auditBaseline(db). Used when the caller is
 *   unscoped (admin, cron, tests). applySaveAudits only reads those fields.
 *   loadDB returns the parsed object itself for an admin, and routes mutate
 *   it in place, so the cache must not be that reference.
 * kind "full": obj is the whole pre-mutation file. Scoped saveDB passes
 *   previous into mergeScopedDbSave, which copies hidden tenant rows onto
 *   the write. A baseline would drop them. The parsed object is stored
 *   here and is not returned. The caller gets a deep copy of the visible
 *   graph (shareClone of applyTenancyToDb). Hidden rows stay only in obj.
 *   Strings are shared; objects and arrays are not, so an in-place edit of
 *   a visible row cannot change obj.
 *
 * A hit is fs.statSync mtimeMs and size still equal. Anything else re-reads.
 * Two writes in the same millisecond with the same byte length can false-hit.
 * That window is the stat check the save path was given.
 */
let rawCache = {
  file: null,
  mtimeMs: null,
  size: null,
  kind: null,
  obj: null,
};

function isScopedTenancy(ctx = getTenancyContext()) {
  return Boolean(ctx && !ctx.unscoped && ctx.role !== "admin");
}

function shareClone(value, seen = new WeakMap()) {
  if (typeof value === "function" || value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  const hit = seen.get(value);
  if (hit) return hit;
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    seen.set(value, out);
    for (let i = 0; i < value.length; i++) out[i] = shareClone(value[i], seen);
    return out;
  }
  const out = {};
  seen.set(value, out);
  for (const key of Object.keys(value)) {
    const child = shareClone(value[key], seen);
    if (child !== undefined) out[key] = child;
  }
  return out;
}

function statOf(file) {
  try {
    const st = fs.statSync(file);
    return { mtimeMs: st.mtimeMs, size: st.size };
  } catch {
    return null;
  }
}

function cacheMatches(file) {
  if (!rawCache.obj || rawCache.file !== file || rawCache.kind == null) return false;
  const st = statOf(file);
  if (!st) return false;
  return st.mtimeMs === rawCache.mtimeMs && st.size === rawCache.size;
}

function fillDefaults(db) {
  const base = defaultDB();
  for (const key of Object.keys(base)) {
    if (!db[key]) db[key] = base[key];
  }
  return db;
}

function parseDbFile() {
  const file = dbFilePath();
  if (!fs.existsSync(file)) {
    // Minified. Readers accept pretty and minified.
    fs.writeFileSync(file, JSON.stringify(defaultDB()));
  }
  const db = JSON.parse(fs.readFileSync(file));
  return { file, db: fillDefaults(db) };
}

function rememberRead(file, live) {
  const st = statOf(file);
  if (!st) return;
  // Stat still matches the snapshot taken at the previous read or write.
  if (cacheMatches(file)) return;
  if (isScopedTenancy()) {
    // readRawDB handed `live` to the caller. Keep a private full copy.
    rawCache = {
      file,
      mtimeMs: st.mtimeMs,
      size: st.size,
      kind: "full",
      obj: shareClone(live),
    };
    return;
  }
  rawCache = {
    file,
    mtimeMs: st.mtimeMs,
    size: st.size,
    kind: "baseline",
    obj: auditBaseline(live),
  };
}

function omitSessions(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  if (!Object.prototype.hasOwnProperty.call(obj, "sessions")) return obj;
  const copy = { ...obj };
  delete copy.sessions;
  return copy;
}

function omitAuditLog(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  if (!Object.prototype.hasOwnProperty.call(obj, "auditLog")) return obj;
  const copy = { ...obj };
  delete copy.auditLog;
  return copy;
}

function omitCalibrationJobs(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  if (!Object.prototype.hasOwnProperty.call(obj, "calibrationJobs")) return obj;
  const copy = { ...obj };
  delete copy.calibrationJobs;
  return copy;
}

function omitAnalysisArtefacts(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  if (!Object.prototype.hasOwnProperty.call(obj, "analysisArtefacts")) return obj;
  const copy = { ...obj };
  delete copy.analysisArtefacts;
  return copy;
}

function omitStudentModelRecords(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  if (!Object.prototype.hasOwnProperty.call(obj, "studentModelRecords")) return obj;
  const copy = { ...obj };
  delete copy.studentModelRecords;
  return copy;
}

function omitExternalCollections(obj) {
  let next = obj;
  if (sessionsUseExternalStore()) next = omitSessions(next);
  if (auditLogUseExternalStore()) next = omitAuditLog(next);
  if (calibrationJobsUseExternalStore()) next = omitCalibrationJobs(next);
  if (analysisArtefactsUseExternalStore()) next = omitAnalysisArtefacts(next);
  if (studentModelRecordsUseExternalStore()) next = omitStudentModelRecords(next);
  return next;
}

function resealFullSnapshot(toWrite, ctx) {
  // Visible rows are the caller's objects. Clone those. Hidden rows were
  // taken from the previous snapshot and are not reachable by the caller.
  const visible = applyTenancyToDb(toWrite, ctx);
  const out = {};
  for (const key of Object.keys(toWrite)) {
    const value = toWrite[key];
    if (isTenantScopedCollection(key) && Array.isArray(value)) {
      const visibleRows = new Set(visible[key] || []);
      out[key] = value.map((row) => (visibleRows.has(row) ? shareClone(row) : row));
    } else {
      out[key] = shareClone(value);
    }
  }
  return out;
}

/** Unscoped disk read. Boot, merge-on-save, tests that need the full file. */
export function readRawDB() {
  const { file, db } = parseDbFile();
  rememberRead(file, db);
  return db;
}

/**
 * D97. Tenant-scoped view of the JSON store.
 * When ALS tenancy is bound, tenant-scoped collections are filtered (ADR 0006).
 * Cron / boot / tests with no ALS still see the full file.
 *
 * Scoped callers receive a deep copy of the visible graph. The cache keeps
 * the parsed file so a later saveDB can merge hidden rows without parsing
 * again and without seeing the caller's in-place edits.
 */
export function loadDB() {
  const ctx = getTenancyContext();
  if (!isScopedTenancy(ctx)) return applyTenancyToDb(readRawDB());
  const file = dbFilePath();
  if (cacheMatches(file) && rawCache.kind === "full") {
    return shareClone(applyTenancyToDb(rawCache.obj, ctx));
  }
  const { db } = parseDbFile();
  const st = statOf(file);
  rawCache = {
    file,
    mtimeMs: st ? st.mtimeMs : null,
    size: st ? st.size : null,
    kind: "full",
    obj: db,
  };
  return shareClone(applyTenancyToDb(db, ctx));
}

/**
 * D97. Merge scoped writes back onto the full file so other tenants are not wiped.
 * D101. Before write, diff against the previous raw snapshot and append
 * auditLog rows for lifecycle / ingest / parameter-set changes. Routes do
 * not import the audit module; a transition that is not logged is a
 * transition that did not happen (through this path).
 *
 * When the audit store is external, new rows are upserted there and the
 * `auditLog` key is omitted from the file. The JSON harness still writes
 * the array. An async function with no await on the json/memory path runs
 * synchronously until return, so existing un-awaited callers keep working.
 *
 * The file is minified JSON. Pretty files still parse. exportDB stays
 * indented for the download helper; that string is not the on-disk file.
 *
 * @param {object} db
 * @param {{ skipAudit?: boolean, now?: Date | number | string }} [options]
 *   `now` stamps the crash-copy filename. Tests inject it. Production omits it.
 */
export async function saveDB(db, options = {}) {
  const file = dbFilePath();
  const ctx = getTenancyContext();
  const scoped = isScopedTenancy(ctx);

  let previous;
  if (cacheMatches(file) && (rawCache.kind === "full" || !scoped)) {
    previous = rawCache.obj;
  } else {
    const disk = parseDbFile().db;
    // Fresh parse, not the caller's object. Scoped merge needs every field.
    // Unscoped only needs the audit fields.
    previous = scoped ? disk : auditBaseline(disk);
  }

  let toWrite = scoped ? mergeScopedDbSave(previous, db, ctx) : db;
  const externalSessions = sessionsUseExternalStore();
  const externalAudit = auditLogUseExternalStore();
  const externalJobs = calibrationJobsUseExternalStore();
  const externalArtefacts = analysisArtefactsUseExternalStore();
  const externalStudentModels = studentModelRecordsUseExternalStore();
  // External collections stay in their own stores. The audit diff must
  // not treat a hydrated array as the file's collection, or a job
  // already recorded on the store would be logged again.
  let auditPrev = previous;
  let auditNext = toWrite;
  if (externalSessions) {
    auditPrev = omitSessions(auditPrev);
    auditNext = omitSessions(auditNext);
  }
  if (externalJobs) {
    auditPrev = omitCalibrationJobs(auditPrev);
    auditNext = omitCalibrationJobs(auditNext);
  }
  if (externalArtefacts) {
    auditPrev = omitAnalysisArtefacts(auditPrev);
    auditNext = omitAnalysisArtefacts(auditNext);
  }
  if (externalStudentModels) {
    auditPrev = omitStudentModelRecords(auditPrev);
    auditNext = omitStudentModelRecords(auditNext);
  }
  toWrite = applySaveAudits(auditPrev, auditNext, options);
  // When merge produced a new object, mirror auditLog onto the caller's
  // db so in-memory holders (tests, bulk handlers) see the new rows.
  if (toWrite !== db && Array.isArray(toWrite.auditLog)) {
    db.auditLog = toWrite.auditLog;
  }
  const pendingAudit = externalAudit && Array.isArray(toWrite.auditLog) ? [...toWrite.auditLog] : null;
  const diskWrite = omitExternalCollections(toWrite);
  backupDB({ now: options.now });
  atomicWrite(file, JSON.stringify(diskWrite));
  const st = statOf(file);
  if (scoped) {
    rawCache = {
      file,
      mtimeMs: st ? st.mtimeMs : null,
      size: st ? st.size : null,
      kind: "full",
      obj: resealFullSnapshot(diskWrite, ctx),
    };
  } else {
    rawCache = {
      file,
      mtimeMs: st ? st.mtimeMs : null,
      size: st ? st.size : null,
      kind: "baseline",
      obj: auditBaseline(diskWrite),
    };
  }
  if (pendingAudit?.length) {
    await appendAuditEntries(pendingAudit);
  }
}

/** Drop the previous-state cache after an out-of-band rewrite of the file. */
export function forgetDbCache() {
  rawCache = {
    file: null,
    mtimeMs: null,
    size: null,
    kind: null,
    obj: null,
  };
}

/**
 * D101 — append one audit row for events outside the JSON entity save
 * path (auth failures, dbAdapter user/role/tenant changes).
 * External audit store: upsert the row without rewriting db.json.
 *
 * @param {{ action: string, entity?: object, detail?: object, actor?: object }} partial
 */
export async function recordAuditEvent(partial) {
  if (auditLogUseExternalStore()) {
    const entry = makeAuditEntry(partial);
    await appendAuditEntries([entry]);
    return entry;
  }
  const db = readRawDB();
  const entry = pushAuditEvent(db, partial);
  await saveDB(db, { skipAudit: true });
  return entry;
}

export function clearDB() {
  rawCache = {
    file: null,
    mtimeMs: null,
    size: null,
    kind: null,
    obj: null,
  };
  const DB_FILE = dbFilePath();
  if (fs.existsSync(DB_FILE)) {
    fs.unlinkSync(DB_FILE);
  }
}

// ------------------------------
// Generic CRUD helpers
// ------------------------------

export function getAll(collection) {
  const db = loadDB();
  return db[collection] || [];
}

export function getById(collection, id) {
  const db = loadDB();
  return (db[collection] || []).find((item) => item.id === id);
}

export function insert(collection, item) {
  const db = loadDB();
  db[collection] = db[collection] || [];
  const newItem = { id: uuidv4(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...item };
  db[collection].push(newItem);
  saveDB(db);
  return newItem;
}

export function update(collection, id, updates) {
  const db = loadDB();
  db[collection] = db[collection] || [];
  const index = db[collection].findIndex((item) => item.id === id);
  if (index !== -1) {
    db[collection][index] = { ...db[collection][index], ...updates, updatedAt: new Date().toISOString() };
    saveDB(db);
    return db[collection][index];
  }
  return null;
}

export function remove(collection, id) {
  const db = loadDB();
  db[collection] = db[collection] || [];
  db[collection] = db[collection].filter((item) => item.id !== id);
  saveDB(db);
}

// ------------------------------
// Session-specific helpers
// ------------------------------

export function createSession(studentId, tasks) {
  return insert("sessions", {
    studentId,
    tasks,
    currentTaskIndex: 0,
    responses: [],
    isCompleted: false,
    startedAt: new Date().toISOString(),
  });
}

export function updateSessionProgress(sessionId, currentTaskIndex) {
  return update("sessions", sessionId, {
    currentTaskIndex,
    updatedAt: new Date().toISOString(),
  });
}

export function addSessionResponse(sessionId, taskId, answer) {
  const session = getById("sessions", sessionId);
  if (!session) return null;

  const responses = session.responses || [];
  responses.push({
    taskId,
    answer,
    timestamp: new Date().toISOString(),
  });

  return update("sessions", sessionId, {
    responses,
    currentTaskIndex: (session.currentTaskIndex || 0) + 1,
  });
}

export function finishSession(sessionId) {
  return update("sessions", sessionId, {
    isCompleted: true,
    updatedAt: new Date().toISOString(),
  });
}

// ------------------------------
// Student helpers
// ------------------------------

export function createStudent(name) {
  return insert("students", { name });
}

export function getStudentById(studentId) {
  return getById("students", studentId);
}

export function getAllStudents() {
  return getAll("students");
}

// ------------------------------
// Migration utilities
// ------------------------------

export function renumberRootCompetencies(db) {
  if (!db.competencyModels) db.competencyModels = [];

  const roots = db.competencyModels.filter((c) => !c.parentIds?.length);
  roots.forEach((root, idx) => {
    root.modelLabel = `cm${idx + 1}`;
    assignLevels(root.id, 1, db.competencyModels);
  });
}

function assignLevels(parentId, level, all) {
  const children = all.filter((c) => c.parentIds?.includes(parentId));
  children.forEach((child) => {
    child.levelLabel = `Level ${level}`;
    assignLevels(child.id, level + 1, all);
  });
}

export function renumberRootEvidenceModels(db) {
  let counter = 1;
  db.evidenceModels.forEach((m) => {
    if (!m.modelLabel) {
      m.modelLabel = `em${counter}`;
      counter++;
    }
    if (!m.rubrics) m.rubrics = [];
  });
}

export function buildCompetencyOptions(nodes, parentId = null, level = 0) {
  const children = nodes.filter((n) => n.parentId === parentId);
  let options = [];
  children.forEach((c) => {
    const prefix = level === 0 ? `${c.modelLabel || "cm?"}:` : `Level ${level}:`;
    options.push({
      id: c.id,
      label: `${"— ".repeat(level)}${prefix} ${c.name}`,
    });
    options = options.concat(buildCompetencyOptions(nodes, c.id, level + 1));
  });
  return options;
}

export function renumberRootTasks(db) {
  if (!db.tasks) db.tasks = [];
  db.tasks.forEach((task, idx) => {
    task.modelLabel = `tm${idx + 1}`;
  });
}

// ------------------------------
// Import/Export helpers
// ------------------------------

export function exportDB() {
  const db = loadDB();
  return JSON.stringify(db, null, 2);
}

export function importDB(jsonString) {
  try {
    const db = JSON.parse(jsonString);
    saveDB(db);
    return true;
  } catch (e) {
    console.error("Failed to import DB:", e);
    return false;
  }
}
