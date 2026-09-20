// server/routes/calibrationRoutes.js
// Legacy /api/calibrate surface. D61-D63 moved live calibration onto
// /api/calibrationJobs (queued, ADR 0002, parameterSets ingestion).
// This file no longer calls R on the request path and no longer writes
// a/b/c onto questions[].metadata.

import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB } from "../../src/utils/db-server.js";

const router = express.Router();
router.use(authenticateToken);
router.use(sanitizeRequestInputs);

const canAuthor = authorizeRole(["admin"]);
const canView = authorizeRole(["admin", "district"]);

router.get("/logs", canView, (req, res) => {
  const db = loadDB();
  res.json(db.calibrationJobs || []);
});

router.post("/:evidenceModelId", canAuthor, (req, res) => {
  res.status(410).json({
    error:
      "Synchronous /api/calibrate/:evidenceModelId is retired. Enqueue POST /api/calibrationJobs with an ADR 0002 request envelope, then ingest the succeeded job into statisticalModels[].parameterSets[].",
    evidenceModelId: req.params.evidenceModelId,
  });
});

export default router;
