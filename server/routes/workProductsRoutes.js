// server/routes/workProductsRoutes.js
// ------------------------------------------------------------------
// Work Products (D121 / W25 G12). What the examinee produces — distinct
// from the interaction that captures it. Library records: no CAF status
// machine (same posture as taskModelVariables). Items bind via
// interaction.workProductId; Evidence Models may cite the same id on
// evaluationProcedures.
//
// Author tenancy is stamped from the JWT as provenance. The collection
// is NOT tenant-scoped: a Work Product type must be reusable across
// Task Models the way an observable response mode is.
// ------------------------------------------------------------------
import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import {
  validateEntity,
  itemsConsumingWorkProduct,
} from "../../src/utils/schema.js";

const router = express.Router();

router.use(authenticateToken);
router.use(sanitizeRequestInputs);

const canAuthor = authorizeRole(["admin", "district"]);
const canDelete = authorizeRole(["admin"]);

const WRITE_KEYS = ["name", "description", "type"];

let idCounter = 0;
const genId = () => `wp${Date.now()}${(idCounter++ % 1000).toString().padStart(3, "0")}`;

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
  const { valid, errors } = validateEntity("workProducts", record, db);
  if (valid) return false;
  return res.status(400).json({
    error: errors[0] || "Work Product validation failed",
    details: errors,
  });
}

router.get("/", (req, res) => {
  const db = loadDB();
  res.json(db.workProducts || []);
});

router.get("/:id", (req, res) => {
  const db = loadDB();
  const row = (db.workProducts || []).find((v) => v.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Work Product not found" });
  res.json(row);
});

// Same record the single POST writes. The zip importer calls this so a
// Work Product is not assembled a second way. There is no status field.
export function createWorkProductRecord(payload = {}, db, req, { assignedId } = {}) {
  const now = new Date().toISOString();
  const record = {
    ...pickWrites(payload),
    id: assignedId || genId(),
    ...authorTenancy(req),
    createdAt: now,
    updatedAt: now,
  };

  const { valid, errors } = validateEntity("workProducts", record, db);
  if (!valid) {
    return {
      ok: false,
      error: errors[0] || "Work Product validation failed",
      details: errors,
    };
  }

  db.workProducts = db.workProducts || [];
  db.workProducts.push(record);
  return { ok: true, record };
}

router.post("/", canAuthor, (req, res) => {
  const db = loadDB();
  const result = createWorkProductRecord(req.body, db, req);
  if (!result.ok) {
    return res.status(400).json({ error: result.error, details: result.details });
  }
  saveDB(db);
  res.status(201).json(result.record);
});

router.put("/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const rows = db.workProducts || [];
  const idx = rows.findIndex((v) => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Work Product not found" });

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

  // Type change would break items whose interaction is only legal for the
  // old type — refuse rather than leave them silently invalid.
  const consumers = itemsConsumingWorkProduct(
    { ...db, workProducts: rows.map((r, i) => (i === idx ? updated : r)) },
    updated.id
  );
  if (existing.type && updated.type && existing.type !== updated.type && consumers.length) {
    return res.status(400).json({
      error: `Cannot change Work Product type while ${consumers.length} item(s) bind it.`,
      itemIds: consumers.map((it) => it.id),
    });
  }

  db.workProducts[idx] = updated;
  saveDB(db);
  res.json(updated);
});

router.delete("/:id", canDelete, (req, res) => {
  const db = loadDB();
  const rows = db.workProducts || [];
  const existing = rows.find((v) => v.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "Work Product not found" });

  const consumers = itemsConsumingWorkProduct(db, existing.id);
  if (consumers.length) {
    return res.status(409).json({
      error: `Work Product '${existing.id}' is bound by ${consumers.length} item(s).`,
      itemIds: consumers.map((it) => it.id),
    });
  }

  db.workProducts = rows.filter((v) => v.id !== existing.id);
  saveDB(db);
  res.json({ success: true });
});

export default router;
