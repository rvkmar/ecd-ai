// server/routes/calibrationJobsRoutes.js
// D62: calibrationJobs collection surface. Admin-gated writes; district
// may view. Jobs are queued, then the worker calls R. Nothing here is
// reachable from /api/sessions.

import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { validateEntity } from "../../src/utils/schema.js";
import { validateCalibrationJobLifecycle } from "../utils/lifecycleValidation.js";
import { canTransitionCalibrationJob } from "../utils/lifecycleMatrix.js";
import {
  CALIBRATION_CONTRACT_VERSION,
  validateCalibrationRequest,
} from "../r/calibrationContract.js";
import { ingestCalibrationJob, ingestRefusal } from "../r/calibrationIngest.js";
import { kickQueue, processJobById, getCalibrationQueueMetrics } from "../r/calibrationWorker.js";
import { isDeclaredJobKind } from "../r/calibrationContract.js";
import {
  applyNamedCalibrationFixture,
  CALIBRATION_NAMED_FIXTURES,
} from "../r/calibrationFixtures.js";

const router = express.Router();
router.use(authenticateToken);

const canAuthor = authorizeRole(["admin"]);
const canView = authorizeRole(["admin", "district"]);

let idCounter = 0;
const genId = () => `job${Date.now()}${(idCounter++ % 1000).toString().padStart(3, "0")}`;

const RETAIN_MS = 182 * 24 * 60 * 60 * 1000; // six months

function retainUntilFrom(requestedAt) {
  return new Date(new Date(requestedAt).getTime() + RETAIN_MS).toISOString();
}

// ------------------------------
// GET /api/calibrationJobs
// ------------------------------
router.get("/", canView, (req, res) => {
  const db = loadDB();
  let rows = db.calibrationJobs || [];
  const { evidenceModelId, status, kind } = req.query;
  if (evidenceModelId) rows = rows.filter((j) => j.evidenceModelId === evidenceModelId);
  if (status) rows = rows.filter((j) => j.status === status);
  if (kind) rows = rows.filter((j) => j.kind === kind);
  res.json(rows);
});

// ------------------------------
// GET /api/calibrationJobs/queue-metrics (D87 — must be before /:id)
// ------------------------------
router.get("/queue-metrics", canView, (_req, res) => {
  res.json(getCalibrationQueueMetrics());
});

// ------------------------------
// GET /api/calibrationJobs/:id
// ------------------------------
router.get("/:id", canView, (req, res) => {
  const db = loadDB();
  const row = (db.calibrationJobs || []).find((j) => j.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Calibration job not found" });
  res.json(row);
});

// ------------------------------
// POST /api/calibrationJobs
// Enqueue. Server-authoritative id / status / timestamps.
// ------------------------------
router.post("/", canAuthor, (req, res) => {
  const db = loadDB();
  const now = new Date().toISOString();
  const id = genId();

  let incoming;
  try {
    incoming = applyNamedCalibrationFixture(req.body, db);
  } catch (err) {
    if (err?.code === "UNKNOWN_CALIBRATION_FIXTURE") {
      return res.status(400).json({
        error: err.message,
        details: [`fixture must be one of: ${CALIBRATION_NAMED_FIXTURES.join(", ")}`],
      });
    }
    throw err;
  }

  const request = {
    ...(incoming?.request || {}),
    contractVersion: incoming?.request?.contractVersion || CALIBRATION_CONTRACT_VERSION,
    jobId: id,
  };

  const record = {
    id,
    kind: incoming?.kind ?? req.body?.kind,
    status: "queued",
    evidenceModelId: incoming?.evidenceModelId ?? req.body?.evidenceModelId,
    statisticalModelId: incoming?.statisticalModelId ?? req.body?.statisticalModelId,
    requestedBy: req.user?.username || req.body?.requestedBy || "unknown",
    requestedAt: now,
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
  };

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

  db.calibrationJobs = db.calibrationJobs || [];
  db.calibrationJobs.push(record);
  saveDB(db);

  kickQueue();
  res.status(201).json(record);
});

// ------------------------------
// POST /api/calibrationJobs/:id/cancel
// queued -> cancelled only.
// ------------------------------
router.post("/:id/cancel", canAuthor, (req, res) => {
  const db = loadDB();
  const job = (db.calibrationJobs || []).find((j) => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: "Calibration job not found" });
  if (!canTransitionCalibrationJob(job.status, "cancelled")) {
    return res.status(409).json({
      error: `Cannot cancel a '${job.status}' job. Only queued jobs may be cancelled.`,
    });
  }
  job.status = "cancelled";
  job.finishedAt = new Date().toISOString();
  job.updatedAt = job.finishedAt;
  saveDB(db);
  res.json(job);
});

// ------------------------------
// POST /api/calibrationJobs/:id/retry
// failed -> queued, incrementing attempts.
// ------------------------------
router.post("/:id/retry", canAuthor, (req, res) => {
  const db = loadDB();
  const job = (db.calibrationJobs || []).find((j) => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: "Calibration job not found" });
  if (!canTransitionCalibrationJob(job.status, "queued")) {
    return res.status(409).json({
      error: `Cannot retry a '${job.status}' job. Only failed jobs may be retried.`,
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
  saveDB(db);
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
router.post("/:id/ingest", canAuthor, (req, res) => {
  const db = loadDB();
  const job = (db.calibrationJobs || []).find((j) => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: "Calibration job not found" });

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
  saveDB(db);
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
router.delete("/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const idx = (db.calibrationJobs || []).findIndex((j) => j.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Calibration job not found" });
  const job = db.calibrationJobs[idx];
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
  db.calibrationJobs.splice(idx, 1);
  saveDB(db);
  res.status(204).end();
});

export default router;
