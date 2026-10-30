// server/routes/calibrationJobsRoutes.js
// D62: calibrationJobs collection surface. Admin-gated writes; district
// may view. Jobs are queued, then the worker calls R. Nothing here is
// reachable from /api/sessions.

import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { querySessions } from "../sessions/sessionRepository.js";
import { calibrationJobsUseExternalStore } from "../calibrationJobs/calibrationJobBackend.js";
import {
  deleteCalibrationJob,
  getCalibrationJobById,
  insertCalibrationJob,
  queryCalibrationJobs,
  saveCalibrationJob,
} from "../calibrationJobs/calibrationJobRepository.js";
import { getAuditRequestId } from "../utils/auditContext.js";
import { validateEntity } from "../../src/utils/schema.js";
import { validateCalibrationJobLifecycle } from "../utils/lifecycleValidation.js";
import { canTransitionCalibrationJob } from "../utils/lifecycleMatrix.js";
import {
  CALIBRATION_CONTRACT_VERSION,
  validateCalibrationRequest,
} from "../r/calibrationContract.js";
import { commitCalibrationIngest, ingestCalibrationJob, ingestRefusal } from "../r/calibrationIngest.js";
import { kickQueue, processJobById, getCalibrationQueueMetrics } from "../r/calibrationWorker.js";
import { isDeclaredJobKind } from "../r/calibrationContract.js";
import {
  applyNamedCalibrationFixture,
  CALIBRATION_NAMED_FIXTURES,
} from "../r/calibrationFixtures.js";
import { assessSessionItemAnalysis } from "../r/sessionItemAnalysis.js";
import { assessLiveResponseMatrix } from "../r/liveResponseMatrix.js";
import {
  MIN_CELL_SIZE,
  namedAggregateScope,
  redactCalibrationJobForViewer,
} from "../utils/aggregatePrivacy.js";
import { adoptReportTemplate, applySnapshotToRequest } from "../../src/utils/psychometricReportTemplate.js";
import { ensureReportCreditsHtml } from "../../src/utils/softwareCredits.js";
import { bnPosteriorBody, redactPersonFitRows, stripJobSidecars } from "../../src/utils/analysisSidecars.js";

const router = express.Router();
router.use(authenticateToken);
router.use(sanitizeRequestInputs);

const canAuthor = authorizeRole(["admin"]);
const canView = authorizeRole(["admin", "district"]);

let idCounter = 0;
const genId = () => `job${Date.now()}${(idCounter++ % 1000).toString().padStart(3, "0")}`;

const RETAIN_MS = 182 * 24 * 60 * 60 * 1000; // six months

function retainUntilFrom(requestedAt) {
  return new Date(new Date(requestedAt).getTime() + RETAIN_MS).toISOString();
}

function stripJobReportHtml(job) {
  return stripJobSidecars(job);
}

// ------------------------------
// GET /api/calibrationJobs
// ------------------------------
router.get("/", canView, async (req, res) => {
  const db = loadDB();
  const { evidenceModelId, status, kind } = req.query;
  const rows = await queryCalibrationJobs(db, {
    ...(evidenceModelId ? { evidenceModelId } : {}),
    ...(status ? { status } : {}),
    ...(kind ? { kind } : {}),
  });
  const isAdmin = req.user?.role === "admin";
  res.json(
    rows.map((j) => ({
      ...stripJobReportHtml(redactCalibrationJobForViewer(j, isAdmin)),
      scopeMeta: namedAggregateScope(req, {
        kind: "calibration-job",
        jobScope: j.scope || null,
      }),
      minCellSize: MIN_CELL_SIZE,
    }))
  );
});

