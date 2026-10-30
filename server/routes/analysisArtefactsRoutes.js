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
import {
  redactScoreRows,
  rowsToCsv,
  scoresFromPayload,
  stripArtefactSidecars,
} from "../../src/utils/analysisSidecars.js";
import {
  aggregateArtefactScores,
  buildDistrictAggregateHtml,
} from "../analysisArtefacts/cohortAggregates.js";
import { ensureReportCreditsHtml } from "../../src/utils/softwareCredits.js";

const router = express.Router();
router.use(authenticateToken);
router.use(sanitizeRequestInputs);

const canView = authorizeRole(["admin", "district"]);

const IMMUTABLE =
  "analysisArtefacts are immutable — enqueue a new calibration job rather than mutating an existing artefact.";

function presentArtefact(row, req, { includeReport = false } = {}) {
  const isAdmin = req.user?.role === "admin";
  let body = isAdmin ? { ...row } : suppressArtefactSmallCells({ ...row });
  if (!includeReport) body = stripArtefactSidecars(body);
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
  const rawHtml = row.payload?.reportHtml;
  if (typeof rawHtml !== "string" || !rawHtml.trim()) {
    return res.status(404).json({ error: "No HTML report on this artefact." });
  }
  const html = ensureReportCreditsHtml(
    rawHtml,
    row.payload?.credits,
    row.packageVersion
  );
  const asHtml = req.query.format === "html" || String(req.headers.accept || "").includes("text/html");
  if (asHtml) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  }
  return res.json({ id: row.id, html, mimeType: "text/html" });
});

function sendCsv(res, filename, csv) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(csv || "");
}

// ------------------------------
// GET /api/analysisArtefacts/:id/scores
// Person-score sidecar. Admin sees ids; district gets redacted rows and
// suppression when n < MIN_CELL_SIZE.
// ------------------------------
router.get("/:id/scores", canView, async (req, res) => {
  const db = loadDB();
  const row = await getAnalysisArtefactById(db, req.params.id);
  if (!row) return res.status(404).json({ error: "Analysis artefact not found" });
  const scores = scoresFromPayload(row.payload);
  if (!scores.length && !row.payload?.scoresCsv) {
    return res.status(404).json({ error: "No scores sidecar on this artefact." });
  }
  const isAdmin = req.user?.role === "admin";
  if (!isAdmin && scores.length > 0 && scores.length < MIN_CELL_SIZE) {
    return res.status(200).json({
      id: row.id,
      suppressed: true,
      reason: `n < ${MIN_CELL_SIZE}`,
      n: null,
      minCellSize: MIN_CELL_SIZE,
    });
  }
  const rows = isAdmin ? scores : redactScoreRows(scores);
  const csv = row.payload?.scoresCsv && isAdmin ? row.payload.scoresCsv : rowsToCsv(rows);
  const asCsv =
    req.query.format === "csv" || String(req.headers.accept || "").includes("text/csv");
  if (asCsv) return sendCsv(res, `${row.id}-scores.csv`, csv);
  return res.json({
    id: row.id,
    rows,
    csv,
    mimeType: "text/csv",
    personIdRedacted: !isAdmin,
    n: rows.length,
    minCellSize: MIN_CELL_SIZE,
  });
});

router.get("/:id/tif", canView, async (req, res) => {
  const db = loadDB();
  const row = await getAnalysisArtefactById(db, req.params.id);
  if (!row) return res.status(404).json({ error: "Analysis artefact not found" });
  const csv = row.payload?.tifCsv;
  if (typeof csv !== "string" || !csv.trim()) {
    return res.status(404).json({ error: "No TIF sidecar on this artefact." });
  }
  if (req.query.format === "json") return res.json({ id: row.id, csv, mimeType: "text/csv" });
  return sendCsv(res, `${row.id}-tif.csv`, csv);
});

router.get("/:id/iif", canView, async (req, res) => {
  const db = loadDB();
  const row = await getAnalysisArtefactById(db, req.params.id);
  if (!row) return res.status(404).json({ error: "Analysis artefact not found" });
  const csv = row.payload?.iifCsv;
  if (typeof csv !== "string" || !csv.trim()) {
    return res.status(404).json({ error: "No IIF sidecar on this artefact." });
  }
  if (req.query.format === "json") return res.json({ id: row.id, csv, mimeType: "text/csv" });
  return sendCsv(res, `${row.id}-iif.csv`, csv);
});

router.get("/:id/aggregates", canView, async (req, res) => {
  const db = loadDB();
  const row = await getAnalysisArtefactById(db, req.params.id);
  if (!row) return res.status(404).json({ error: "Analysis artefact not found" });
  const level = req.query.level === "cohort" ? "cohort" : "district";
  const aggregate = aggregateArtefactScores(row, { level, minCell: MIN_CELL_SIZE });
  res.json({
    id: row.id,
    ...aggregate,
    scopeMeta: namedAggregateScope(req, {
      kind: "analysis-artefact-aggregate",
      artefactScope: row.scope || null,
    }),
  });
});

router.get("/:id/aggregates/report", canView, async (req, res) => {
  const db = loadDB();
  const row = await getAnalysisArtefactById(db, req.params.id);
  if (!row) return res.status(404).json({ error: "Analysis artefact not found" });
  const level = req.query.level === "cohort" ? "cohort" : "district";
  const aggregate = aggregateArtefactScores(row, { level, minCell: MIN_CELL_SIZE });
  const html = buildDistrictAggregateHtml(row, aggregate, {
    snapshot: row.payload?.reportTemplate,
  });
  const asHtml = req.query.format !== "json";
  if (asHtml) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  }
  return res.json({ id: row.id, html, mimeType: "text/html", aggregate });
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
