// server/routes/deliveryModelsRoutes.js
// ------------------------------------------------------------------
// Delivery models. One deliverable assessment: student model, assembly
// model, selection policy, optional presentation override, and
// administration rules. status: draft | confirmed.
// Confirm requires the cited models to exist and to be confirmed or
// operational where that collection has a status. A policy only has to
// exist. Delete is refused while a session cites the id.
// ------------------------------------------------------------------
import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { validateEntity } from "../../src/utils/schema.js";
import { sessionsCitingDeliveryModel } from "../../src/utils/deliveryModelReadiness.js";

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
  "assemblyModelId",
  "policyId",
  "presentationModelId",
  "administration",
];

let idCounter = 0;
const genId = () => `dm${Date.now()}${(idCounter++ % 1000).toString().padStart(3, "0")}`;

function authorTenancy(req) {
  return {
    districtId: req.user?.districtId || null,
    schoolId: req.user?.schoolId || null,
    createdBy: req.user?.username || req.user?.id || null,
  };
}

function blankToUndefined(value) {
  if (value == null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

function pickWrites(body = {}) {
  const out = {};
  for (const key of WRITE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  if (Object.prototype.hasOwnProperty.call(out, "presentationModelId")) {
    out.presentationModelId = blankToUndefined(out.presentationModelId);
  }
  return out;
}

function rejectIfInvalid(res, record, db) {
  const strict = record.status === "confirmed";
  const { valid, errors } = validateEntity("deliveryModels", record, db, { strict });
  if (valid) return false;
  return res.status(400).json({
    error: errors[0] || "Delivery model validation failed",
    details: errors,
  });
}

router.get("/", (req, res) => {
  const db = loadDB();
  res.json(db.deliveryModels || []);
});

router.get("/:id", (req, res) => {
  const db = loadDB();
  const row = (db.deliveryModels || []).find((model) => model.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Delivery model not found" });
  res.json(row);
});

export function createDeliveryModelRecord(
  payload = {},
  db,
  req,
  { forceDraft = false, assignedId } = {}
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

  const strict = record.status === "confirmed";
  const { valid, errors } = validateEntity("deliveryModels", record, db, { strict });
  if (!valid) {
    return {
      ok: false,
      error: errors[0] || "Delivery model validation failed",
      details: errors,
    };
  }

  db.deliveryModels = db.deliveryModels || [];
  db.deliveryModels.push(record);
  return { ok: true, record };
}

router.post("/", canAuthor, (req, res) => {
  const db = loadDB();
  const result = createDeliveryModelRecord(req.body || {}, db, req);
  if (!result.ok) {
    return res.status(400).json({ error: result.error, details: result.details });
  }
  saveDB(db);
  res.status(201).json(result.record);
});

router.put("/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const rows = db.deliveryModels || [];
  const idx = rows.findIndex((model) => model.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Delivery model not found" });

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

  db.deliveryModels[idx] = updated;
  saveDB(db);
  res.json(updated);
});

router.post("/:id/confirm", canAuthor, (req, res) => {
  const db = loadDB();
  const rows = db.deliveryModels || [];
  const idx = rows.findIndex((model) => model.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Delivery model not found" });

  const existing = rows[idx];
  const updated = {
    ...existing,
    status: "confirmed",
    updatedAt: new Date().toISOString(),
  };

  if (rejectIfInvalid(res, updated, db)) return;

  db.deliveryModels[idx] = updated;
  saveDB(db);
  res.json(updated);
});

router.delete("/:id", canDelete, (req, res) => {
  const db = loadDB();
  const rows = db.deliveryModels || [];
  const existing = rows.find((model) => model.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "Delivery model not found" });

  const consumers = sessionsCitingDeliveryModel(db, existing.id);
  if (consumers.length) {
    return res.status(409).json({
      error: `Delivery model '${existing.id}' is cited by ${consumers.length} session(s).`,
      sessionIds: consumers.map((session) => session.id),
    });
  }

  db.deliveryModels = rows.filter((model) => model.id !== existing.id);
  saveDB(db);
  res.json({ success: true });
});

export default router;
