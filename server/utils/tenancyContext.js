/**
 * D97/D98 — request-scoped tenancy (AsyncLocalStorage).
 *
 * Early middleware calls beginTenancyRequest() (enterWith a mutable bag).
 * authenticateToken assigns bag.current. getTenancyContext reads it.
 * Absent store = unscoped (boot, cron, privileged auth lookups).
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

/** @typedef {{ current: TenancyContext | null }} TenancyBag */

const storage = new AsyncLocalStorage();

function isBag(store) {
  return (
    store &&
    typeof store === "object" &&
    Object.prototype.hasOwnProperty.call(store, "current")
  );
}

/** @returns {TenancyContext | null} */
export function getTenancyContext() {
  const store = storage.getStore();
  if (!store) return null;
  if (isBag(store)) return store.current;
  return store;
}

/** Start a request bag (call from early Express middleware). */
export function beginTenancyRequest() {
  storage.enterWith({ current: null });
}

/**
 * @param {TenancyContext} ctx
 */
export function bindTenancyContext(ctx) {
  const store = storage.getStore();
  if (isBag(store)) {
    store.current = ctx;
    return;
  }
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
