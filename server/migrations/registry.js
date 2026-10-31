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
import parameterSetStatus from "./migrations/010-parameter-set-status.js";
import sessionsToMongo from "./migrations/011-sessions-to-mongo.js";
import auditLogToMongo from "./migrations/012-auditlog-to-mongo.js";
import calibrationDataToMongo from "./migrations/013-calibration-data-to-mongo.js";
import studentModelRecordsToMongo from "./migrations/014-student-model-records-to-mongo.js";
import slimEvidenceParameterSets from "./migrations/015-slim-evidence-model-parameter-sets.js";
import validityEvidence from "./migrations/016-validity-evidence.js";

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
  parameterSetStatus,
  sessionsToMongo,
  auditLogToMongo,
  calibrationDataToMongo,
  studentModelRecordsToMongo,
  slimEvidenceParameterSets,
  validityEvidence,
];

export function migrationRegistryIds() {
  return MIGRATION_REGISTRY.map((m) => m.id);
}
