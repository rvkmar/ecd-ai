// server/routes/taskModelVariablesRoutes.js
// ------------------------------------------------------------------
// Task Model Variables (D116 / W24 G13). Reusable typed design features.
// One record is consumed by any number of Task Models via
// taskModelVariableIds. Library records: no CAF status machine.
//
// Author tenancy (districtId / schoolId / createdBy) is stamped from the
// JWT the same way instantiated tasks are. The collection is NOT tenant-
// scoped: Task Models themselves are shared, and hiding a variable inside
// one district would make "defined once, consumed twice" impossible.
// The stamp is authorship provenance.
// ------------------------------------------------------------------
import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import {
  validateEntity,
  taskModelsConsumingVariable,
} from "../../src/utils/schema.js";

const router = express.Router();

router.use(authenticateToken);
router.use(sanitizeRequestInputs);

// Same author split as task models: admin and district write; admin deletes.
const canAuthor = authorizeRole(["admin", "district"]);
const canDelete = authorizeRole(["admin"]);

const WRITE_KEYS = [
  "name",
  "description",
  "type",
  "possibleValues",
  "range",
  "valueSet",
  "taskFeatureId",
  "domainAnalysisId",
];

let idCounter = 0;
const genId = () => `tmv${Date.now()}${(idCounter++ % 1000).toString().padStart(3, "0")}`;

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

function unsetBlankCitations(record) {
  if (!String(record.domainAnalysisId || "").trim()) delete record.domainAnalysisId;
  if (!String(record.taskFeatureId || "").trim()) delete record.taskFeatureId;
  return record;
}

function rejectIfInvalid(res, record, db) {
  const { valid, errors } = validateEntity("taskModelVariables", record, db);
  if (valid) return false;
  return res.status(400).json({
    error: errors[0] || "Task Model Variable validation failed",
    details: errors,
  });
}

function consumerBindingProblems(db, variable) {
  const nextDb = {
    ...db,
    taskModelVariables: (db.taskModelVariables || []).map((row) =>
      row.id === variable.id ? variable : row
    ),
  };
  const problems = [];
  for (const tm of taskModelsConsumingVariable(nextDb, variable.id)) {
    const result = validateEntity("taskModels", tm, nextDb, { strict: false });
    if (!result.valid) {
      problems.push({ taskModelId: tm.id, details: result.errors });
    }
  }
  return problems;
}

router.get("/", (req, res) => {
  const db = loadDB();
  res.json(db.taskModelVariables || []);
});

router.get("/:id", (req, res) => {
  const db = loadDB();
  const row = (db.taskModelVariables || []).find((v) => v.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Task Model Variable not found" });
  res.json(row);
});

export function createTaskModelVariableRecord(payload = {}, db, req, { assignedId } = {}) {
  const now = new Date().toISOString();
  const record = {
    ...pickWrites(payload),
    id: assignedId || genId(),
    ...authorTenancy(req),
    createdAt: now,
    updatedAt: now,
  };
  unsetBlankCitations(record);

  const { valid, errors } = validateEntity("taskModelVariables", record, db);
  if (!valid) {
    return {
      ok: false,
      error: errors[0] || "Task Model Variable validation failed",
      details: errors,
    };
  }

  db.taskModelVariables = db.taskModelVariables || [];
  db.taskModelVariables.push(record);
  return { ok: true, record };
}

router.post("/", canAuthor, (req, res) => {
  const db = loadDB();
  const result = createTaskModelVariableRecord(req.body || {}, db, req);
  if (!result.ok) {
    return res.status(400).json({ error: result.error, details: result.details });
  }
  saveDB(db);
  res.status(201).json(result.record);
});

router.put("/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const rows = db.taskModelVariables || [];
  const idx = rows.findIndex((v) => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Task Model Variable not found" });

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
  unsetBlankCitations(updated);

  if (rejectIfInvalid(res, updated, db)) return;

  const problems = consumerBindingProblems(db, updated);
  if (problems.length) {
    return res.status(400).json({
      error: "Task Model Variable change would invalidate a consuming Task Model.",
      details: problems,
    });
  }

  db.taskModelVariables[idx] = updated;
  saveDB(db);
  res.json(updated);
});

router.delete("/:id", canDelete, (req, res) => {
  const db = loadDB();
  const rows = db.taskModelVariables || [];
  const existing = rows.find((v) => v.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "Task Model Variable not found" });

  const consumers = taskModelsConsumingVariable(db, existing.id);
  if (consumers.length) {
    return res.status(409).json({
      error: `Task Model Variable '${existing.id}' is consumed by ${consumers.length} Task Model(s).`,
      taskModelIds: consumers.map((tm) => tm.id),
    });
  }

  db.taskModelVariables = rows.filter((v) => v.id !== existing.id);
  saveDB(db);
  res.json({ success: true });
});

export default router;
