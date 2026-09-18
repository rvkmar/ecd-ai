// server/routes/analysisArtefactsRoutes.js
// D76: immutable analysis artefact collection. Admin + district may read.
// Writes happen only through calibration job ingest — there is no POST body
// path here. PUT / PATCH / DELETE are refused so a figure's provenance
// cannot be silently rewritten.

import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB } from "../../src/utils/db-server.js";

const router = express.Router();
router.use(authenticateToken);
router.use(sanitizeRequestInputs);

const canView = authorizeRole(["admin", "district"]);

const IMMUTABLE =
  "analysisArtefacts are immutable — enqueue a new calibration job rather than mutating an existing artefact.";

// ------------------------------
// GET /api/analysisArtefacts
// ?evidenceModelId=  ?kind=  ?jobId=
// ------------------------------
router.get("/", canView, (req, res) => {
  const db = loadDB();
  let rows = db.analysisArtefacts || [];
  const { evidenceModelId, kind, jobId } = req.query;
  if (evidenceModelId) {
    rows = rows.filter((a) => a.scope?.evidenceModelId === evidenceModelId);
  }
  if (kind) rows = rows.filter((a) => a.kind === kind);
  if (jobId) rows = rows.filter((a) => a.jobId === jobId);
  res.json(rows);
});

// ------------------------------
// GET /api/analysisArtefacts/:id
// ------------------------------
router.get("/:id", canView, (req, res) => {
  const db = loadDB();
  const row = (db.analysisArtefacts || []).find((a) => a.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Analysis artefact not found" });
  res.json(row);
});

function refuseMutation(_req, res) {
  return res.status(405).json({ error: IMMUTABLE });
}

router.post("/", canView, refuseMutation);
router.put("/:id", canView, refuseMutation);
router.patch("/:id", canView, refuseMutation);
router.delete("/:id", canView, refuseMutation);

export default router;
