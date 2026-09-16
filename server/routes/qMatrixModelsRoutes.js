// server/routes/qMatrixModelsRoutes.js
// ------------------------------------------------------------------
// Q-matrix models: an attributes x items matrix binding binary Student
// Model Variables (the columns) to the items that require them (the
// sparse `entries[]` cells). Required by the `dina`/`gdina` statistical
// model types on evidenceModels.
//
// WHY THIS FILE EXISTS ONLY NOW (D48): the collection was declared on
// Day 18 with full schema validation and given a lifecycle validator on
// Day 21 -- but never a route file, a rolePermissions entry or a query
// hook. It was one of three collections that could be validated but not
// reached: artefacts 4 and 6 of the seven-artefact contract were absent
// for all of them. The Q-matrix editor (D51) has nothing to save to
// until this exists.
//
// Referential integrity is NOT re-implemented here. schema.js already
// enforces that every `attributeIds` entry is a `binary`-type smVariable
// on the bound competency model -- a Q-matrix over a continuous SMV is a
// category error, and validateEntity refuses it. This router surfaces
// those errors; it does not duplicate them.
// ------------------------------------------------------------------
import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { validateEntity } from "../../src/utils/schema.js";
import { validateQMatrixModelLifecycle } from "../utils/lifecycleValidation.js";
import { canTransition } from "../utils/lifecycleMatrix.js";

const router = express.Router();

// Same posture as every other router: a valid bearer token for everything,
// then per-route role gates matching rolePermissions.js's declared intent
// (qMatrixModels: admin+district may view, admin may author and delete).
router.use(authenticateToken);

const canAuthor = authorizeRole(["admin"]);
const canDelete = authorizeRole(["admin"]);

// Date.now() alone collides when two records are created inside the same
// millisecond. Same monotonic-counter shape taskModelsRoutes.js uses.
let idCounter = 0;
const genId = () => `qm${Date.now()}${(idCounter++ % 1000).toString().padStart(3, "0")}`;

// ------------------------------
// GET /api/qMatrixModels           ?competencyModelId= filters
// ------------------------------
router.get("/", (req, res) => {
  const db = loadDB();
  let rows = db.qMatrixModels || [];
  const { competencyModelId } = req.query;
  if (competencyModelId) {
    rows = rows.filter((q) => q.competencyModelId === competencyModelId);
  }
  res.json(rows);
});

// ------------------------------
// GET /api/qMatrixModels/:id
// ------------------------------
router.get("/:id", (req, res) => {
  const db = loadDB();
  const row = (db.qMatrixModels || []).find((q) => q.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Q-matrix model not found" });
  res.json(row);
});

// ------------------------------
// POST /api/qMatrixModels
// A new Q-matrix is always a draft. `status`, `locked` and `versionNumber`
// are server-authoritative on create -- a payload cannot arrive already
// confirmed, the same rule taskModelsRoutes.js applies.
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
    attributeIds: Array.isArray(req.body?.attributeIds) ? req.body.attributeIds : [],
    entries: Array.isArray(req.body?.entries) ? req.body.entries : [],
    createdAt: now,
    updatedAt: now,
  };

  const { valid, errors } = validateEntity("qMatrixModels", record, db);
  if (!valid) {
    return res.status(400).json({ error: "Q-matrix validation failed", details: errors });
  }

  const lifecycleErrors = validateQMatrixModelLifecycle(record, db);
  if (lifecycleErrors.length > 0) {
    return res
      .status(400)
      .json({ error: "Q-matrix lifecycle validation failed", details: lifecycleErrors });
  }

  db.qMatrixModels = db.qMatrixModels || [];
  db.qMatrixModels.push(record);
  saveDB(db);
  res.status(201).json(record);
});

