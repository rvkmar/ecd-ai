// server/routes/healthRoutes.js
// D104: public /health and /ready, plus client error intake.
// /metrics is admin-only. Health stays green when R is down (ADR 0001).
// Readiness does not.

import express from "express";
import rateLimit from "express-rate-limit";
import { collectSystemStatus } from "../utils/systemStatus.js";
import { logger } from "../utils/logger.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";

const router = express.Router();
router.use(sanitizeRequestInputs);

const clientErrorLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/health", async (_req, res) => {
  const status = await collectSystemStatus();
  const code = status.health.ok ? 200 : 503;
  res.status(code).json({
    status: status.health.ok ? "ok" : "degraded",
    at: status.at,
    process: status.process,
    database: {
      ok: status.database.ecd.ok,
      mode: status.database.ecd.mode,
      sessionsBackend: status.database.ecd.sessionsBackend,
      auditLogBackend: status.database.ecd.auditLogBackend,
      calibrationJobsBackend: status.database.ecd.calibrationJobsBackend,
      analysisArtefactsBackend: status.database.ecd.analysisArtefactsBackend,
    },
    // Diagnostic only — does not affect the HTTP status.
    r: { reachable: status.r.reachable, url: status.r.url },
    servingSessions: status.health.servingSessions,
  });
});

router.get("/ready", async (_req, res) => {
  const status = await collectSystemStatus();
  const code = status.readiness.ok ? 200 : 503;
  res.status(code).json({
    status: status.readiness.ok ? "ready" : "not_ready",
    at: status.at,
    calibration: status.readiness.calibration,
    reason: status.readiness.reason,
    r: { reachable: status.r.reachable, url: status.r.url },
    healthOk: status.health.ok,
    servingSessions: status.health.servingSessions,
  });
});

// Same gate as /api/ops: a logged-in admin. Compose, nginx, scripts, and
// the client do not scrape this route. System Health reads
// /api/ops/health-summary, which is already admin-only. /health and
// /ready stay public.
const canAdmin = authorizeRole(["admin"]);

router.get("/metrics", authenticateToken, canAdmin, async (_req, res) => {
  const status = await collectSystemStatus();
  res.status(200).json({
    at: status.at,
    process: status.process,
    database: status.database,
    r: {
      reachable: status.r.reachable,
      url: status.r.url,
      status: status.r.rStatus,
      httpStatus: status.r.status,
    },
    queue: status.queue,
    migrations: {
      latestId: status.migrations.latestId,
      latestAppliedAt: status.migrations.latestAppliedAt,
      appliedCount: status.migrations.appliedCount,
      registryCount: status.migrations.registryCount,
      pendingIds: status.migrations.pendingIds,
    },
    backup: {
      latestAt: status.backup.latestAt,
      ageMs: status.backup.ageMs,
      fileCount: status.backup.fileCount,
    },
    health: status.health,
    readiness: status.readiness,
  });
});

/**
 * Client error intake — ErrorBoundary reports here.
 * Ids / release / message only; no PII fields accepted into the log.
 */
router.post("/client-errors", clientErrorLimiter, (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  logger.error("client.error", {
    release: typeof body.release === "string" ? body.release.slice(0, 80) : null,
    label: typeof body.label === "string" ? body.label.slice(0, 120) : null,
    errorName: typeof body.errorName === "string" ? body.errorName.slice(0, 120) : null,
    message: typeof body.message === "string" ? body.message.slice(0, 500) : null,
    // Stack is diagnostic; still truncate. Never accept response/student fields.
    stack: typeof body.stack === "string" ? body.stack.slice(0, 2000) : null,
    href: typeof body.href === "string" ? body.href.slice(0, 300) : null,
  });
  res.status(204).end();
});

export default router;
