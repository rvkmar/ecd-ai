// server/routes/rubricsRoutes.js
// ------------------------------------------------------------------
// Rubrics (D122 / W25 G11). Reusable scoring rubrics with exemplars.
// Evidence Models bind via evaluationProcedures.rubricId.
// status: draft | confirmed (confirm = ready to bind; no CAF operational).
// ------------------------------------------------------------------
import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import {
  validateEntity,
  evidenceModelsConsumingRubric,
} from "../../src/utils/schema.js";

const router = express.Router();

router.use(authenticateToken);
router.use(sanitizeRequestInputs);

const canAuthor = authorizeRole(["admin", "district"]);
const canDelete = authorizeRole(["admin"]);

const WRITE_KEYS = ["name", "description", "status", "dimensions"];

let idCounter = 0;
const genId = () => `rub${Date.now()}${(idCounter++ % 1000).toString().padStart(3, "0")}`;

function authorTenancy(req) {
  return {
    districtId: req.user?.districtId || null,
    schoolId: req.user?.schoolId || null,
    createdBy: req.user?.username || req.user?.id || null,
  };
}

function pickWrites(body = {}) {
  const out = {};
  for (const key of WRITE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  return out;
}

function rejectIfInvalid(res, record, db) {
  const { valid, errors } = validateEntity("rubrics", record, db);
  if (valid) return false;
  return res.status(400).json({
    error: errors[0] || "Rubric validation failed",
    details: errors,
  });
}

router.get("/", (req, res) => {
  const db = loadDB();
  res.json(db.rubrics || []);
});

router.get("/:id", (req, res) => {
  const db = loadDB();
  const row = (db.rubrics || []).find((v) => v.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Rubric not found" });
  res.json(row);
});

// Same record the single POST writes. forceDraft is how the zip importer
// drops a confirmed status when the original id is not kept, or when that
// status fails the existing validator. POST itself does not force a draft.
export function createRubricRecord(
  payload = {},
  db,
  req,
  { assignedId, forceDraft = false } = {}
) {
  const now = new Date().toISOString();
  const writes = pickWrites(payload);
  const record = {
    ...writes,
    status: forceDraft ? "draft" : writes.status || "draft",
    id: assignedId || genId(),
    ...authorTenancy(req),
    createdAt: now,
    updatedAt: now,
  };

  const { valid, errors } = validateEntity("rubrics", record, db);
  if (!valid) {
    return {
      ok: false,
      error: errors[0] || "Rubric validation failed",
      details: errors,
    };
  }

  db.rubrics = db.rubrics || [];
  db.rubrics.push(record);
  return { ok: true, record };
}

router.post("/", canAuthor, (req, res) => {
  const db = loadDB();
  const result = createRubricRecord(req.body, db, req);
  if (!result.ok) {
    return res.status(400).json({ error: result.error, details: result.details });
  }
  saveDB(db);
  res.status(201).json(result.record);
});

router.put("/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const rows = db.rubrics || [];
  const idx = rows.findIndex((v) => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Rubric not found" });

  const existing = rows[idx];
  const updated = {
    ...existing,
    ...pickWrites(req.body),
    id: existing.id,
    districtId: existing.districtId ?? null,
    schoolId: existing.schoolId ?? null,
    createdBy: existing.createdBy ?? null,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  if (rejectIfInvalid(res, updated, db)) return;

  db.rubrics[idx] = updated;
  saveDB(db);
  res.json(updated);
});

router.post("/:id/confirm", canAuthor, (req, res) => {
  const db = loadDB();
  const rows = db.rubrics || [];
  const idx = rows.findIndex((v) => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Rubric not found" });

  const existing = rows[idx];
  const updated = {
    ...existing,
    status: "confirmed",
    updatedAt: new Date().toISOString(),
  };

  if (rejectIfInvalid(res, updated, db)) return;

  db.rubrics[idx] = updated;
  saveDB(db);
  res.json(updated);
});

router.delete("/:id", canDelete, (req, res) => {
  const db = loadDB();
  const rows = db.rubrics || [];
  const existing = rows.find((v) => v.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "Rubric not found" });

  const consumers = evidenceModelsConsumingRubric(db, existing.id);
  if (consumers.length) {
    return res.status(409).json({
      error: `Rubric '${existing.id}' is cited by ${consumers.length} Evidence Model(s).`,
      evidenceModelIds: consumers.map((em) => em.id),
    });
  }

  db.rubrics = rows.filter((v) => v.id !== existing.id);
  saveDB(db);
  res.json({ success: true });
});

export default router;