function sendPersonFit(res, row, isAdmin) {
  const rows = row?.response?.personFitRows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(404).json({ error: "No person-fit sidecar on this job." });
  }
  if (!isAdmin && rows.length < MIN_CELL_SIZE) {
    return res.status(200).json({
      id: row.id,
      suppressed: true,
      reason: `n < ${MIN_CELL_SIZE}`,
      n: null,
      minCellSize: MIN_CELL_SIZE,
    });
  }
  const out = isAdmin ? rows : redactPersonFitRows(rows);
  return res.json({
    id: row.id,
    rows: out,
    n: out.length,
    nMisfit: out.filter((r) => r.misfit).length,
    personIdRedacted: !isAdmin,
    minCellSize: MIN_CELL_SIZE,
  });
}

function sendQ3(res, row) {
  const matrix = row?.response?.q3Matrix;
  if (!matrix || !Array.isArray(matrix.itemIds) || !Array.isArray(matrix.values)) {
    return res.status(404).json({ error: "No Q3 matrix on this job." });
  }
  return res.json({
    id: row.id,
    itemIds: matrix.itemIds,
    values: matrix.values,
  });
}

// ------------------------------
// GET /api/calibrationJobs/:id/person-fit
// Per-person Zh flags. List/detail omit the rows. Admin sees ids.
// ------------------------------
router.get("/:id/person-fit", canView, async (req, res) => {
  const db = loadDB();
  const row = await getCalibrationJobById(db, req.params.id);
  if (!row) return res.status(404).json({ error: "Calibration job not found" });
  return sendPersonFit(res, row, req.user?.role === "admin");
});

// ------------------------------
// GET /api/calibrationJobs/:id/bn-posteriors
// Person-level latent marginals. List/detail omit them. The copy that
// ingest keeps is the analysis artefact. Admin sees ids.
// ------------------------------
router.get("/:id/bn-posteriors", canView, async (req, res) => {
  const db = loadDB();
  const row = await getCalibrationJobById(db, req.params.id);
  if (!row) return res.status(404).json({ error: "Calibration job not found" });
  const body = bnPosteriorBody(row.response?.bnPersonPosteriors, {
    isAdmin: req.user?.role === "admin",
    minCellSize: MIN_CELL_SIZE,
    id: row.id,
  });
  if (!body) return res.status(404).json({ error: "No BN posterior sidecar on this job." });
  return res.json(body);
});

// ------------------------------
// GET /api/calibrationJobs/:id/q3
// Yen Q3 matrix. List/detail omit it. Item-level, no person ids.
// ------------------------------
router.get("/:id/q3", canView, async (req, res) => {
  const db = loadDB();
  const row = await getCalibrationJobById(db, req.params.id);
  if (!row) return res.status(404).json({ error: "Calibration job not found" });
  return sendQ3(res, row);
});

// ------------------------------
// GET /api/calibrationJobs/:id/report
// Self-contained HTML technical report. List/detail omit the HTML blob.
// ------------------------------
router.get("/:id/report", canView, async (req, res) => {
  const db = loadDB();
  const row = await getCalibrationJobById(db, req.params.id);
  if (!row) return res.status(404).json({ error: "Calibration job not found" });
  const rawHtml = row.response?.reportHtml;
  if (typeof rawHtml !== "string" || !rawHtml.trim()) {
    return res.status(404).json({ error: "No HTML report on this job." });
  }
  const html = ensureReportCreditsHtml(
    rawHtml,
    row.response?.credits,
    row.response?.packageVersion
  );
  const asHtml =
    req.query.format === "html" || String(req.headers.accept || "").includes("text/html");
  if (asHtml) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  }
  return res.json({ id: row.id, html, mimeType: "text/html" });
});

// ------------------------------
// GET /api/calibrationJobs/queue-metrics (D87 — must be before /:id)
// ------------------------------
router.get("/queue-metrics", canView, async (_req, res) => {
  res.json(await getCalibrationQueueMetrics());
});

