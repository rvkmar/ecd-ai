/**
 * D100 — Scope inspector: predict what a subject user can read.
 * Uses the same filterRows / viewScopeForRole path as live requests so the
 * inspector's answer can be asserted against the API (W20 gate).
 */
import { tenancyClaimsFromUser, viewScopeForRole } from "./tenancy.js";
import {
  TENANT_SCOPED_COLLECTIONS,
  filterRows,
} from "./tenancyScope.js";
import { MIN_CELL_SIZE } from "./aggregatePrivacy.js";

/**
 * @param {{ username?: string, role?: string, profile?: object }} user
 */
function buildTenancyContextForUser(user) {
  const claims = tenancyClaimsFromUser(user);
  const role = user?.role || "";
  return {
    role,
    username: user?.username || "",
    viewScope: viewScopeForRole(role),
    districtId: claims.districtId,
    schoolId: claims.schoolId,
    unscoped: role === "admin",
  };
}

function rowKey(collection, row) {
  if (!row) return null;
  if (collection === "users") return row.username || row.id || null;
  return row.id || row.username || null;
}

/**
 * @param {object} user
 * @param {object} db raw (unscoped) database snapshot
 */
export function inspectSubjectVisibility(user, db) {
  const ctx = buildTenancyContextForUser(user);
  const collections = {};

  for (const col of TENANT_SCOPED_COLLECTIONS) {
    const all = Array.isArray(db?.[col]) ? db[col] : [];
    try {
      const visible = filterRows(col, all, ctx, db);
      collections[col] = {
        visibleCount: visible.length,
        totalCount: all.length,
        visibleIds: visible
          .map((row) => rowKey(col, row))
          .filter(Boolean)
          .slice(0, 100),
      };
    } catch (err) {
      if (err?.code === "TENANCY_REQUIRED" || err?.name === "TenancyError") {
        collections[col] = {
          visibleCount: 0,
          totalCount: all.length,
          visibleIds: [],
          error: "TENANCY_REQUIRED",
        };
      } else {
        throw err;
      }
    }
  }

  return {
    subject: {
      username: user.username,
      role: user.role,
      viewScope: ctx.viewScope,
      districtId: ctx.districtId,
      schoolId: ctx.schoolId,
      unscoped: ctx.unscoped,
    },
    collections,
    minCellSize: MIN_CELL_SIZE,
    bank: {
      note: "Item bank and global content collections are not tenant-filtered (ADR 0006).",
      exposureVisibleToRole: user.role === "admin",
    },
  };
}

/**
 * Distinct district / school ids present on roster + user profiles (admin UI).
 * @param {object} db
 */
export function listTenantDirectory(db) {
  const districts = new Map(); // id -> { id, schoolIds: Set }
  const addDistrict = (id) => {
    if (!id) return;
    const key = String(id);
    if (!districts.has(key)) districts.set(key, { id: key, schoolIds: new Set() });
    return districts.get(key);
  };

  for (const s of db?.students || []) {
    const d = addDistrict(s.districtId);
    if (d && s.schoolId) d.schoolIds.add(String(s.schoolId));
  }
  for (const u of db?.users || []) {
    const d = addDistrict(u.profile?.districtId || u.districtId);
    const school = u.profile?.schoolId || u.schoolId;
    if (d && school) d.schoolIds.add(String(school));
  }

  return {
    districts: [...districts.values()]
      .map((d) => ({
        id: d.id,
        schoolIds: [...d.schoolIds].sort(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}
