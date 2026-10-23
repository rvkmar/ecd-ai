// server/routes/presentationModelsRoutes.js
// ------------------------------------------------------------------
// Presentation models: PADI TR9 Materials & Presentation overlay
// (item order, grouping, navigation, conditional display, accessibility).
// Bound to a Task Model. Admin-authored: how every session showing that
// Task Model is presented is a system-level delivery decision, not local
// authoring.
//
// D113 (W23 G8) first slice: collection + lifecycle + authoring HTTP.
// Composite-library bake of a pointer and SessionPlayer obedience are
// later W23 units (docs/adr/0008-presentation-library-bake.md).
// ------------------------------------------------------------------
import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { validateEntity } from "../../src/utils/schema.js";
import { validatePresentationModelLifecycle } from "../utils/lifecycleValidation.js";
import { canTransition } from "../utils/lifecycleMatrix.js";

const router = express.Router();

router.use(authenticateToken);
router.use(sanitizeRequestInputs);

const canAuthor = authorizeRole(["admin"]);
const canDelete = authorizeRole(["admin"]);

let idCounter = 0;
const genId = () => `pm${Date.now()}${(idCounter++ % 1000).toString().padStart(3, "0")}`;

// ------------------------------
// GET /api/presentationModels          ?taskModelId= filters
// ------------------------------
router.get("/", (req, res) => {
  const db = loadDB();
  let rows = db.presentationModels || [];
  const { taskModelId } = req.query;
  if (taskModelId) {
    rows = rows.filter((m) => m.taskModelId === taskModelId);
  }
  res.json(rows);
});

// ------------------------------
// GET /api/presentationModels/:id
// ------------------------------
router.get("/:id", (req, res) => {
  const db = loadDB();
  const row = (db.presentationModels || []).find((m) => m.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Presentation model not found" });
  res.json(row);
});

// ------------------------------
// POST /api/presentationModels
// Always created as a draft; status/locked/versionNumber are server-
// authoritative so a payload cannot arrive pre-confirmed.
// ------------------------------
export function createPresentationModelRecord(payload = {}, db, options = {}) {
  const now = new Date().toISOString();
  const preserve = options.preserveLifecycle === true;
  const record = {
    ...payload,
    id: options.assignedId || genId(),
    status: preserve && payload.status ? payload.status : "draft",
    locked: preserve && typeof payload.locked === "boolean" ? payload.locked : false,
    versionNumber: preserve
      ? Number.isFinite(payload.versionNumber)
        ? payload.versionNumber
        : 1
      : payload.versionNumber ?? 1,
    createdAt: now,
    updatedAt: now,
  };

  const { valid, errors } = validateEntity("presentationModels", record, db);
  if (!valid) {
    return { ok: false, error: "Presentation model validation failed", details: errors };
  }

  const lifecycleErrors = validatePresentationModelLifecycle(record, db);
  if (lifecycleErrors.length > 0) {
    return {
      ok: false,
      error: "Presentation model lifecycle validation failed",
      details: lifecycleErrors,
    };
  }

  db.presentationModels = db.presentationModels || [];
  db.presentationModels.push(record);
  return { ok: true, record };
}

router.post("/", canAuthor, (req, res) => {
  const db = loadDB();
  const result = createPresentationModelRecord(req.body || {}, db);
  if (!result.ok) {
    return res.status(400).json({ error: result.error, details: result.details });
  }
  saveDB(db);
  res.status(201).json(result.record);
});

// ------------------------------
// PUT /api/presentationModels/:id
// Status-only transition, or a content edit. Locked records take only
// the former -- the same freeze rule every governed entity here uses.
// ------------------------------
router.put("/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const idx = (db.presentationModels || []).findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Presentation model not found" });

  const existing = db.presentationModels[idx];
  const prevStatus = existing.status || "draft";
  const nextStatus = req.body?.status || prevStatus;

  if (existing.locked === true) {
    const contentKeys = Object.keys(req.body || {}).filter((k) => k !== "status");
    if (contentKeys.length > 0) {
      return res.status(409).json({
        error: "Presentation model is locked; only a status transition is permitted.",
        details: contentKeys,
      });
    }
  }

  if (nextStatus !== prevStatus && !canTransition(prevStatus, nextStatus)) {
    return res.status(400).json({
      error: `Illegal presentation model status transition: '${prevStatus}' -> '${nextStatus}'.`,
    });
  }

  const becomingLocked =
    ["confirmed", "operational", "suspended"].includes(nextStatus) || existing.locked === true;

  const updated = {
    ...existing,
    ...req.body,
    id: existing.id,
    createdAt: existing.createdAt,
    status: nextStatus,
    locked: becomingLocked,
    updatedAt: new Date().toISOString(),
  };

  const { valid, errors } = validateEntity("presentationModels", updated, db);
  if (!valid) {
    return res.status(400).json({ error: "Presentation model validation failed", details: errors });
  }

  const lifecycleErrors = validatePresentationModelLifecycle(updated, db);
  if (lifecycleErrors.length > 0) {
    return res.status(400).json({
      error: "Presentation model lifecycle validation failed",
      details: lifecycleErrors,
    });
  }

  db.presentationModels[idx] = updated;
  saveDB(db);
  res.json(updated);
});

// ------------------------------
// DELETE /api/presentationModels/:id
// ------------------------------
router.delete("/:id", canDelete, (req, res) => {
  const db = loadDB();
  const row = (db.presentationModels || []).find((m) => m.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Presentation model not found" });

  db.presentationModels = (db.presentationModels || []).filter((m) => m.id !== req.params.id);
  saveDB(db);
  res.json({ success: true });
});

export default router;
