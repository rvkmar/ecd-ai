/**
 * D101 — request-scoped audit actor + request id (AsyncLocalStorage).
 *
 * Parallel to tenancyContext: early middleware begins a bag; authenticateToken
 * binds the actor. saveDB / recordAuditEvent read it so audit rows carry
 * who/which request without each route importing the audit module.
 */
import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";

/** @typedef {{ userId: string, role: string } | null} AuditActor */

/** @typedef {{ requestId: string, actor: AuditActor }} AuditBag */

const storage = new AsyncLocalStorage();

function isBag(store) {
  return (
    store &&
    typeof store === "object" &&
    Object.prototype.hasOwnProperty.call(store, "requestId")
  );
}

/** Start a request bag (call from early Express middleware). */
export function beginAuditRequest(existingId) {
  const requestId =
    typeof existingId === "string" && existingId.trim()
      ? existingId.trim().slice(0, 128)
      : randomUUID();
  storage.enterWith({ requestId, actor: null });
  return requestId;
}

/** @param {AuditActor} actor */
export function bindAuditActor(actor) {
  const store = storage.getStore();
  if (isBag(store)) {
    store.actor = actor;
    return;
  }
  storage.enterWith({
    requestId: randomUUID(),
    actor,
  });
}

/** @returns {string | null} */
export function getAuditRequestId() {
  const store = storage.getStore();
  if (!isBag(store)) return null;
  return store.requestId || null;
}

/** @returns {AuditActor} */
export function getAuditActor() {
  const store = storage.getStore();
  if (!isBag(store)) return null;
  return store.actor;
}

/**
 * @template T
 * @param {{ requestId?: string, actor?: AuditActor }} bag
 * @param {() => T} fn
 * @returns {T}
 */
export function runWithAudit(bag, fn) {
  return storage.run(
    {
      requestId: bag.requestId || randomUUID(),
      actor: bag.actor ?? null,
    },
    fn
  );
}
