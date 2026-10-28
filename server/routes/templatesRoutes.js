// server/routes/templatesRoutes.js
// ------------------------------------------------------------------
// Templates (D126 / W26 G14). Family-generating blueprint binding
// Student + Evidence + Task + Presentation. D152 generates the family
// via POST /:id/generate-task-specs. D153 shares that plan on
// GET /:id/task-spec-preview, regenerates with { replace: true }, and
// retires the family on DELETE /:id/task-specs. Confirm requires
// coherent four bindings; PM↔TM mismatch is refused with the same rule
// compositeLibrary uses (ADR 0008).
//
// Admin-authored (system-level CAF blueprint). District may view.
// TMV settings are read from the bound Task Model (D120), not stored here.
// ------------------------------------------------------------------
import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { validateEntity } from "../../src/utils/schema.js";
import { markTaskSpecsStaleForTemplate } from "../../src/utils/taskSpecReadiness.js";
import {
  generateTaskSpecFamily,
  planTaskSpecFamily,
  retireTaskSpecFamily,
} from "../services/generateTaskSpecFamily.js";

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

export function createTemplateRecord(payload = {}, db, req, { forceDraft = false, assignedId } = {}) {
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
  const { valid, errors } = validateEntity("templates", record, db, { strict });
  if (!valid) {
    return {
      ok: false,
      error: errors[0] || "Template validation failed",
      details: errors,
    };
  }

  db.templates = db.templates || [];
  db.templates.push(record);
  return { ok: true, record };
}

router.post("/", canAuthor, (req, res) => {
  const db = loadDB();
  const result = createTemplateRecord(req.body || {}, db, req);
  if (!result.ok) {
    return res.status(400).json({ error: result.error, details: result.details });
  }
  saveDB(db);
  res.status(201).json(result.record);
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
  markTaskSpecsStaleForTemplate(db, updated.id);
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
  markTaskSpecsStaleForTemplate(db, updated.id);
  saveDB(db);
  res.json(updated);
});

router.get("/:id/task-spec-preview", (req, res) => {
  const db = loadDB();
  const result = planTaskSpecFamily(db, req.params.id);
  if (!result.ok) {
    return res.status(result.status || 400).json({
      error: result.error,
      details: result.details,
      projectedSize: result.projectedSize,
    });
  }
  const existingCount = (db.taskSpecs || []).filter(
    (spec) => spec && spec.templateId === req.params.id
  ).length;
  res.json({
    assignments: result.assignments,
    count: result.count,
    existingCount,
  });
});

router.post("/:id/generate-task-specs", canAuthor, (req, res) => {
  const db = loadDB();
  const replace = req.body?.replace === true;
  const result = generateTaskSpecFamily(db, req.params.id, authorTenancy(req), {
    replace,
  });
  if (!result.ok) {
    return res.status(result.status || 400).json({
      error: result.error,
      details: result.details,
      citingIds: result.citingIds,
      projectedSize: result.projectedSize,
    });
  }
  saveDB(db);
  res.status(201).json({ specs: result.specs, count: result.count });
});

router.delete("/:id/task-specs", canDelete, (req, res) => {
  const db = loadDB();
  const result = retireTaskSpecFamily(db, req.params.id);
  if (!result.ok) {
    return res.status(result.status || 400).json({
      error: result.error,
    });
  }
  saveDB(db);
  res.json({ deleted: result.deleted });
});

router.delete("/:id", canDelete, (req, res) => {
  const db = loadDB();
  const rows = db.templates || [];
  const existing = rows.find((v) => v.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "Template not found" });

  const citing = (db.taskSpecs || []).filter((spec) => spec.templateId === existing.id);
  if (citing.length) {
    return res.status(409).json({
      error: "Remove generated task specs before deleting this template.",
      citingIds: citing.map((spec) => spec.id),
    });
  }

  db.templates = rows.filter((v) => v.id !== existing.id);
  saveDB(db);
  res.json({ success: true });
});

export default router;
