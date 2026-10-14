// server/routes/designPatternsRoutes.js
// ------------------------------------------------------------------
// Design patterns (D131 / W27 G9, ADR 0009). PADI argument a designer
// selects from. Confirmed means later seeding may reference it. It
// authorises no student delivery, so there is no operational status.
//
// Admin-authored. District may view. Wizard is D133–D134.
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
  "summary",
  "rationale",
  "focalKsas",
  "additionalKsas",
  "potentialObservations",
  "potentialWorkProducts",
  "potentialRubrics",
  "characteristicFeatures",
  "variableFeatures",
  "status",
];

let idCounter = 0;
const genId = () => `dp${Date.now()}${(idCounter++ % 1000).toString().padStart(3, "0")}`;

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
  const { valid, errors } = validateEntity("designPatterns", record, db, { strict });
  if (valid) return false;
  return res.status(400).json({
    error: errors[0] || "Design pattern validation failed",
    details: errors,
  });
}

router.get("/", (req, res) => {
  const db = loadDB();
  res.json(db.designPatterns || []);
});

router.get("/:id", (req, res) => {
  const db = loadDB();
  const row = (db.designPatterns || []).find((v) => v.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Design pattern not found" });
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

  db.designPatterns = db.designPatterns || [];
  db.designPatterns.push(record);
  saveDB(db);
  res.status(201).json(record);
});

router.put("/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const rows = db.designPatterns || [];
  const idx = rows.findIndex((v) => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Design pattern not found" });

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

  db.designPatterns[idx] = updated;
  saveDB(db);
  res.json(updated);
});

router.post("/:id/confirm", canAuthor, (req, res) => {
  const db = loadDB();
  const rows = db.designPatterns || [];
  const idx = rows.findIndex((v) => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Design pattern not found" });

  const existing = rows[idx];
  const updated = {
    ...existing,
    status: "confirmed",
    updatedAt: new Date().toISOString(),
  };

  if (rejectIfInvalid(res, updated, db)) return;

  db.designPatterns[idx] = updated;
  saveDB(db);
  res.json(updated);
});

router.delete("/:id", canDelete, (req, res) => {
  const db = loadDB();
  const rows = db.designPatterns || [];
  const existing = rows.find((v) => v.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "Design pattern not found" });

  db.designPatterns = rows.filter((v) => v.id !== existing.id);
  saveDB(db);
  res.json({ success: true });
});

export default router;
