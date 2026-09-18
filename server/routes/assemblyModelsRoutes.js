// server/routes/assemblyModelsRoutes.js
// ------------------------------------------------------------------
// Assembly models: the test specification. Per SMV, how accurate the
// estimate must be before a session may stop (`targetsBySMV` --
// requiredSEM for continuous SMVs, requiredClassificationAccuracy for
// binary ones), the stopping rules, and a validated pointer into
// `policies` naming the selection algorithm.
//
// WHY THIS FILE EXISTS ONLY NOW (D48): declared Day 17 with full schema
// validation, given a lifecycle validator Day 21, and never given a
// route file, a rolePermissions entry or a query hook. Same gap as
// qMatrixModels and compositeLibrary -- validated but unreachable.
//
// D57 evaluates requiredClassificationAccuracy (ADR 0004); D58 persists
// the stop on the session and shows it in the player. This router still
// only stores and serves the authored target.
// ------------------------------------------------------------------
import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { validateEntity } from "../../src/utils/schema.js";
import { validateAssemblyModelLifecycle } from "../utils/lifecycleValidation.js";
import { canTransition } from "../utils/lifecycleMatrix.js";

const router = express.Router();

router.use(authenticateToken);
router.use(sanitizeRequestInputs);

// rolePermissions.js declares assemblyModels as admin-authored: a test
// specification governs how every session built on it terminates, which
// is a system-level measurement decision rather than local authoring.
const canAuthor = authorizeRole(["admin"]);
const canDelete = authorizeRole(["admin"]);

let idCounter = 0;
const genId = () => `am${Date.now()}${(idCounter++ % 1000).toString().padStart(3, "0")}`;

// ------------------------------
// GET /api/assemblyModels          ?competencyModelId= filters
// ------------------------------
router.get("/", (req, res) => {
  const db = loadDB();
  let rows = db.assemblyModels || [];
  const { competencyModelId } = req.query;
  if (competencyModelId) {
    rows = rows.filter((m) => m.competencyModelId === competencyModelId);
  }
  res.json(rows);
});

