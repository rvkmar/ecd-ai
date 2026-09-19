/**
 * D97 — ADR 0006 row filters for tenant-scoped collections.
 * Applied by loadDB (read view) + saveDB (merge) + dbAdapter.
 */
import { getTenancyContext, TenancyError } from "./tenancyContext.js";

/** Collections that must not cross tenant boundaries (ADR 0006 §2). */
export const TENANT_SCOPED_COLLECTIONS = Object.freeze([
  "users",
  "students",
  "sessions",
  "tasks",
  "announcements",
  "analysisArtefacts",
  "calibrationJobs",
]);

export function isTenantScopedCollection(name) {
  return TENANT_SCOPED_COLLECTIONS.includes(name);
}

function assigneeIds(session) {
  const ids = new Set();
  if (session?.studentId) ids.add(String(session.studentId));
  for (const id of session?.studentIds || []) ids.add(String(id));
  return [...ids];
}

function districtOfUser(user) {
  return user?.profile?.districtId || user?.districtId || null;
}

function schoolOfUser(user) {
  return user?.profile?.schoolId || user?.schoolId || null;
}

function sessionDistrictId(session, db) {
  const ids = assigneeIds(session);
  if (!ids.length) return null;
  const students = db?.students || [];
  const users = db?.users || [];
  for (const id of ids) {
    const stu = students.find((s) => String(s.id) === id || String(s.username) === id);
    if (stu?.districtId) return String(stu.districtId);
    const user = users.find((u) => String(u.username) === id || String(u.id) === id);
    const d = districtOfUser(user);
    if (d) return String(d);
  }
  return null;
}

function rowDistrictId(collection, row, db) {
  if (!row) return null;
  switch (collection) {
    case "students":
      return row.districtId ? String(row.districtId) : null;
    case "users": {
      const d = districtOfUser(row);
      return d ? String(d) : null;
    }
    case "analysisArtefacts":
      return row.scope?.districtId ? String(row.scope.districtId) : null;
    case "calibrationJobs":
      return row.districtId
        ? String(row.districtId)
        : row.scope?.districtId
          ? String(row.scope.districtId)
          : null;
    case "announcements":
      return row.districtId ? String(row.districtId) : null;
    case "tasks":
      return row.districtId ? String(row.districtId) : null;
    case "sessions":
      return sessionDistrictId(row, db);
    default:
      return null;
  }
}

function rowSchoolId(collection, row, db) {
  if (!row) return null;
  if (collection === "users") {
    const s = schoolOfUser(row);
    return s ? String(s) : null;
  }
  if (row.schoolId) return String(row.schoolId);
  if (row.scope?.schoolId) return String(row.scope.schoolId);
  if (collection === "sessions") {
    const ids = assigneeIds(row);
    const users = db?.users || [];
    for (const id of ids) {
      const user = users.find((u) => String(u.username) === id || String(u.id) === id);
      const s = schoolOfUser(user);
      if (s) return String(s);
    }
  }
  return null;
}

function selfMatch(collection, row, username) {
  if (!username) return false;
  const u = String(username);
  if (collection === "users") return String(row.username) === u || String(row.id) === u;
  if (collection === "students")
    return String(row.id) === u || String(row.username || "") === u;
  if (collection === "sessions") return assigneeIds(row).includes(u);
  if (collection === "announcements") return String(row.createdBy || "") === u;
  if (collection === "tasks")
    return String(row.createdBy || "") === u || String(row.ownerUsername || "") === u;
  return false;
}

export function rowVisible(collection, row, ctx, db) {
  if (!ctx || ctx.unscoped || ctx.role === "admin") return true;
  if (!isTenantScopedCollection(collection)) return true;

  if (ctx.viewScope === "self") {
    return selfMatch(collection, row, ctx.username);
  }

  const rowDistrict = rowDistrictId(collection, row, db);
  const rowSchool = rowSchoolId(collection, row, db);

  if (
    (collection === "analysisArtefacts" ||
      collection === "calibrationJobs" ||
      collection === "announcements" ||
      collection === "tasks") &&
    !rowDistrict
  ) {
    return false;
  }

  if (collection === "sessions" && !rowDistrict) return false;

  if (ctx.viewScope === "school" && ctx.schoolId) {
    if (rowSchool) return rowSchool === String(ctx.schoolId);
  }

  if (!ctx.districtId) return false;
  if (!rowDistrict) return false;
  return rowDistrict === String(ctx.districtId);
}

export function assertTenancyAllowsScopedAccess(ctx) {
  if (!ctx || ctx.unscoped || ctx.role === "admin") return;
  // ADR 0006: only admin may omit districtId; self-scope still needs the claim.
  if (!ctx.districtId) throw new TenancyError();
}

export function applyTenancyToDb(db, ctx = getTenancyContext()) {
  if (!ctx || ctx.unscoped || ctx.role === "admin") return db;
  assertTenancyAllowsScopedAccess(ctx);
  const out = { ...db };
  for (const col of TENANT_SCOPED_COLLECTIONS) {
    if (!Array.isArray(db[col])) continue;
    out[col] = db[col].filter((row) => rowVisible(col, row, ctx, db));
  }
  return out;
}

export function mergeScopedDbSave(raw, scoped, ctx = getTenancyContext()) {
  if (!ctx || ctx.unscoped || ctx.role === "admin") return scoped;
  assertTenancyAllowsScopedAccess(ctx);
  const next = { ...raw, ...scoped };
  for (const col of TENANT_SCOPED_COLLECTIONS) {
    const rawRows = Array.isArray(raw[col]) ? raw[col] : [];
    const scopedRows = Array.isArray(scoped[col]) ? scoped[col] : [];
    const kept = rawRows.filter((row) => !rowVisible(col, row, ctx, raw));
    const visible = scopedRows.filter((row) => rowVisible(col, row, ctx, scoped));
    next[col] = [...kept, ...visible];
  }
  return next;
}

export function filterRows(collection, rows, ctx, db) {
  if (!ctx || ctx.unscoped || ctx.role === "admin") return rows || [];
  if (!isTenantScopedCollection(collection)) return rows || [];
  assertTenancyAllowsScopedAccess(ctx);
  const snapshot = db || { [collection]: rows };
  return (rows || []).filter((row) => rowVisible(collection, row, ctx, snapshot));
}

/**
 * Refuse path/query district ids outside the caller's claim (ADR 0006 §3).
 * Admin / unscoped: allow. Missing claim on scoped roles: TenancyError.
 */
export function assertCallerMayAccessDistrict(requestedDistrictId, ctx = getTenancyContext()) {
  if (!ctx || ctx.unscoped || ctx.role === "admin") return;
  assertTenancyAllowsScopedAccess(ctx);
  const want = requestedDistrictId != null ? String(requestedDistrictId) : "";
  if (!want || want !== String(ctx.districtId)) {
    throw new TenancyError("District out of scope");
  }
}
