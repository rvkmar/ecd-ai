// server/routes/api/itemAnalyticsRoutes.js
// 🔹 Item Analytics & Health Monitoring
// D99: global bank exposure metrics are admin-only (ADR 0006).

import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB } from "../../src/utils/db-server.js";
import {
  MIN_CELL_SIZE,
  maySeeGlobalExposure,
  namedAggregateScope,
  suppressCount,
} from "../utils/aggregatePrivacy.js";

const router = express.Router();

router.use(authenticateToken);
router.use(sanitizeRequestInputs);

const canViewBankExposure = authorizeRole(["admin"]);

/* =====================================================
   🔹 GET ITEM HEALTH SUMMARY (admin — global exposure)
===================================================== */
router.get("/summary", canViewBankExposure, (req, res) => {
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
    overexposed: 0,
  };

  for (const item of items) {
    summary[item.status] = (summary[item.status] || 0) + 1;

    if (item.psychometrics?.calibrationStatus === "calibrated") {
      summary.calibrated++;
    } else {
      summary.uncalibrated++;
    }

    if (
      item.exposureControl?.usageCount >=
        item.exposureControl?.maxUsageBeforeRetire &&
      item.status === "operational" &&
      item.exposureControl?.maxUsageBeforeRetire > 0
    ) {
      summary.overexposed++;
    }
  }

  res.json({
    scope: namedAggregateScope(req, { kind: "item-analytics-summary", bank: "global" }),
    minCellSize: MIN_CELL_SIZE,
    ...summary,
  });
});

/* =====================================================
   🔹 GET ITEM HEALTH DETAIL
===================================================== */
router.get("/:id/health", (req, res) => {
  const db = loadDB();
  const item = db.items?.find((i) => i.id === req.params.id);

  if (!item) {
    return res.status(404).json({ error: "Item not found." });
  }

  const allowExposure = maySeeGlobalExposure(req);
  const health = {
    scope: namedAggregateScope(req, { kind: "item-health", itemId: item.id, bank: "global" }),
    minCellSize: MIN_CELL_SIZE,
    lifecycle: item.status,
    locked: item.locked,
    version: item.versionNumber,
    calibrated: item.psychometrics?.calibrationStatus === "calibrated",
    exposureRatio: null,
    riskFlags: [],
  };

  const usage = item.exposureControl?.usageCount || 0;
  const maxUsage = item.exposureControl?.maxUsageBeforeRetire || 0;

  if (allowExposure && maxUsage > 0) {
    health.exposureRatio = usage / maxUsage;
  } else if (!allowExposure) {
    health.exposureRedacted = true;
  }

  if (!health.calibrated && item.status === "operational") {
    health.riskFlags.push("Operational but not calibrated.");
  }

  if (allowExposure && health.exposureRatio >= 0.9) {
    health.riskFlags.push("Approaching retirement threshold.");
  }

  if (item.status === "draft" && !item.stimulus?.blocks?.length) {
    health.riskFlags.push("Incomplete stimulus structure.");
  }

  res.json(health);
});

/* =====================================================
   🔹 GET CALIBRATION METRICS (admin — sampleSize cells)
===================================================== */
router.get("/calibration/report", canViewBankExposure, (req, res) => {
  const db = loadDB();
  const items = db.items || [];

  const calibrated = items.filter(
    (i) => i.psychometrics?.calibrationStatus === "calibrated"
  );

  const report = calibrated.map((i) => {
    const raw = i.psychometrics.irtParams?.sampleSize;
    const { value, suppressed } = suppressCount(raw);
    return {
      id: i.id,
      a: i.psychometrics.irtParams?.a,
      b: i.psychometrics.irtParams?.b,
      c: i.psychometrics.irtParams?.c,
      sampleSize: value,
      sampleSizeSuppressed: suppressed,
      lastCalibrated: i.psychometrics.irtParams?.calibratedAt,
    };
  });

  res.json({
    scope: namedAggregateScope(req, { kind: "calibration-report", bank: "global" }),
    minCellSize: MIN_CELL_SIZE,
    items: report,
  });
});

/* =====================================================
   🔹 GET EVIDENCE LINK REPORT (content metadata — any auth)
===================================================== */
router.get("/evidence/report", (req, res) => {
  const db = loadDB();
  const items = db.items || [];
  const evidenceModels = db.evidenceModels || [];

  const report = items.map((item) => {
    const em = evidenceModels.find((e) => e.id === item.evidenceModelId);
    return {
      itemId: item.id,
      evidenceModelId: item.evidenceModelId,
      competencyId: em?.competencyId || null,
      observationId: item.observationId,
      lifecycle: item.status,
    };
  });

  res.json({
    scope: namedAggregateScope(req, { kind: "evidence-link-report", bank: "global" }),
    minCellSize: MIN_CELL_SIZE,
    items: report,
  });
});

export default router;