// Completed-session item analysis for one evidence model. Does not enqueue.
router.get("/session-item-analysis", canView, async (req, res) => {
  const db = loadDB();
  db.sessions = await querySessions(db, { closed: true });
  const kind = typeof req.query.kind === "string" ? req.query.kind.trim() : "";
  const statisticalModelId =
    typeof req.query.statisticalModelId === "string" ? req.query.statisticalModelId.trim() : "";
  const assessed =
    kind || statisticalModelId
      ? assessLiveResponseMatrix(db, {
          evidenceModelId: req.query.evidenceModelId,
          statisticalModelId,
          kind: kind || "item-analysis",
          itemIds: req.query.itemIds,
          sessionIds: req.query.sessionIds,
          from: req.query.from,
          to: req.query.to,
        })
      : assessSessionItemAnalysis(db, req.query.evidenceModelId);
  const isAdmin = req.user?.role === "admin";
  res.json({
    ok: assessed.ok,
    code: assessed.code,
    message: assessed.message,
    sampleSize: assessed.sampleSize,
    itemIds: assessed.itemIds,
    qMatrixId: assessed.qMatrixId || null,
    sourceSessionCount: assessed.sourceSessionCount || 0,
    responseSource: "sessions",
    studentIds: isAdmin ? assessed.studentIds : undefined,
    studentCount: assessed.studentIds.length,
    studentIdsRedacted: !isAdmin,
  });
});

// ------------------------------
// GET /api/calibrationJobs/:id
// ------------------------------
router.get("/:id", canView, async (req, res) => {
  const db = loadDB();
  const row = await getCalibrationJobById(db, req.params.id);
  if (!row) return res.status(404).json({ error: "Calibration job not found" });
  const isAdmin = req.user?.role === "admin";
  res.json({
    ...stripJobReportHtml(redactCalibrationJobForViewer(row, isAdmin)),
    scopeMeta: namedAggregateScope(req, {
      kind: "calibration-job",
      jobScope: row.scope || null,
    }),
    minCellSize: MIN_CELL_SIZE,
  });
});