// ------------------------------
// GET /api/assemblyModels/:id
// ------------------------------
router.get("/:id", (req, res) => {
  const db = loadDB();
  const row = (db.assemblyModels || []).find((m) => m.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Assembly model not found" });
  res.json(row);
});

// ------------------------------
// POST /api/assemblyModels
// Always created as a draft; status/locked/versionNumber are server-
// authoritative so a payload cannot arrive pre-confirmed.
// ------------------------------
router.post("/", canAuthor, (req, res) => {
  const db = loadDB();
  const now = new Date().toISOString();

  const record = {
    ...req.body,
    id: genId(),
    status: "draft",
    locked: false,
    versionNumber: req.body?.versionNumber ?? 1,
    targetsBySMV: Array.isArray(req.body?.targetsBySMV) ? req.body.targetsBySMV : [],
    createdAt: now,
    updatedAt: now,
  };

  const { valid, errors } = validateEntity("assemblyModels", record, db);
  if (!valid) {
    return res.status(400).json({ error: "Assembly model validation failed", details: errors });
  }

  const lifecycleErrors = validateAssemblyModelLifecycle(record, db);
  if (lifecycleErrors.length > 0) {
    return res.status(400).json({
      error: "Assembly model lifecycle validation failed",
      details: lifecycleErrors,
    });
  }

  db.assemblyModels = db.assemblyModels || [];
  db.assemblyModels.push(record);
  saveDB(db);
  res.status(201).json(record);
});

// ------------------------------
// PUT /api/assemblyModels/:id
// Status-only transition, or a content edit. Locked records take only
// the former -- the same freeze rule every governed entity here uses.
// ------------------------------
router.put("/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const idx = (db.assemblyModels || []).findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Assembly model not found" });

  const existing = db.assemblyModels[idx];
  const prevStatus = existing.status || "draft";
  const nextStatus = req.body?.status || prevStatus;

  if (existing.locked === true) {
    const contentKeys = Object.keys(req.body || {}).filter((k) => k !== "status");
    if (contentKeys.length > 0) {
      return res.status(409).json({
        error: "Assembly model is locked; only a status transition is permitted.",
        details: contentKeys,
      });
    }
  }

  if (nextStatus !== prevStatus && !canTransition(prevStatus, nextStatus)) {
    return res.status(400).json({
      error: `Illegal assembly model status transition: '${prevStatus}' -> '${nextStatus}'.`,
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

  const { valid, errors } = validateEntity("assemblyModels", updated, db);
  if (!valid) {
    return res.status(400).json({ error: "Assembly model validation failed", details: errors });
  }

  const lifecycleErrors = validateAssemblyModelLifecycle(updated, db);
  if (lifecycleErrors.length > 0) {
    return res.status(400).json({
      error: "Assembly model lifecycle validation failed",
      details: lifecycleErrors,
    });
  }

  db.assemblyModels[idx] = updated;
  saveDB(db);
  res.json(updated);
});

// ------------------------------
// DELETE /api/assemblyModels/:id
// ------------------------------
router.delete("/:id", canDelete, (req, res) => {
  const db = loadDB();
  const row = (db.assemblyModels || []).find((m) => m.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Assembly model not found" });

  db.assemblyModels = (db.assemblyModels || []).filter((m) => m.id !== req.params.id);
  saveDB(db);
  res.json({ success: true });
});

/* =====================================================
   POST /api/assemblyModels/bulk
   Name remapping: competencyModelName, targetsBySMV[].smvName,
   selectionAlgorithm.policyName → policyId.
===================================================== */
function resolveUniqueByName(list, name, label, nameKey = "name") {
  const needle = String(name || "").trim().toLowerCase();
  if (!needle) return { error: `${label} name is empty.` };
  const matches = (list || []).filter(
    (row) => String(row[nameKey] || row.name || row.label || "").trim().toLowerCase() === needle
  );
  if (matches.length === 0) return { error: `No ${label} found named "${name}".` };
  if (matches.length > 1) {
    return { error: `"${name}" matches ${matches.length} ${label}s; use an explicit id.` };
  }
  return { record: matches[0] };
}

function createAssemblyModelRecord(payload = {}, db, idSuffix = "") {
  const now = new Date().toISOString();
  let competencyModelId = payload.competencyModelId;

  if (!competencyModelId && payload.competencyModelName) {
    const resolved = resolveUniqueByName(
      db.competencyModels,
      payload.competencyModelName,
      "competency model"
    );
    if (resolved.error) return { ok: false, status: 400, error: resolved.error };
    competencyModelId = resolved.record.id;
  }

  const competencyModel = (db.competencyModels || []).find((m) => m.id === competencyModelId);
  if (!competencyModelId || !competencyModel) {
    return {
      ok: false,
      status: 400,
      error: "competencyModelId (or a unique competencyModelName) is required.",
    };
  }

  const targetsBySMV = [];
  for (const t of payload.targetsBySMV || []) {
    let smvId = t.smvId;
    if (!smvId && t.smvName) {
      const needle = String(t.smvName).trim().toLowerCase();
      const smv = (competencyModel.smVariables || []).find(
        (s) => (s.label || "").trim().toLowerCase() === needle || (s.id || "").toLowerCase() === needle
      );
      const comp = (db.competencies || []).find(
        (c) =>
          c.modelId === competencyModelId &&
          (c.name || "").trim().toLowerCase() === needle
      );
      smvId = smv?.id || comp?.id;
      if (!smvId) {
        return {
          ok: false,
          status: 400,
          error: `No SMV/competency named "${t.smvName}" on model "${competencyModel.name || competencyModelId}".`,
        };
      }
    }
    if (!smvId) {
      return { ok: false, status: 400, error: "Each targetsBySMV entry needs smvId or smvName." };
    }
    const row = { smvId };
    if (typeof t.requiredSEM === "number") row.requiredSEM = t.requiredSEM;
    if (typeof t.requiredClassificationAccuracy === "number") {
      row.requiredClassificationAccuracy = t.requiredClassificationAccuracy;
    }
    targetsBySMV.push(row);
  }

  let selectionAlgorithm = payload.selectionAlgorithm || {};
  if (!selectionAlgorithm.policyId && selectionAlgorithm.policyName) {
    const resolved = resolveUniqueByName(
      db.policies,
      selectionAlgorithm.policyName,
      "policy"
    );
    if (resolved.error) return { ok: false, status: 400, error: resolved.error };
    selectionAlgorithm = { policyId: resolved.record.id };
  }

  const record = {
    id: `${genId()}${idSuffix}`,
    name: payload.name || "",
    description: payload.description || "",
    competencyModelId,
    competencyModelVersion:
      payload.competencyModelVersion ?? competencyModel.versionNumber ?? 1,
    targetsBySMV,
    stoppingRules: payload.stoppingRules || {},
    selectionAlgorithm,
    status: "draft",
    locked: false,
    versionNumber: payload.versionNumber ?? 1,
    createdAt: now,
    updatedAt: now,
  };

  const { valid, errors } = validateEntity("assemblyModels", record, db);
  if (!valid) {
    return { ok: false, status: 400, error: "Assembly model validation failed", details: errors };
  }

  const lifecycleErrors = validateAssemblyModelLifecycle(record, db);
  if (lifecycleErrors.length > 0) {
    return {
      ok: false,
      status: 400,
      error: "Assembly model lifecycle validation failed",
      details: lifecycleErrors,
    };
  }

  db.assemblyModels = db.assemblyModels || [];
  db.assemblyModels.push(record);
  return { ok: true, status: 201, record };
}

router.post("/bulk", canAuthor, (req, res) => {
  const rows = req.body;
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: "Request body must be a JSON array of assembly models." });
  }
  const db = loadDB();
  const results = rows.map((row, i) => {
    const result = createAssemblyModelRecord(row || {}, db, `_${i}`);
    return result.ok
      ? { index: i, ok: true, id: result.record.id, name: result.record.name }
      : { index: i, ok: false, error: result.error, details: result.details };
  });
  saveDB(db);
  const created = results.filter((r) => r.ok).length;
  res.status(207).json({ created, failed: results.length - created, results });
});

export default router;
