// routes/competencyModels.js
// 🧠 Extreme Strict ECD — Competency Model Routes
// Lifecycle Governed: Draft → Confirm → Lock → Clone
// With Full Cross‑Layer Referential Protection (Competency ↔ Evidence)

import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { validateEntity } from "../../src/utils/schema.js";
import { canTransition } from "../utils/lifecycleMatrix.js";
import { syncSmVariablesFromCompetencies, buildStudentModelSpecification } from "../../src/utils/smVariableSync.js";
import { computeStructuralAudit } from "../../src/utils/studentModelAudit.js";
import {
  normalizeStudentModelBulkRows,
  stripStudentModelImportIdentity,
} from "../../src/utils/studentModelBulkNormalize.js";

const router = express.Router();

// Every endpoint in this router requires a valid, logged-in session.
// (Previously this file had no auth check at all — added as part of the
// Phase 1 security hardening pass; see AUTH_SECURITY_FIXES.md.)
router.use(authenticateToken);
router.use(sanitizeRequestInputs);

// Every write route also needs a role gate: this file had none at all,
// while src/config/rolePermissions.js already declared competencyModels
// editing as admin-only (canEdit/canDelete). Any authenticated caller,
// including a student, could otherwise create/edit/confirm/delete a
// Competency Model. Matches itemsRoutes.js's canAuthor pattern.
const canAuthor = authorizeRole(["admin"]);

const genId = (prefix = "cm") => `${prefix}${Date.now()}`;

/* =====================================================
   🔹 GET ALL COMPETENCY MODELS
===================================================== */
router.get("/models", (req, res) => {
  const db = loadDB();
  res.json(db.competencyModels || []);
});

/* =====================================================
   🔹 GET SINGLE MODEL (WITH ITS COMPETENCIES)
===================================================== */
router.get("/models/:id", (req, res) => {
  const db = loadDB();
  const model = db.competencyModels?.find(m => m.id === req.params.id);

  if (!model) {
    return res.status(404).json({ error: "Model not found" });
  }

  const competencies = db.competencies?.filter(c => c.modelId === model.id) || [];

  res.json({ ...model, competencies });
});

/* =====================================================
   🔹 GET ALL COMPETENCIES
===================================================== */
router.get("/", (req, res) => {
  const db = loadDB();
  res.json(db.competencies || []);
});

