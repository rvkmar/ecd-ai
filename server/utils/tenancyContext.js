/**
 * D97 — request-scoped tenancy (AsyncLocalStorage).
 * Bound in authenticateToken via enterWith (Express-safe); read by loadDB / dbAdapter.
 * Absent store = unscoped (tests, boot, privileged auth lookups).
 */
import { AsyncLocalStorage } from "async_hooks";

/** @typedef {{
 *   role: string,
 *   username: string,
 *   viewScope: "district" | "school" | "self" | null,
 *   districtId: string | null,
 *   schoolId: string | null,
 *   unscoped?: boolean,
 * }} TenancyContext */

const storage = new AsyncLocalStorage();

/** @returns {TenancyContext | null} */
export function getTenancyContext() {
  return storage.getStore() || null;
}

/**
 * Bind tenancy for the remainder of this request (Express middleware).
 * Prefer this over runWithTenancy in authenticateToken so async route
 * continuations still see the store.
 * @param {TenancyContext} ctx
 */
export function bindTenancyContext(ctx) {
  storage.enterWith(ctx);
}

/**
 * @template T
 * @param {TenancyContext} ctx
 * @param {() => T} fn
 * @returns {T}
 */
export function runWithTenancy(ctx, fn) {
  return storage.run(ctx, fn);
}

/** @param {{ user?: object, viewScope?: string | null }} req */
export function tenancyContextFromReq(req) {
  const user = req.user || {};
  return {
    role: user.role || "",
    username: user.username || "",
    viewScope: req.viewScope ?? null,
    districtId: user.districtId || null,
    schoolId: user.schoolId || null,
    unscoped: user.role === "admin",
  };
}

export class TenancyError extends Error {
  constructor(message = "Tenant scope required") {
    super(message);
    this.name = "TenancyError";
    this.status = 403;
    this.code = "TENANCY_REQUIRED";
  }
}
