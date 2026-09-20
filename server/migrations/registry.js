// server/migrations/registry.js
// Single ordered list of migrations — CLI and health/readiness both read it.

import normalizeSessionStatus from "./migrations/001-normalize-session-status.js";
import normalizeToolsAllowed from "./migrations/002-normalize-tools-allowed.js";
import backfillLifecycleAudit from "./migrations/003-backfill-lifecycle-audit.js";
import previewRemoveLifecycleMeta from "./migrations/004-preview-remove-lifecycle-meta.js";
import removeLifecycleMeta from "./migrations/005-remove-lifecycle-meta.js";

export const MIGRATION_REGISTRY = [
  normalizeSessionStatus,
  normalizeToolsAllowed,
  backfillLifecycleAudit,
  previewRemoveLifecycleMeta,
  removeLifecycleMeta,
];

export function migrationRegistryIds() {
  return MIGRATION_REGISTRY.map((m) => m.id);
}