/* =====================================================
   🔹 Shared create logic, used by both POST /models (single) and
   POST /models/bulk. Mutates `db` (pushes the new model) but does not
   save it -- the caller persists once, so bulk import writes the file
   once per batch instead of once per row.
===================================================== */
function createCompetencyModelRecord(payload = {}, db, idSuffix = "") {
  const newModel = {
    id: `${genId()}${idSuffix}`,
    name: payload.name || "",
    description: payload.description || "",
    measurementIntent: payload.measurementIntent || "",
    constructFramework: payload.constructFramework || {},
    // TR9 §2.3.1 — claim stance + SMV distribution. Previously dropped on
    // create, which made the schema fields unreachable from bulk/POST.
    psychologicalPerspective: payload.psychologicalPerspective || undefined,
    smVariables: Array.isArray(payload.smVariables) ? payload.smVariables : [],

    status: "draft",
    locked: false,
    versionNumber: 1,
    parentModelId: null,

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const { valid, errors } = validateEntity("competencyModels", newModel, db);
  if (!valid) return { ok: false, status: 400, error: "Schema validation failed", details: errors };

  db.competencyModels = db.competencyModels || [];
  db.competencyModels.push(newModel);

  return { ok: true, status: 201, record: newModel };
}

/* =====================================================
   🔹 Shared create logic for a single competency belonging to a given
   model. Same relaxed { strict: false } validation as POST / below --
   only variableType is required; state/scale completeness is enforced
   later at /models/:id/confirm.
===================================================== */
function createCompetencyRecord(payload = {}, db, modelId, idSuffix = "") {
  const {
    id: _ignoreId,
    modelId: _ignoreModelId,
    createdAt: _ignoreCreatedAt,
    updatedAt: _ignoreUpdatedAt,
    relationships: _ignoreRelationships,
    ...rest
  } = payload || {};

  const newComp = {
    ...rest,
    id: `c${Date.now()}${idSuffix}`,
    modelId,
    relationships: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const { valid, errors } = validateEntity("competencies", newComp, db, { strict: false });
  if (!valid) return { ok: false, status: 400, error: "Schema validation failed", details: errors };

  db.competencies = db.competencies || [];
  db.competencies.push(newComp);

  return { ok: true, status: 201, record: newComp };
}

/**
 * Remap relationship targets after a nested bulk create.
 * Accepts targetCompetencyId (old export id or already-new id) or
 * targetCompetencyName (case-insensitive match within the batch).
 * Targets that are neither remapped nor named are left as-is so a
 * reference to an already-existing competency outside the batch can
 * still validate against db.
 */
function remapRelationships(rawRelationships, idMap, nameMap) {
  if (!Array.isArray(rawRelationships) || rawRelationships.length === 0) {
    return { ok: true, relationships: [] };
  }

  const relationships = [];
  const errors = [];

  rawRelationships.forEach((r, i) => {
    if (!r || typeof r !== "object") {
      errors.push(`relationships[${i}] must be an object.`);
      return;
    }
    let targetId = r.targetCompetencyId || null;
    if (targetId && idMap.has(targetId)) {
      targetId = idMap.get(targetId);
    }
    if (!targetId && r.targetCompetencyName) {
      targetId = nameMap.get(String(r.targetCompetencyName).trim().toLowerCase()) || null;
    }
    if (!targetId) {
      errors.push(
        `relationships[${i}] could not resolve targetCompetencyId/targetCompetencyName.`
      );
      return;
    }
    relationships.push({
      targetCompetencyId: targetId,
      type: r.type,
    });
  });

  return { ok: errors.length === 0, relationships, errors };
}

/**
 * Create nested competencies for one bulk model row: two-pass so
 * intra-model relationships can cite sibling ids (or names) from the
 * same file. Then sync smVariables (TR9) from the created competencies,
 * preserving priors from the payload when ids/labels still match.
 */
function createNestedCompetenciesForModel({
  competencies,
  model,
  db,
  rowIndex,
  existingSmVariables = [],
}) {
  if (!Array.isArray(competencies) || competencies.length === 0) {
    return {
      ok: true,
      competenciesCreated: 0,
      competenciesFailed: 0,
      competencyResults: [],
      createdCompetencies: [],
    };
  }

  if (
    model.measurementIntent === "unidimensional" &&
    competencies.length > 1
  ) {
    return {
      ok: false,
      error: "Schema validation failed",
      details: [
        "Unidimensional Student Model cannot include multiple nested competencies in one bulk row. Use measurementIntent \"multidimensional\" or upload a single competency.",
      ],
      competenciesCreated: 0,
      competenciesFailed: competencies.length,
      competencyResults: [],
      createdCompetencies: [],
    };
  }

  const idMap = new Map();
  const nameMap = new Map();
  const created = [];
  const competencyResults = [];
  const pendingRelationships = [];

  competencies.forEach((comp, j) => {
    const oldId = comp?.id;
    const result = createCompetencyRecord(
      comp || {},
      db,
      model.id,
      `_${rowIndex}_${j}`
    );
    if (!result.ok) {
      competencyResults.push({
        index: j,
        ok: false,
        error: result.error,
        details: result.details,
      });
      return;
    }

    const record = result.record;
    created.push(record);
    if (oldId) idMap.set(oldId, record.id);
    idMap.set(record.id, record.id);
    if (record.name) {
      nameMap.set(String(record.name).trim().toLowerCase(), record.id);
    }
    pendingRelationships.push({
      record,
      raw: Array.isArray(comp?.relationships) ? comp.relationships : [],
    });
    competencyResults.push({
      index: j,
      ok: true,
      id: record.id,
      name: record.name,
    });
  });

  if (created.length !== competencies.length) {
    // Roll back this model's competencies so a partial nest doesn't leave
    // an inconsistent draft (e.g. unidimensional sibling collision mid-batch).
    const createdIds = new Set(created.map((c) => c.id));
    db.competencies = (db.competencies || []).filter((c) => !createdIds.has(c.id));
    return {
      ok: false,
      error: "Nested competency validation failed",
      details: competencyResults
        .filter((r) => !r.ok)
        .flatMap((r) => r.details || [r.error]),
      competenciesCreated: 0,
      competenciesFailed: competencies.length,
      competencyResults,
      createdCompetencies: [],
    };
  }

  for (const { record, raw } of pendingRelationships) {
    const remapped = remapRelationships(raw, idMap, nameMap);
    if (!remapped.ok) {
      const createdIds = new Set(created.map((c) => c.id));
      db.competencies = (db.competencies || []).filter((c) => !createdIds.has(c.id));
      return {
        ok: false,
        error: "Relationship remapping failed",
        details: remapped.errors,
        competenciesCreated: 0,
        competenciesFailed: competencies.length,
        competencyResults,
        createdCompetencies: [],
      };
    }
    record.relationships = remapped.relationships;
    // Re-validate with relationships now that sibling targets exist.
    const { valid, errors } = validateEntity("competencies", record, db, {
      strict: false,
    });
    if (!valid) {
      const createdIds = new Set(created.map((c) => c.id));
      db.competencies = (db.competencies || []).filter((c) => !createdIds.has(c.id));
      return {
        ok: false,
        error: "Schema validation failed",
        details: errors,
        competenciesCreated: 0,
        competenciesFailed: competencies.length,
        competencyResults,
        createdCompetencies: [],
      };
    }
  }

  // Remap payload SMV ids → new competency ids, then sync scale/priors.
  const remappedExisting = (existingSmVariables || [])
    .filter((s) => s && typeof s === "object")
    .map((s) => {
      const nextId = s.id && idMap.has(s.id) ? idMap.get(s.id) : s.id;
      return { ...s, id: nextId };
    });

  model.smVariables = syncSmVariablesFromCompetencies(created, remappedExisting);
  model.updatedAt = new Date().toISOString();

  return {
    ok: true,
    competenciesCreated: created.length,
    competenciesFailed: 0,
    competencyResults,
    createdCompetencies: created,
  };
}

/* =====================================================
   🔹 CREATE MODEL (DRAFT ONLY)
===================================================== */
router.post("/models", canAuthor, (req, res) => {
  const db = loadDB();
  const result = createCompetencyModelRecord(req.body || {}, db);
  if (!result.ok) return res.status(result.status).json({ errors: result.details || [result.error] });

  saveDB(db);
  res.status(result.status).json(result.record);
});

/* =====================================================
   🔹 CREATE MODELS IN BULK (DRAFT ONLY, WITH OPTIONAL NESTED COMPETENCIES)
   Accepts a JSON array, { competencyModels: [...] }, a single model
   object, or a Step 9 specification export ({ model, competencies,
   smVariables }). Nested competencies are created in two passes so
   intra-model relationships remap old ids / names onto generated ids,
   then smVariables are synced (TR9 §2.3.1).
===================================================== */
router.post("/models/bulk", canAuthor, (req, res) => {
  const rows = normalizeStudentModelBulkRows(req.body, {
    assumeArrayIsStudentModel: true,
  });
  if (!rows) {
    return res.status(400).json({
      error:
        "Request body must be a JSON array of Student Models, { competencyModels: [...] }, a single model object, or a Step 9 specification export ({ model, competencies }).",
    });
  }

  const db = loadDB();
  const results = rows.map((row, i) => {
    const stripped = stripStudentModelImportIdentity(row || {});
    const { competencies, smVariables, ...modelPayload } = stripped;
    const modelResult = createCompetencyModelRecord(
      {
        ...modelPayload,
        // Priors/SMVs are synced after nested comps land; avoid validating
        // stale export ids on the empty model shell.
        smVariables: [],
      },
      db,
      `_${i}`
    );
    if (!modelResult.ok) {
      return { index: i, ok: false, error: modelResult.error, details: modelResult.details };
    }

    const newModel = modelResult.record;
    const nest = createNestedCompetenciesForModel({
      competencies,
      model: newModel,
      db,
      rowIndex: i,
      existingSmVariables: Array.isArray(smVariables) ? smVariables : [],
    });

    if (!nest.ok) {
      // Remove the orphan model shell if nested create failed.
      db.competencyModels = (db.competencyModels || []).filter(
        (m) => m.id !== newModel.id
      );
      return {
        index: i,
        ok: false,
        error: nest.error,
        details: nest.details,
        competenciesCreated: nest.competenciesCreated,
        competenciesFailed: nest.competenciesFailed,
        competencyResults: nest.competencyResults,
      };
    }

    return {
      index: i,
      ok: true,
      id: newModel.id,
      name: newModel.name,
      competenciesCreated: nest.competenciesCreated,
      competenciesFailed: nest.competenciesFailed,
      competencyResults: nest.competencyResults,
      smVariableCount: Array.isArray(newModel.smVariables)
        ? newModel.smVariables.length
        : 0,
    };
  });
  saveDB(db);

  const created = results.filter((r) => r.ok).length;
  res.status(207).json({ created, failed: results.length - created, results });
});

/* =====================================================
   🔹 UPDATE MODEL (DRAFT ONLY)
===================================================== */
router.put("/models/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const { id } = req.params;

  const idx = db.competencyModels?.findIndex(m => m.id === id);
  if (idx === -1) return res.status(404).json({ error: "Model not found" });

  const existing = db.competencyModels[idx];

  if (existing.locked) {
    return res.status(409).json({
      error: "Confirmed model cannot be modified. Clone to edit."
    });
  }

  /* A model under review stays under review across auto-saves. The wizard
     silently PUTs on every Next, including when a reviewer re-walks the
     steps from the Operate tab's Review button -- forcing "draft" here
     would demote the model behind the reviewer's back and put the final
     step's Lock & Confirm button out of reach. */
  const updated = {
    ...existing,
    ...req.body,
    status: existing.status === "reviewed" ? "reviewed" : "draft",
    locked: false,
    updatedAt: new Date().toISOString()
  };

  const { valid, errors } = validateEntity("competencyModels", updated, db);
  if (!valid) return res.status(400).json({ errors });

  db.competencyModels[idx] = updated;
  saveDB(db);

  res.json(updated);
});

/* =====================================================
   🔹 CONFIRM MODEL (STRICT STRUCTURAL VALIDATION)
===================================================== */
router.post("/models/:id/confirm", authorizeRole(["admin", "district"]), (req, res) => {
  const db = loadDB();
  const model = db.competencyModels?.find(m => m.id === req.params.id);

  if (!model) return res.status(404).json({ error: "Model not found" });
  if (model.locked) {
    return res.status(409).json({ error: "Model already confirmed." });
  }

  /* Review is a real gate, not an aspiration. lifecycleMatrix.TRANSITIONS
     has always declared draft -> reviewed -> confirmed; this endpoint used
     to confirm straight from draft, which made the matrix a lie. The wizard
     now reaches Lock & Confirm only from `reviewed`. */
  if (model.status !== "reviewed") {
    return res.status(409).json({
      error: "Only reviewed models can be confirmed. Save the model first, then reopen it with Review."
    });
  }

  const relatedCompetencies = db.competencies?.filter(
    c => c.modelId === model.id
  ) || [];

  if (relatedCompetencies.length === 0) {
    return res.status(400).json({
      error: "Cannot confirm model without at least one competency."
    });
  }

  // TR9 §2.3.1 — freeze SMVs from competencies before validation.
  model.smVariables = syncSmVariablesFromCompetencies(
    relatedCompetencies,
    model.smVariables || []
  );

  const audit = computeStructuralAudit({
    model,
    competencies: relatedCompetencies,
  });
  if (!audit.allPassed) {
    return res.status(400).json({
      error: "Structural audit failed. Resolve checklist items before confirmation.",
      checks: audit.checks,
      advisories: audit.advisories,
    });
  }

  // Two-person gate: submitter (reviewed) ≠ confirmer, unless an admin
  // explicitly acknowledges same-author confirmation for solo lab use.
  const submitter = model.reviewMeta?.submittedBy || null;
  const confirmer = req.user?.username || null;
  const sameAuthor = submitter && confirmer && submitter === confirmer;
  const acknowledgeSameAuthor = req.body?.acknowledgeSameAuthor === true;
  const sameAuthorReason =
    typeof req.body?.sameAuthorReason === "string"
      ? req.body.sameAuthorReason.trim()
      : "";

  if (sameAuthor) {
    if (req.user?.role !== "admin" || !acknowledgeSameAuthor || sameAuthorReason.length < 10) {
      return res.status(409).json({
        error:
          "Confirmer must differ from the reviewer who submitted this model. An admin may confirm their own submission only with acknowledgeSameAuthor and a sameAuthorReason (≥10 chars).",
        submitter,
        confirmer,
      });
    }
  }

  // Validate model itself
  const modelValidation = validateEntity("competencyModels", model, db, {
    strict: true,
    requireCafCompleteness: true,
  });
  if (!modelValidation.valid) {
    return res.status(400).json({ errors: modelValidation.errors });
  }

  // Validate every competency strictly
  for (const comp of relatedCompetencies) {
    const compValidation = validateEntity("competencies", comp, db, { strict: true });
    if (!compValidation.valid) {
      return res.status(400).json({
        error: `Competency validation failed for '${comp.name}'`,
        details: compValidation.errors
      });
    }
  }

  const now = new Date().toISOString();
  model.status = "confirmed";
  model.locked = true;
  model.updatedAt = now;
  model.confirmMeta = {
    ...(model.confirmMeta || {}),
    confirmedAt: now,
    confirmedBy: confirmer,
    acknowledgeSameAuthor: sameAuthor ? true : false,
    sameAuthorReason: sameAuthor ? sameAuthorReason : undefined,
  };
  model.specification = buildStudentModelSpecification({
    model,
    competencies: relatedCompetencies,
  });

  saveDB(db);
  res.json(model);
});

/* =====================================================
   🔹 ARCHIVE MODEL (confirmed → archived)

   Confirmation locks the Student Model. Archive withdraws it as a parent
   for new Evidence Models / Q-matrices / assemblies. Structure stays;
   clone is refused. Draft/reviewed models are deleted, not archived.
===================================================== */
router.post("/models/:id/archive", canAuthor, (req, res) => {
  const db = loadDB();
  const model = db.competencyModels?.find((m) => m.id === req.params.id);

  if (!model) return res.status(404).json({ error: "Model not found" });
  if (model.status === "archived") {
    return res.status(409).json({ error: "Model is already archived." });
  }

  const prevStatus = model.status || "draft";
  if (!model.locked || !canTransition(prevStatus, "archived") || prevStatus === "archived") {
    return res.status(409).json({
      error: "Only a confirmed (locked) competency model can be archived.",
    });
  }

  const now = new Date().toISOString();
  model.status = "archived";
  model.locked = true;
  model.updatedAt = now;
  model.archiveMeta = {
    ...(model.archiveMeta || {}),
    archivedAt: now,
    archivedFrom: prevStatus,
  };

  saveDB(db);
  res.json(model);
});

/* =====================================================
   🔹 REVIEW GATE (draft <-> reviewed)

   Mirrors the evidence model's PATCH /:id/lifecycle for the two
   pre-confirmation states only. Confirmation is deliberately NOT
   reachable here -- POST /models/:id/confirm owns that gate with its
   strict per-competency validation, and a second, weaker path to
   confirmed is exactly what the review gate exists to prevent.
===================================================== */
router.patch("/models/:id/lifecycle", canAuthor, (req, res) => {
  const db = loadDB();
  const model = db.competencyModels?.find(m => m.id === req.params.id);

  if (!model) return res.status(404).json({ error: "Model not found" });
  if (model.locked) {
    return res.status(409).json({ error: "Confirmed model cannot change status. Clone to edit." });
  }

  const { nextStatus } = req.body || {};
  const prevStatus = model.status || "draft";

  if (!["draft", "reviewed"].includes(nextStatus)) {
    return res.status(400).json({
      error: `'${nextStatus}' is not reachable here. This route moves a model between draft and reviewed only.`
    });
  }

  if (!canTransition(prevStatus, nextStatus)) {
    return res.status(400).json({
      error: `Invalid transition from ${prevStatus} to ${nextStatus}.`
    });
  }

  const now = new Date().toISOString();

  if (prevStatus !== nextStatus) {
    model.status = nextStatus;
    model.locked = false;
    model.reviewMeta = {
      ...(model.reviewMeta || {}),
      ...(nextStatus === "reviewed"
        ? {
            submittedForReviewAt: now,
            submittedBy: req.user?.username || null,
          }
        : {
            returnedToDraftAt: now,
            returnedBy: req.user?.username || null,
          }),
    };
    // Keep SMVs aligned whenever a model enters review.
    if (nextStatus === "reviewed") {
      const related = (db.competencies || []).filter((c) => c.modelId === model.id);
      model.smVariables = syncSmVariablesFromCompetencies(
        related,
        model.smVariables || []
      );
    }
    model.updatedAt = now;
    saveDB(db);
  }

  res.json(model);
});

/* =====================================================
   🔹 CLONE MODEL (STRUCTURAL VERSIONING)
===================================================== */
router.post("/models/:id/clone", canAuthor, (req, res) => {
  const db = loadDB();
  const original = db.competencyModels?.find(m => m.id === req.params.id);

  if (!original) return res.status(404).json({ error: "Model not found." });
  if (!original.locked || original.status === "archived") {
    return res.status(400).json({ error: "Only locked, non-archived competency models can be cloned." });
  }

  const siblings = db.competencyModels.filter(
    m => m.parentModelId === original.id || m.id === original.id
  );

  const versionNumber =
    Math.max(...siblings.map(m => m.versionNumber || 1)) + 1;

  // CompetencyWizard's Step 9 CloneModelDialog collects a name for the new
  // version and sends it here; the plain list-view "Clone" button (no name
  // prompt) sends no body at all, so fall back to the original model's name
  // to keep that path working exactly as before.
  const requestedName =
    typeof req.body?.name === "string" ? req.body.name.trim() : "";

  const clonedModel = {
    ...original,
    id: genId(),
    name: requestedName || original.name,
    status: "draft",
    locked: false,
    parentModelId: original.id,
    versionNumber,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.competencyModels.push(clonedModel);

  // Deep clone competencies with remapped relationships
  const originalComps = db.competencies?.filter(
    c => c.modelId === original.id
  ) || [];

  const compIdMap = {};
  for (const comp of originalComps) {
    compIdMap[comp.id] = `c${Date.now()}${Math.floor(Math.random() * 1000)}`;
  }

  const clonedComps = originalComps.map(comp => ({
    ...comp,
    id: compIdMap[comp.id],
    modelId: clonedModel.id,
    relationships: (comp.relationships || []).map(r => ({
      ...r,
      targetCompetencyId: compIdMap[r.targetCompetencyId]
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));

  db.competencies = [...(db.competencies || []), ...clonedComps];

  saveDB(db);
  res.status(201).json(clonedModel);
});

/* =====================================================
   🔹 DELETE MODEL (DRAFT ONLY + REFERENTIAL PROTECTION)
===================================================== */
router.delete("/models/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const model = db.competencyModels?.find(m => m.id === req.params.id);

  if (!model) return res.status(404).json({ error: "Model not found" });
  if (model.locked) {
    return res.status(409).json({ error: "Confirmed models cannot be deleted." });
  }

  const modelCompetencies = db.competencies?.filter(
    c => c.modelId === model.id
  ) || [];

  const usedByEvidence = db.evidenceModels?.some(em =>
    modelCompetencies.some(c => c.id === em.competencyId) && em.locked
  );

  if (usedByEvidence) {
    return res.status(409).json({
      error: "Cannot delete Competency Model referenced by confirmed Evidence Models."
    });
  }

  db.competencyModels = db.competencyModels.filter(m => m.id !== model.id);
  db.competencies = db.competencies.filter(c => c.modelId !== model.id);

  saveDB(db);
  res.status(204).end();
});

/* =====================================================
   🔹 COMPETENCY CRUD (DRAFT ONLY + CROSS‑LAYER SAFETY)
===================================================== */
router.post("/", canAuthor, (req, res) => {
  const db = loadDB();
  const payload = req.body;

  const model = db.competencyModels?.find(m => m.id === payload.modelId);
  if (!model) return res.status(400).json({ error: "Invalid modelId" });
  if (model.locked) {
    return res.status(409).json({ error: "Cannot modify confirmed model." });
  }

  // Draft-time save: variable type (Step 4) may be set, but the state
  // space / scale (Step 5) usually isn't yet -- don't block the wizard's
  // own auto-save with completeness rules meant for /confirm.
  const result = createCompetencyRecord(payload, db, payload.modelId);
  if (!result.ok) return res.status(result.status).json({ errors: result.details || [result.error] });

  saveDB(db);
  res.status(result.status).json(result.record);
});

router.put("/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const idx = db.competencies?.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Competency not found" });

  const existing = db.competencies[idx];
  const model = db.competencyModels?.find(m => m.id === existing.modelId);

  if (model?.locked) {
    return res.status(409).json({ error: "Cannot modify competency in confirmed model." });
  }

  const updated = {
    ...existing,
    ...req.body,
    updatedAt: new Date().toISOString()
  };

  // Same reasoning as the create route above: draft-time updates skip
  // structural-completeness checks so incremental progress across Step
  // 4/5 can save; /models/:id/confirm still enforces them in full.
  const { valid, errors } = validateEntity("competencies", updated, db, { strict: false });
  if (!valid) return res.status(400).json({ errors });

  db.competencies[idx] = updated;
  saveDB(db);

  res.json(updated);
});

router.delete("/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const comp = db.competencies?.find(c => c.id === req.params.id);
  if (!comp) return res.status(404).json({ error: "Not found" });

  const model = db.competencyModels?.find(m => m.id === comp.modelId);

  if (model?.locked) {
    return res.status(409).json({ error: "Cannot delete competency in confirmed model." });
  }

  const evidenceUsing = db.evidenceModels?.filter(
    em => em.competencyId === comp.id && em.locked
  );

  if (evidenceUsing?.length > 0) {
    return res.status(409).json({
      error: "Cannot delete competency referenced by confirmed Evidence Model."
    });
  }

  db.competencies = db.competencies.filter(c => c.id !== comp.id);
  saveDB(db);

  res.status(204).end();
});

export default router;
