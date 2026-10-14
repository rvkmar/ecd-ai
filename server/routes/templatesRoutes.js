// server/routes/templatesRoutes.js
// ------------------------------------------------------------------
// Templates (D126 / W26 G14). Family-generating blueprint binding
// Student + Evidence + Task + Presentation. Generates nothing yet
// (W31). Confirm requires coherent four bindings; PM↔TM mismatch is
// refused with the same rule compositeLibrary uses (ADR 0008).
//
// Admin-authored (system-level CAF blueprint). District may view.
// TMV settings are read from the bound Task Model (D120), not stored here.
// ------------------------------------------------------------------
import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { validateEntity } from "../../src/utils/schema.js";

const router = express.Router();

router.use(authenticateToken);
router.use(sanitizeRequestInputs);

const canAuthor = authorizeRole(["admin"]);
const canDelete = authorizeRole(["admin"]);

const WRITE_KEYS = [
  "name",
  "description",
  "status",
  "competencyModelId",
  "evidenceModelId",
  "taskModelId",
  "presentationModelId",
  "designPatternId",
];

let idCounter = 0;
const genId = () => `tpl${Date.now()}${(idCounter++ % 1000).toString().padStart(3, "0")}`;

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
  const strict = record.status === "confirmed";
  const { valid, errors } = validateEntity("templates", record, db, { strict });
  if (valid) return false;
  return res.status(400).json({
    error: errors[0] || "Template validation failed",
    details: errors,
  });
}

router.get("/", (req, res) => {
  const db = loadDB();
  res.json(db.templates || []);
});

router.get("/:id", (req, res) => {
  const db = loadDB();
  const row = (db.templates || []).find((v) => v.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Template not found" });
  res.json(row);
});

router.post("/", canAuthor, (req, res) => {
  const db = loadDB();
  const now = new Date().toISOString();
  const writes = pickWrites(req.body);
  const record = {
    ...writes,
    status: writes.status || "draft",
    id: genId(),
    ...authorTenancy(req),
    createdAt: now,
    updatedAt: now,
  };

  if (rejectIfInvalid(res, record, db)) return;

  db.templates = db.templates || [];
  db.templates.push(record);
  saveDB(db);
  res.status(201).json(record);
});

router.put("/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const rows = db.templates || [];
  const idx = rows.findIndex((v) => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Template not found" });

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

  db.templates[idx] = updated;
  saveDB(db);
  res.json(updated);
});

router.post("/:id/confirm", canAuthor, (req, res) => {
  const db = loadDB();
  const rows = db.templates || [];
  const idx = rows.findIndex((v) => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Template not found" });

  const existing = rows[idx];
  const updated = {
    ...existing,
    status: "confirmed",
    updatedAt: new Date().toISOString(),
  };

  if (rejectIfInvalid(res, updated, db)) return;

  db.templates[idx] = updated;
  saveDB(db);
  res.json(updated);
});

router.delete("/:id", canDelete, (req, res) => {
  const db = loadDB();
  const rows = db.templates || [];
  const existing = rows.find((v) => v.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "Template not found" });

  db.templates = rows.filter((v) => v.id !== existing.id);
  saveDB(db);
  res.json({ success: true });
});

export default router;