// ------------------------------
// PUT /api/qMatrixModels/:id
// Two distinct operations share this verb, exactly as taskModelsRoutes.js
// does: a status-only transition, and a content edit. A locked record
// accepts ONLY the first -- structure is frozen once confirmed, which is
// the property downstream diagnostic models depend on.
// ------------------------------
router.put("/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const idx = (db.qMatrixModels || []).findIndex((q) => q.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Q-matrix model not found" });

  const existing = db.qMatrixModels[idx];
  const prevStatus = existing.status || "draft";
  const nextStatus = req.body?.status || prevStatus;

  if (existing.locked === true) {
    const contentKeys = Object.keys(req.body || {}).filter((k) => k !== "status");
    if (contentKeys.length > 0) {
      return res.status(409).json({
        error: "Q-matrix is locked; only a status transition is permitted.",
        details: contentKeys,
      });
    }
  }

  if (nextStatus !== prevStatus && !canTransition(prevStatus, nextStatus)) {
    return res.status(400).json({
      error: `Illegal Q-matrix status transition: '${prevStatus}' -> '${nextStatus}'.`,
    });
  }

  // Confirmation freezes the record. Mirrors the confirmed-requires-locked
  // check schema.js applies to this collection.
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

  const { valid, errors } = validateEntity("qMatrixModels", updated, db);
  if (!valid) {
    return res.status(400).json({ error: "Q-matrix validation failed", details: errors });
  }

  const lifecycleErrors = validateQMatrixModelLifecycle(updated, db);
  if (lifecycleErrors.length > 0) {
    return res
      .status(400)
      .json({ error: "Q-matrix lifecycle validation failed", details: lifecycleErrors });
  }

  db.qMatrixModels[idx] = updated;
  saveDB(db);
  res.json(updated);
});

