// server/routes/api/itemAnalyticsRoutes.js
// 🔹 Item Analytics & Health Monitoring

import express from "express";
import { authenticateToken } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB } from "../../src/utils/db-server.js";

const router = express.Router();

// Every endpoint in this router requires a valid, logged-in session.
// (Previously this file had no auth check at all — added as part of the
// Phase 1 security hardening pass; see AUTH_SECURITY_FIXES.md.)
router.use(authenticateToken);
router.use(sanitizeRequestInputs);

/* =====================================================
   🔹 GET ITEM HEALTH SUMMARY
===================================================== */
router.get("/summary", (req, res) => {

  const db = loadDB();
  const items = db.items || [];

  const summary = {
    total: items.length,
    draft: 0,
    confirmed: 0,
    operational: 0,
    suspended: 0,
    archived: 0,
    calibrated: 0,
    uncalibrated: 0,
    overexposed: 0
  };

  for (const item of items) {

    summary[item.status] =
      (summary[item.status] || 0) + 1;

    if (item.psychometrics?.calibrationStatus === "calibrated") {
      summary.calibrated++;
    } else {
      summary.uncalibrated++;
    }

    if (
      item.exposureControl?.usageCount >=
      item.exposureControl?.maxUsageBeforeRetire &&
      item.status === "operational"
    ) {
      summary.overexposed++;
    }
  }

  res.json(summary);
});

/* =====================================================
   🔹 GET ITEM HEALTH DETAIL
===================================================== */
router.get("/:id/health", (req, res) => {

  const db = loadDB();
  const item = db.items?.find(i => i.id === req.params.id);

  if (!item) {
    return res.status(404).json({ error: "Item not found." });
  }

  const health = {
    lifecycle: item.status,
    locked: item.locked,
    version: item.versionNumber,
    calibrated: item.psychometrics?.calibrationStatus === "calibrated",
    exposureRatio: 0,
    riskFlags: []
  };

  const usage = item.exposureControl?.usageCount || 0;
  const maxUsage = item.exposureControl?.maxUsageBeforeRetire || 0;

  if (maxUsage > 0) {
    health.exposureRatio = usage / maxUsage;
  }

  /* ---------------- Risk Detection ---------------- */

  if (!health.calibrated && item.status === "operational") {
    health.riskFlags.push("Operational but not calibrated.");
  }

  if (health.exposureRatio >= 0.9) {
    health.riskFlags.push("Approaching retirement threshold.");
  }

  if (item.status === "draft" &&
      !item.stimulus?.blocks?.length) {
    health.riskFlags.push("Incomplete stimulus structure.");
  }

  res.json(health);
});

/* =====================================================
   🔹 GET CALIBRATION METRICS
===================================================== */
router.get("/calibration/report", (req, res) => {

  const db = loadDB();
  const items = db.items || [];

  const calibrated = items.filter(
    i => i.psychometrics?.calibrationStatus === "calibrated"
  );

  const report = calibrated.map(i => ({
    id: i.id,
    a: i.psychometrics.irtParams?.a,
    b: i.psychometrics.irtParams?.b,
    c: i.psychometrics.irtParams?.c,
    sampleSize: i.psychometrics.irtParams?.sampleSize,
    lastCalibrated: i.psychometrics.irtParams?.calibratedAt
  }));

  res.json(report);
});

/* =====================================================
   🔹 GET EVIDENCE LINK REPORT
===================================================== */
router.get("/evidence/report", (req, res) => {

  const db = loadDB();
  const items = db.items || [];
  const evidenceModels = db.evidenceModels || [];

  const report = items.map(item => {

    const em = evidenceModels.find(
      e => e.id === item.evidenceModelId
    );

    return {
      itemId: item.id,
      evidenceModelId: item.evidenceModelId,
      competencyId: em?.competencyId || null,
      observationId: item.observationId,
      lifecycle: item.status
    };
  });

  res.json(report);
});

export default router;