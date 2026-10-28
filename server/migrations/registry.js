// server/migrations/registry.js
// Single ordered list of migrations — CLI and health/readiness both read it.

import normalizeSessionStatus from "./migrations/001-normalize-session-status.js";
import normalizeToolsAllowed from "./migrations/002-normalize-tools-allowed.js";
import backfillLifecycleAudit from "./migrations/003-backfill-lifecycle-audit.js";
import previewRemoveLifecycleMeta from "./migrations/004-preview-remove-lifecycle-meta.js";
import removeLifecycleMeta from "./migrations/005-remove-lifecycle-meta.js";
import domainAnalysisContentStandards from "./migrations/006-domain-analysis-content-standards.js";
import qMatrixDomainAnalysisLink from "./migrations/007-qmatrix-domain-analysis-link.js";
import perspectiveInheritance from "./migrations/008-perspective-inheritance.js";
import domainAnalysisEntryIds from "./migrations/009-domain-analysis-entry-ids.js";

export const MIGRATION_REGISTRY = [
  normalizeSessionStatus,
  normalizeToolsAllowed,
  backfillLifecycleAudit,
  previewRemoveLifecycleMeta,
  removeLifecycleMeta,
  domainAnalysisContentStandards,
  qMatrixDomainAnalysisLink,
  perspectiveInheritance,
  domainAnalysisEntryIds,
];

export function migrationRegistryIds() {
  return MIGRATION_REGISTRY.map((m) => m.id);
}
