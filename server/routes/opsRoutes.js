// server/routes/opsRoutes.js
// D105: admin-only ops alerts + enriched metrics for the system health screen.
// Audit log stays on /api/auditLog (admin-only, deliberately unscoped — see route).

import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB } from "../../src/utils/db-server.js";
import { collectSystemStatus } from "../utils/systemStatus.js";
import { evaluateOpsAlerts } from "../utils/opsAlerts.js";
import { getSubmitStats } from "../utils/submitStats.js";
import { isTenantScopedCollection } from "../utils/tenancyScope.js";

const router = express.Router();
router.use(authenticateToken);
router.use(sanitizeRequestInputs);

const canAdmin = authorizeRole(["admin"]);

router.get("/alerts", canAdmin, async (_req, res) => {
  const status = await collectSystemStatus();
  const db = loadDB();
  const payload = evaluateOpsAlerts(status, db.auditLog || []);
  res.json(payload);
});

router.get("/health-summary", canAdmin, async (_req, res) => {
  const status = await collectSystemStatus();
  const db = loadDB();
  const alerts = evaluateOpsAlerts(status, db.auditLog || []);
  const recentAuthFailures = (db.auditLog || [])
    .filter((e) => e.action === "auth.failure")
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 10);

  res.json({
    at: status.at,
    health: status.health,
    readiness: status.readiness,
    process: status.process,
    database: status.database,
    r: {
      reachable: status.r.reachable,
      url: status.r.url,
      status: status.r.rStatus,
    },
    queue: status.queue,
    migrations: {
      latestId: status.migrations.latestId,
      latestAppliedAt: status.migrations.latestAppliedAt,
      pendingIds: status.migrations.pendingIds,
    },
    backup: status.backup,
    submit: getSubmitStats(),
    alerts,
    recentAuthFailures,
    // D105 tenancy note for the UI: auditLog is intentionally global.
    auditLogTenancy: {
      collection: "auditLog",
      tenantScoped: isTenantScopedCollection("auditLog"),
      access: "admin-only; cross-tenant read is deliberate for accountability",
    },
  });
});

export default router;