// ------------------------------
// DELETE /api/qMatrixModels/:id
// Refused on two grounds, in order:
//
//   1. A CONFIRMED (locked) Q-matrix is never deletable. In ECD terms a
//      Q-matrix is not an ordinary record -- it is the STRUCTURE of the
//      Measurement Model inside an Evidence Model (Mislevy & Riconscente
//      2005 §2.3.2: latent-class models are Measurement Models; the
//      Q-matrix is what defines one). Destroying it destroys the meaning
//      of every attribute-mastery posterior ever accumulated against it:
//      the stored numbers survive, but nothing records what they were
//      about. itemsRoutes.js already states exactly this principle for
//      items ("the responses it collected still have to be
//      interpretable"); it applies with more force here, because one
//      Q-matrix underwrites every response scored by the models that
//      bind it. Archive instead -- the lifecycle matrix provides that
//      transition precisely so withdrawal does not mean destruction.
//
//   2. Refused while any evidence model's statisticalModels[] points at
//      it. A dangling qMatrixId would make a dina/gdina model
//      unvalidatable and unscoreable, which is a silent failure rather
//      than a loud one.
//
// NOTE ON (2): the pointer lives at `sm.structureConfig.qMatrixId`, NOT
// `sm.qMatrixId`. schema.js's DINA/G-DINA block (`sm.structureConfig
// ?.qMatrixId`) and attributeAccumulation.js (same path) are the two
// authorities on this shape, and both read the nested one. This guard
// read the FLAT path from the day it was written, so its filter never
// matched anything, `blocking` was always empty, and the refusal it
// exists to perform had never once fired -- a Q-matrix underwriting a
// live diagnostic model could be deleted out from under it. The guard
// had only ever been observed to pass, which is the same trap D48 and
// D49b both recorded: a guard nobody has watched FAIL is not evidence of
// anything. Both branches are now covered by tests.
// ------------------------------
router.delete("/:id", canDelete, (req, res) => {
  const db = loadDB();
  const row = (db.qMatrixModels || []).find((q) => q.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Q-matrix model not found" });

  if (row.locked === true) {
    return res.status(409).json({
      error:
        "A confirmed Q-matrix cannot be deleted. Archive it instead — it defines what every attribute-mastery estimate scored against it means.",
    });
  }

  const blocking = (db.evidenceModels || []).filter((em) =>
    (em.statisticalModels || []).some(
      (sm) => sm?.structureConfig?.qMatrixId === req.params.id
    )
  );
  if (blocking.length > 0) {
    return res.status(409).json({
      error: "Q-matrix is referenced by one or more evidence models.",
      details: blocking.map((em) => em.name || em.id),
    });
  }

  db.qMatrixModels = (db.qMatrixModels || []).filter((q) => q.id !== req.params.id);
  saveDB(db);
  res.json({ success: true });
});

/* =====================================================
   POST /api/qMatrixModels/bulk
   Name remapping: competencyModelName, attributeNames[],
   entries[].itemName → itemId. Always draft.
===================================================== */
function resolveUniqueByName(list, name, label) {
  const needle = String(name || "").trim().toLowerCase();
  if (!needle) return { error: `${label} name is empty.` };
  const matches = (list || []).filter(
    (row) => (row.name || row.label || "").trim().toLowerCase() === needle
  );
  if (matches.length === 0) return { error: `No ${label} found named "${name}".` };
  if (matches.length > 1) {
    return { error: `"${name}" matches ${matches.length} ${label}s; use an explicit id.` };
  }
  return { record: matches[0] };
}

function createQMatrixRecord(payload = {}, db, idSuffix = "") {
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

  let attributeIds = Array.isArray(payload.attributeIds) ? [...payload.attributeIds] : [];
  if ((!attributeIds.length) && Array.isArray(payload.attributeNames)) {
    attributeIds = [];
    for (const attrName of payload.attributeNames) {
      const needle = String(attrName || "").trim().toLowerCase();
      const smvMatches = (competencyModel.smVariables || []).filter(
        (s) => (s.label || "").trim().toLowerCase() === needle || (s.id || "").toLowerCase() === needle
      );
      const compMatches = (db.competencies || []).filter(
        (c) =>
          c.modelId === competencyModelId &&
          (c.name || "").trim().toLowerCase() === needle
      );
      const hit = smvMatches[0] || (compMatches[0] ? { id: compMatches[0].id } : null);
      if (!hit) {
        return {
          ok: false,
          status: 400,
          error: `No binary SMV/competency named "${attrName}" on model "${competencyModel.name || competencyModelId}".`,
        };
      }
      attributeIds.push(hit.id);
    }
  }

  const entries = [];
  for (const entry of payload.entries || []) {
    let itemId = entry.itemId;
    if (!itemId && entry.itemName) {
      const resolved = resolveUniqueByName(db.items, entry.itemName, "item");
      if (resolved.error) return { ok: false, status: 400, error: resolved.error };
      itemId = resolved.record.id;
    }
    if (!itemId || !entry.attributeId && !entry.attributeName) {
      // attribute may be name-resolved against attributeNames map
    }
    let attributeId = entry.attributeId;
    if (!attributeId && entry.attributeName) {
      const needle = String(entry.attributeName).trim().toLowerCase();
      const idx = (payload.attributeNames || []).findIndex(
        (n) => String(n).trim().toLowerCase() === needle
      );
      if (idx >= 0 && attributeIds[idx]) attributeId = attributeIds[idx];
      else {
        const smv = (competencyModel.smVariables || []).find(
          (s) => (s.label || "").trim().toLowerCase() === needle
        );
        const comp = (db.competencies || []).find(
          (c) =>
            c.modelId === competencyModelId &&
            (c.name || "").trim().toLowerCase() === needle
        );
        attributeId = smv?.id || comp?.id;
      }
    }
    if (!itemId || !attributeId) {
      return {
        ok: false,
        status: 400,
        error: "Each entry requires itemId (or itemName) and attributeId (or attributeName).",
      };
    }
    entries.push({
      itemId,
      attributeId,
      required: entry.required !== false,
    });
  }

  const record = {
    id: `${genId()}${idSuffix}`,
    name: payload.name || "",
    description: payload.description || "",
    competencyModelId,
    competencyModelVersion:
      payload.competencyModelVersion ?? competencyModel.versionNumber ?? 1,
    attributeIds,
    entries,
    status: "draft",
    locked: false,
    versionNumber: payload.versionNumber ?? 1,
    createdAt: now,
    updatedAt: now,
  };

  const { valid, errors } = validateEntity("qMatrixModels", record, db);
  if (!valid) {
    return { ok: false, status: 400, error: "Q-matrix validation failed", details: errors };
  }

  const lifecycleErrors = validateQMatrixModelLifecycle(record, db);
  if (lifecycleErrors.length > 0) {
    return {
      ok: false,
      status: 400,
      error: "Q-matrix lifecycle validation failed",
      details: lifecycleErrors,
    };
  }

  db.qMatrixModels = db.qMatrixModels || [];
  db.qMatrixModels.push(record);
  return { ok: true, status: 201, record };
}

router.post("/bulk", canAuthor, (req, res) => {
  const rows = req.body;
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: "Request body must be a JSON array of Q-matrix models." });
  }
  const db = loadDB();
  const results = rows.map((row, i) => {
    const result = createQMatrixRecord(row || {}, db, `_${i}`);
    return result.ok
      ? { index: i, ok: true, id: result.record.id, name: result.record.name }
      : { index: i, ok: false, error: result.error, details: result.details };
  });
  saveDB(db);
  const created = results.filter((r) => r.ok).length;
  res.status(207).json({ created, failed: results.length - created, results });
});

export default router;
