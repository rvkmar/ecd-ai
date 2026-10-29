// server/routes/analysisArtefactsRoutes.js
// D76: immutable analysis artefact collection. Admin + district may read.
// Writes happen only through calibration job ingest — there is no POST body
// path here. PUT / PATCH / DELETE are refused so a figure's provenance
// cannot be silently rewritten.

import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB } from "../../src/utils/db-server.js";
import {
  getAnalysisArtefactById,
  queryAnalysisArtefacts,
} from "../analysisArtefacts/analysisArtefactRepository.js";
import {
  MIN_CELL_SIZE,
  namedAggregateScope,
  suppressArtefactSmallCells,
} from "../utils/aggregatePrivacy.js";

const router = express.Router();
router.use(authenticateToken);
router.use(sanitizeRequestInputs);

const canView = authorizeRole(["admin", "district"]);

const IMMUTABLE =
  "analysisArtefacts are immutable — enqueue a new calibration job rather than mutating an existing artefact.";

function stripReportHtml(row) {
  if (!row?.payload?.reportHtml) {
    return {
      ...row,
      hasReport: Boolean(row?.payload?.reportHtml) || Boolean(row?.hasReport),
    };
  }
  const { reportHtml, ...payload } = row.payload;
  return {
    ...row,
    payload,
    hasReport: true,
  };
}

function presentArtefact(row, req, { includeReport = false } = {}) {
  const isAdmin = req.user?.role === "admin";
  let body = isAdmin ? { ...row } : suppressArtefactSmallCells({ ...row });
  if (!includeReport) body = stripReportHtml(body);
  return {
    ...body,
    scopeMeta: namedAggregateScope(req, {
      kind: "analysis-artefact",
      artefactScope: row.scope || null,
    }),
    minCellSize: MIN_CELL_SIZE,
  };
}

// ------------------------------
// GET /api/analysisArtefacts
// ?evidenceModelId=  ?kind=  ?jobId=
// ------------------------------
router.get("/", canView, async (req, res) => {
  const db = loadDB();
  const { evidenceModelId, kind, jobId } = req.query;
  const rows = await queryAnalysisArtefacts(db, {
    ...(evidenceModelId ? { evidenceModelId } : {}),
    ...(kind ? { kind } : {}),
    ...(jobId ? { jobId } : {}),
  });
  res.json(rows.map((r) => presentArtefact(r, req)));
});

// ------------------------------
// GET /api/analysisArtefacts/:id/report
// Self-contained HTML technical report. JSON list/detail omit the HTML blob.
// ------------------------------
router.get("/:id/report", canView, async (req, res) => {
  const db = loadDB();
  const row = await getAnalysisArtefactById(db, req.params.id);
  if (!row) return res.status(404).json({ error: "Analysis artefact not found" });
  const html = row.payload?.reportHtml;
  if (typeof html !== "string" || !html.trim()) {
    return res.status(404).json({ error: "No HTML report on this artefact." });
  }
  const asHtml = req.query.format === "html" || String(req.headers.accept || "").includes("text/html");
  if (asHtml) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  }
  return res.json({ id: row.id, html, mimeType: "text/html" });
});

// ------------------------------
// GET /api/analysisArtefacts/:id
// ------------------------------
router.get("/:id", canView, async (req, res) => {
  const db = loadDB();
  const row = await getAnalysisArtefactById(db, req.params.id);
  if (!row) return res.status(404).json({ error: "Analysis artefact not found" });
  res.json(presentArtefact(row, req));
});

function refuseMutation(_req, res) {
  return res.status(405).json({ error: IMMUTABLE });
}

router.post("/", canView, refuseMutation);
router.put("/:id", canView, refuseMutation);
router.patch("/:id", canView, refuseMutation);
router.delete("/:id", canView, refuseMutation);

export default router;