// ------------------------------
// POST /api/calibrationJobs
// Enqueue. Server-authoritative id / status / timestamps.
// ------------------------------
router.post("/", canAuthor, async (req, res) => {
  const db = loadDB();
  db.sessions = await querySessions(db, { closed: true });
  const now = new Date().toISOString();
  const id = genId();

  let incoming;
  let liveStamp = null;
  let fixtureName = null;
  try {
    if (req.body?.source === "sessions") {
      const minSampleSize = Number(req.body.minSampleSize);
      const assessed = assessLiveResponseMatrix(db, {
        evidenceModelId: req.body.evidenceModelId,
        statisticalModelId: req.body.statisticalModelId,
        kind: req.body.kind || "item-analysis",
        itemIds: req.body.itemIds,
        sessionIds: req.body.sessionIds,
        from: req.body.from,
        to: req.body.to,
        minSampleSize: Number.isFinite(minSampleSize) && minSampleSize > 0 ? minSampleSize : undefined,
      });
      if (!assessed.ok) {
        return res.status(400).json({
          error: assessed.message,
          code: assessed.code,
          sampleSize: assessed.sampleSize,
          studentIds: assessed.studentIds,
          itemIds: assessed.itemIds,
          qMatrixId: assessed.qMatrixId || null,
        });
      }
      incoming = {
        kind: assessed.kind,
        evidenceModelId: req.body.evidenceModelId,
        statisticalModelId: req.body.statisticalModelId,
        request: assessed.request,
      };
      liveStamp = assessed;
    } else if (req.body?.source === "fixture" && !req.body?.fixture) {
      return res.status(400).json({
        error: "A fixture source needs a named fixture.",
        details: [`fixture must be one of: ${CALIBRATION_NAMED_FIXTURES.join(", ")}`],
      });
    } else {
      incoming = applyNamedCalibrationFixture(req.body, db);
      if (typeof req.body?.fixture === "string" && req.body.fixture) fixtureName = req.body.fixture;
    }
  } catch (err) {
    if (err?.code === "UNKNOWN_CALIBRATION_FIXTURE") {
      return res.status(400).json({
        error: err.message,
        details: [`fixture must be one of: ${CALIBRATION_NAMED_FIXTURES.join(", ")}`],
      });
    }
    throw err;
  }

  const templateId =
    typeof req.body?.templateId === "string" && req.body.templateId.trim()
      ? req.body.templateId.trim()
      : null;
  const adopted = adoptReportTemplate(db, templateId, { role: req.user?.role });
  if (!adopted.ok) {
    return res.status(adopted.status || 400).json({ error: adopted.error });
  }

  let request = {
    ...(incoming?.request || {}),
    contractVersion: incoming?.request?.contractVersion || CALIBRATION_CONTRACT_VERSION,
    jobId: id,
  };
  if (adopted.snapshot) {
    request = applySnapshotToRequest(request, adopted.snapshot);
  }

  const record = {
    id,
    kind: incoming?.kind ?? req.body?.kind,
    status: "queued",
    evidenceModelId: incoming?.evidenceModelId ?? req.body?.evidenceModelId,
    statisticalModelId: incoming?.statisticalModelId ?? req.body?.statisticalModelId,
    requestedBy: req.user?.username || req.body?.requestedBy || "unknown",
    requestedAt: now,
    // D103: persist the edge request id so the worker can propagate it to R.
    requestId: getAuditRequestId() || null,
    startedAt: null,
    finishedAt: null,
    request,
    response: null,
    error: null,
    attempts: 1,
    maxAttempts: Number(req.body?.maxAttempts) > 0 ? Number(req.body.maxAttempts) : 3,
    ingestedParameterSetId: null,
    ingestedAnalysisArtefactId: null,
    retainUntil: retainUntilFrom(now),
    createdAt: now,
    updatedAt: now,
    ...(templateId ? { templateId } : {}),
  };

  if (liveStamp) {
    record.responseSource = "sessions";
    if (liveStamp.qMatrixId) record.qMatrixId = liveStamp.qMatrixId;
    record.sourceSessionCount = liveStamp.sourceSessionCount;
    record.sourceSessionIdsHash = liveStamp.sourceSessionIdsHash;
    if (Array.isArray(liveStamp.sourceSessionIds)) record.sourceSessionIds = liveStamp.sourceSessionIds;
  } else if (fixtureName) {
    record.responseSource = "fixture";
    record.fixtureName = fixtureName;
  }

  if (!isDeclaredJobKind(record.kind)) {
    return res.status(400).json({
      error: "Invalid calibration job kind",
      details: ["kind must be a declared CALIBRATION_JOB_KIND"],
    });
  }

  const requestErrors = validateCalibrationRequest(record.request);
  if (requestErrors.length) {
    return res.status(400).json({ error: "Invalid calibration request envelope", details: requestErrors });
  }

  const { valid, errors } = validateEntity("calibrationJobs", record, db);
  if (!valid) {
    return res.status(400).json({ error: "Calibration job validation failed", details: errors });
  }

  const lifecycleErrors = validateCalibrationJobLifecycle(record, db);
  if (lifecycleErrors.length) {
    return res.status(400).json({ error: "Calibration job lifecycle validation failed", details: lifecycleErrors });
  }

  await insertCalibrationJob(db, record);
  if (!calibrationJobsUseExternalStore()) await saveDB(db);

  kickQueue();
  res.status(201).json(record);
});

// ------------------------------
// POST /api/calibrationJobs/:id/cancel
// queued -> cancelled only.
// ------------------------------
router.post("/:id/cancel", canAuthor, async (req, res) => {
  const db = loadDB();
  const job = await getCalibrationJobById(db, req.params.id);
  if (!job) return res.status(404).json({ error: "Calibration job not found" });
  if (!canTransitionCalibrationJob(job.status, "cancelled")) {
    return res.status(409).json({
      error: `Cannot cancel a '${job.status}' job. Only queued jobs may be cancelled.`,
    });
  }
  job.status = "cancelled";
  job.finishedAt = new Date().toISOString();
  job.updatedAt = job.finishedAt;
  await saveCalibrationJob(db, job);
  if (!calibrationJobsUseExternalStore()) await saveDB(db);
  res.json(job);
});

