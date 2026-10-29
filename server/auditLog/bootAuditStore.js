import {
  resolveAuditLogBackend,
  auditLogUseExternalStore,
} from "./auditBackend.js";
import { migrateFileAuditLog } from "../migrations/migrations/012-auditlog-to-mongo.js";
import { ensureAuditIndexes } from "./mongoAuditStore.js";

export async function bootAuditStore() {
  if (!auditLogUseExternalStore()) {
    return { skipped: true, reason: "json harness" };
  }
  const migration = await migrateFileAuditLog({ dryRun: false });
  if (resolveAuditLogBackend() === "mongo") {
    await ensureAuditIndexes();
  }
  return migration;
}
