/**
 * D96 — tenancy claim helpers and the server-side viewScope mirror table.
 *
 * Enforcement at the data layer is D97 (never-compress). This module only
 * extracts claims from user.profile and names the role → scope mapping that
 * ADR 0006 / rolePermissions.js agree on.
 */

/** @type {Record<string, "district" | "school" | "self" | null>} */
const VIEW_SCOPE_BY_ROLE = {
  admin: null,
  district: "district",
  teacher: "school",
  student: "self",
};

function normalizeTenancyId(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

/**
 * @param {{ profile?: { districtId?: string, schoolId?: string } } | null | undefined} user
 * @returns {{ districtId: string | null, schoolId: string | null }}
 */
export function tenancyClaimsFromUser(user) {
  const profile = user?.profile || {};
  return {
    districtId: normalizeTenancyId(profile.districtId),
    schoolId: normalizeTenancyId(profile.schoolId),
  };
}

/** Mirror of `rolePermissions[role].restrictions.viewScope` (undefined → null). */
export function viewScopeForRole(role) {
  if (!Object.prototype.hasOwnProperty.call(VIEW_SCOPE_BY_ROLE, role)) return null;
  return VIEW_SCOPE_BY_ROLE[role];
}