// ------------------------------
// POST /api/calibrationJobs/:id/retry
// failed -> queued, incrementing attempts.
// ------------------------------
router.post("/:id/retry", canAuthor, async (req, res) => {
  const db = loadDB();
  const job = await getCalibrationJobById(db, req.params.id);
  if (!job) return res.status(404).json({ error: "Calibration job not found" });
  if (!canTransitionCalibrationJob(job.status, "queued")) {
    return res.status(409).json({
      error: `Cannot retry a '${job.status}' job. Only failed or not-converged jobs may be retried.`,
    });
  }
  if (job.attempts >= job.maxAttempts) {
    return res.status(409).json({
      error: `Retry refused: attempts (${job.attempts}) has reached maxAttempts (${job.maxAttempts}).`,
    });
  }
  job.status = "queued";
  job.attempts += 1;
  job.startedAt = null;
  job.finishedAt = null;
  job.error = null;
  job.response = null;
  job.updatedAt = new Date().toISOString();
  job.request = { ...job.request, jobId: job.id };
  await saveCalibrationJob(db, job);
  if (!calibrationJobsUseExternalStore()) await saveDB(db);
  kickQueue();
  res.json(job);
});

// ------------------------------
// POST /api/calibrationJobs/:id/process
// Test/operator hook: run one queued job now. Still admin-gated.
// ------------------------------
router.post("/:id/process", canAuthor, async (req, res) => {
  const result = await processJobById(req.params.id);
  if (!result.job && result.error) {
    const status = result.error === "Calibration job not found." ? 404 : 409;
    return res.status(status).json({ error: result.error });
  }
  res.json(result.job);
});

// ------------------------------
// POST /api/calibrationJobs/:id/ingest
// Human decision. Refuses converged: false.
// ------------------------------
router.post("/:id/ingest", canAuthor, async (req, res) => {
  const db = loadDB();
  const job = await getCalibrationJobById(db, req.params.id);
  if (!job) return res.status(404).json({ error: "Calibration job not found" });
  db.calibrationJobs = db.calibrationJobs || [];
  if (!db.calibrationJobs.some((row) => row && row.id === job.id)) {
    db.calibrationJobs.push(job);
  }

  const refusal = ingestRefusal(job, db);
  if (refusal) {
    return res.status(409).json({ error: refusal });
  }

  const result = ingestCalibrationJob(job, db, {
    calibratedBy: req.user?.username,
  });
  if (!result.ok) {
    return res.status(409).json({ error: result.error, details: result.details });
  }
  const artefact = result.analysisArtefact
    ? (db.analysisArtefacts || []).find((row) => row && row.id === result.analysisArtefact.id)
    : null;
  await commitCalibrationIngest(db, { job, artefact });
  await saveDB(db);
  res.json({
    job,
    parameterSet: result.parameterSet || null,
    analysisArtefact: result.analysisArtefact || null,
  });
});

// ------------------------------
// DELETE /api/calibrationJobs/:id
// Refused while ingestedParameterSetId points at a live set.
// ------------------------------
router.delete("/:id", canAuthor, async (req, res) => {
  const db = loadDB();
  const job = await getCalibrationJobById(db, req.params.id);
  if (!job) return res.status(404).json({ error: "Calibration job not found" });
  if (job.ingestedParameterSetId) {
    return res.status(409).json({
      error: `Cannot delete job '${job.id}' while ingestedParameterSetId '${job.ingestedParameterSetId}' points at a live parameter set.`,
    });
  }
  if (job.ingestedAnalysisArtefactId) {
    return res.status(409).json({
      error: `Cannot delete job '${job.id}' while ingestedAnalysisArtefactId '${job.ingestedAnalysisArtefactId}' points at a live analysis artefact.`,
    });
  }
  await deleteCalibrationJob(db, job.id);
  if (!calibrationJobsUseExternalStore()) await saveDB(db);
  res.status(204).end();
});

export default router;
