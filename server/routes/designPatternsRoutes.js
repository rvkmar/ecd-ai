// server/routes/designPatternsRoutes.js
// ------------------------------------------------------------------
// Design patterns (D131 / W27 G9, ADR 0009). PADI argument a designer
// selects from. Confirmed means later seeding may reference it. It
// authorises no student delivery, so there is no operational status.
//
// Admin-authored. District may view. Wizard is D133–D134.
// D135: POST /bulk on this same file; import always lands as draft.
// D137: POST /:id/seed writes one draft Evidence Model and one draft Task Model.
// D138: GET /:id/descendants lists those models and names snapshot drift. Advisory.
// D139: relationships cite another pattern. They do not copy its menus.
// ------------------------------------------------------------------
import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { validateEntity } from "../../src/utils/schema.js";
import { patternDescendants, seedFromDesignPattern } from "../services/seedFromDesignPattern.js";
import { createEvidenceModelRecord } from "./evidenceModels.js";
import { createTaskModelRecord } from "./taskModelsRoutes.js";

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
  "relationships",
  "references",
  "domainAnalysisId",
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

export function createDesignPatternRecord(body, db, req, { forceDraft = false, assignedId } = {}) {
  const now = new Date().toISOString();
  const writes = pickWrites(body);
  const record = {
    ...writes,
    status: forceDraft ? "draft" : writes.status || "draft",
    id: assignedId || genId(),
    ...authorTenancy(req),
    createdAt: now,
    updatedAt: now,
  };
  const strict = record.status === "confirmed";
  const { valid, errors } = validateEntity("designPatterns", record, db, { strict });
  if (!valid) {
    return { ok: false, error: errors[0] || "Design pattern validation failed", details: errors };
  }
  db.designPatterns = db.designPatterns || [];
  db.designPatterns.push(record);
  return { ok: true, record };
}

router.get("/", (req, res) => {
  const db = loadDB();
  res.json(db.designPatterns || []);
});

router.get("/:id/descendants", (req, res) => {
  const db = loadDB();
  const pattern = (db.designPatterns || []).find((row) => row.id === req.params.id);
  if (!pattern) return res.status(404).json({ error: "Design pattern not found" });
  res.json(patternDescendants(pattern.id, db));
});

router.get("/:id", (req, res) => {
  const db = loadDB();
  const row = (db.designPatterns || []).find((v) => v.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Design pattern not found" });
  res.json(row);
});

router.post("/", canAuthor, (req, res) => {
  const db = loadDB();
  const result = createDesignPatternRecord(req.body, db, req);
  if (!result.ok) {
    return res.status(400).json({ error: result.error, details: result.details });
  }
  saveDB(db);
  res.status(201).json(result.record);
});

router.post("/bulk", canAuthor, (req, res) => {
  const rows = req.body;
  if (!Array.isArray(rows)) {
    return res
      .status(400)
      .json({ error: "Request body must be a JSON array of design patterns." });
  }

  const db = loadDB();
  const results = rows.map((row, i) => {
    const result = createDesignPatternRecord(row, db, req, { forceDraft: true });
    return result.ok
      ? { index: i, ok: true, id: result.record.id, name: result.record.name }
      : { index: i, ok: false, error: result.error, details: result.details };
  });
  saveDB(db);

  const created = results.filter((r) => r.ok).length;
  res.status(207).json({ created, failed: results.length - created, results });
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

router.post("/:id/seed", canAuthor, (req, res) => {
  const db = loadDB();
  const pattern = (db.designPatterns || []).find((row) => row.id === req.params.id);
  if (!pattern) return res.status(404).json({ error: "Design pattern not found" });

  const result = seedFromDesignPattern({
    pattern,
    body: req.body || {},
    db,
    createEvidenceModelRecord,
    createTaskModelRecord,
  });
  if (!result.ok) {
    return res.status(result.status || 400).json({
      error: result.error || "Seed failed",
      details: result.details,
    });
  }
  saveDB(db);
  res.status(201).json({
    evidenceModel: result.evidenceModel,
    taskModel: result.taskModel,
    warnings: result.warnings || [],
  });
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

  const citedBy = (db.templates || []).filter((row) => row.designPatternId === existing.id);
  if (citedBy.length > 0) {
    return res.status(409).json({
      error: "Templates still cite this design pattern. Unlink them before deleting.",
      templateIds: citedBy.map((row) => row.id),
    });
  }

  // R14: seeded evidence and task models keep seededFrom.designPatternId.
  // Deleting the pattern would 404 GET descendants while those rows still
  // name it. Name the first citer so the author can unlink or archive it.
  for (const collection of ["evidenceModels", "taskModels"]) {
    const citer = (db[collection] || []).find(
      (row) => row?.seededFrom?.designPatternId === existing.id
    );
    if (citer) {
      return res.status(409).json({
        error: `${collection} ${citer.id} still cites this design pattern on seededFrom.designPatternId.`,
        collection,
        id: citer.id,
      });
    }
  }

  db.designPatterns = rows.filter((v) => v.id !== existing.id);
  saveDB(db);
  res.json({ success: true });
});

export default router;
