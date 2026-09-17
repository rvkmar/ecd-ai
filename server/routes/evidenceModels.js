// routes/evidenceModels.js
// 🧠 Extreme Strict ECD — Evidence Model Routes
// Lifecycle Governed: Draft → Confirm → Lock → Clone → Recalibrate
//                     → Operational ⇄ Suspended → Archived
// Full Cross-Layer Protection (Evidence ↔ Competency)

import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { validateEntity } from "../../src/utils/schema.js";
import { canTransition } from "../utils/lifecycleMatrix.js";

const router = express.Router();

// Every endpoint in this router requires a valid, logged-in session.
// (Previously this file had no auth check at all — added as part of the
// Phase 1 security hardening pass; see AUTH_SECURITY_FIXES.md.)
router.use(authenticateToken);

// Every write route also needs a role gate: this file had none at all,
// while src/config/rolePermissions.js already declared evidenceModels
// editing as admin-only (canEdit/canDelete).
const canAuthor = authorizeRole(["admin"]);

const genId = (prefix = "em") => `${prefix}${Date.now()}`;

/* =====================================================
   🔒 CALIBRATION WINDOW
   -----------------------------------------------------
   Parameters, parameter-set activation and the decision rule may only
   change while the model is locked AND NOT live. "confirmed" is the
   pre-deployment window; "suspended" is the deliberate re-open of that
   window on a model that has already been operational.

   An operational model is deliberately excluded: changing what scores a
   live administration halfway through is exactly the thing lifecycle
   governance exists to prevent. The path is
   operational → suspended → recalibrate → operational, which is the
   transition set lifecycleMatrix.js already declares.
===================================================== */

const CALIBRATION_STATUSES = ["confirmed", "suspended"];

export function calibrationGate(model, action) {

  if (!model.locked) {
    return `${action} is allowed only after the evidence model is confirmed.`;
  }

  if (model.status === "operational") {
    return `${action} is blocked while the evidence model is operational. Deactivate it (operational → suspended) first, then reactivate once the change is verified.`;
  }

  if (!CALIBRATION_STATUSES.includes(model.status)) {
    return `${action} is allowed only for confirmed or suspended models (this model is '${model.status}').`;
  }

  return null;
}

/* =====================================================
   🔒 OPERATIONAL READINESS
   Single source of truth for the confirmed/suspended → operational
   gate. Mirrored client-side by computeReadiness() in
   src/components/evidences/calibration/engines/effectiveModel.js --
   keep the two in step.
===================================================== */

/* Task models whose link to this evidence model actually counts.
   A DRAFT task model is still being authored -- it can drop the link or be
   deleted at any moment, so it is not evidence that anything will ever
   collect this data. */
const BINDING_TASK_MODEL_STATUSES = ["confirmed", "operational", "suspended"];

export function linkedTaskModels(evidenceModelId, db) {
  return (db?.taskModels || []).filter(
    tm =>
      Array.isArray(tm.evidenceModelIds) &&
      tm.evidenceModelIds.includes(evidenceModelId) &&
      BINDING_TASK_MODEL_STATUSES.includes(tm.status)
  );
}

/* Task models actually IN DELIVERY against this evidence model.

   Narrower than linkedTaskModels() on purpose: that one answers "does
   anything depend on this structurally?", which is the right question for
   structural edits. This one answers "would taking this evidence model
   down break something that is running right now?", and only an
   operational task model is running. */
export function liveTaskModels(evidenceModelId, db) {
  return (db?.taskModels || []).filter(
    tm =>
      Array.isArray(tm.evidenceModelIds) &&
      tm.evidenceModelIds.includes(evidenceModelId) &&
      tm.status === "operational"
  );
}

function taskModelsStillLiveMessage(action, live) {
  const names = live
    .map(tm => `"${tm.name || tm.id}" (v${tm.versionNumber ?? 1})`)
    .join(", ");

  return (
    `${action} is blocked: ${live.length} task model${live.length === 1 ? " is" : "s are"} still operational against it — ${names}. ` +
    `Deactivate ${live.length === 1 ? "it" : "them"} first (operational → suspended), then retry.`
  );
}

function readinessErrorsFor(model, db) {

  const errors = [];
  const activeModel = model.statisticalModels?.find(sm => sm.active);

  if (!activeModel) {
    errors.push("An active statistical model is required.");
  } else {
    if (!activeModel.parameterSets?.length) {
      errors.push("Active statistical model requires calibrated parameter sets.");
    }
    if (!activeModel.activeParameterSetId) {
      errors.push("An active parameter set must be selected.");
    }
  }

  // A decision rule has to be a COMPLETE rule, not merely present. The
  // old check was `!model.decisionRule`, which a legacy `{ cutScore: 5 }`
  // -- a shape schema.js does not recognise -- sailed straight through.
  const dr = model.decisionRule;

  if (!dr || typeof dr !== "object") {
    errors.push("A decision rule must be defined.");
  } else {
    if (!dr.type) errors.push("Decision rule is missing its type.");
    if (typeof dr.threshold !== "number") errors.push("Decision rule threshold must be numeric.");
    if (!["above", "below", "within"].includes(dr.direction)) {
      errors.push("Decision rule direction must be above, below or within.");
    }
    if (!dr.justification || String(dr.justification).length < 10) {
      errors.push("Decision rule requires a justification of at least 10 characters.");
    }
  }

  /* ---------------------------------------------------
    🔒 DELIVERY BINDING
    An evidence model does not observe anything by itself -- a task model
    is what puts its observables in front of a learner. Activating one
    with no confirmed task model bound to it declares "this is scoring
    live sessions" about a model that no session can ever reach.
    Draft task models do not count: the link is not settled yet.
  --------------------------------------------------- */

  const bound = linkedTaskModels(model.id, db);

  if (bound.length === 0) {

    const draftsOnly = (db?.taskModels || []).filter(
      tm =>
        Array.isArray(tm.evidenceModelIds) &&
        tm.evidenceModelIds.includes(model.id)
    );

    errors.push(
      draftsOnly.length > 0
        ? `This evidence model is referenced by ${draftsOnly.length} task model(s), but none of them is confirmed. Confirm a task model that uses it before activation.`
        : "No confirmed task model references this evidence model. An evidence model cannot go operational until a task model delivers its observables to learners."
    );
  }

  return errors;
}

/* =====================================================
   🔹 GET ALL
===================================================== */
router.get("/", (req, res) => {
  const db = loadDB();
  res.json(db.evidenceModels || []);
});

/* =====================================================
   🔹 GET ONE
===================================================== */
router.get("/:id", (req, res) => {
  const db = loadDB();
  const model = db.evidenceModels?.find(m => m.id === req.params.id);

  if (!model) {
    return res.status(404).json({ error: "Model not found" });
  }

  res.json(model);
});

/* =====================================================
   🔹 Shared create logic, used by both POST / (single) and POST /bulk.
   Mutates `db` (pushes the new model) but does not save it -- the caller
   persists once, so bulk import writes the file once per batch instead
   of once per row.
===================================================== */
function createEvidenceModelRecord(payload = {}, db, idSuffix = "", options = {}) {
  // Cross-layer existence check. `competencyId` is the preferred, unambiguous
  // reference. A bulk-upload row that doesn't know the internal id yet (it's
  // server-generated, e.g. "c1787128144166_1_4" from a positional bulk
  // competency-model import) may instead supply `competencyName` and have it
  // resolved here -- by exact, case-insensitive, *unique* name match only.
  // This exists specifically so bulk files don't have to guess an id by
  // counting rows in a separate upload; guessing positionally is exactly how
  // an evidence model can end up silently bound to the wrong competency.
  //
  // When `competencyModelId` is supplied (Settings EM uploader / pack wrapper),
  // name resolution is scoped to that Student Model's competencies so two
  // models that share a competency label (e.g. "Force Concept Mastery") do
  // not collide.
  let competencyId = payload.competencyId;
  const scopeModelId =
    options.competencyModelId ||
    payload.competencyModelId ||
    null;

  if (scopeModelId && !(db.competencyModels || []).some((m) => m.id === scopeModelId)) {
    return {
      ok: false,
      status: 400,
      error: `Student Model (competencyModelId) '${scopeModelId}' was not found.`,
    };
  }

  if (!competencyId && payload.competencyName) {
    const needle = String(payload.competencyName).trim().toLowerCase();
    let pool = db.competencies || [];
    if (scopeModelId) {
      pool = pool.filter((c) => c.modelId === scopeModelId);
    }
    const matches = pool.filter(
      (c) => (c.name || "").trim().toLowerCase() === needle
    );

    if (matches.length === 0) {
      return {
        ok: false,
        status: 400,
        error: scopeModelId
          ? `No competency named "${payload.competencyName}" on Student Model '${scopeModelId}'.`
          : `No competency found named "${payload.competencyName}".`,
      };
    }
    if (matches.length > 1) {
      return {
        ok: false,
        status: 400,
        error: `"${payload.competencyName}" matches ${matches.length} competencies; specify competencyId or a Student Model id to scope the match.`,
      };
    }

    competencyId = matches[0].id;
  }

  if (!competencyId) {
    return { ok: false, status: 400, error: "competencyId (or a unique competencyName) is required." };
  }

  const competency = db.competencies?.find(c => c.id === competencyId);
  if (!competency) {
    return { ok: false, status: 400, error: "Referenced competency does not exist." };
  }

  if (scopeModelId && competency.modelId !== scopeModelId) {
    return {
      ok: false,
      status: 400,
      error: `Competency '${competencyId}' does not belong to Student Model '${scopeModelId}'.`,
    };
  }

  const competencyModel = db.competencyModels?.find(
    m => m.id === competency.modelId
  );

  if (!competencyModel) {
    return { ok: false, status: 400, error: "Referenced competency model does not exist." };
  }

  // Evidence rules are authored (by the wizard, and now by bulk-upload
  // payloads too) as a top-level evidenceRules[] array keyed by
  // observableId -- that's what Step5/6/8 of the wizard UI read. But
  // schema.js's validateEntity (run on every PUT/confirm) and several
  // other consumers (evidenceDiagnosticsEngine, BayesianEvidenceNetwork,
  // StatisticalModelCard, ObservableMappingTable, etc.) read an embedded
  // observable.evidenceRule object instead. EvidenceWizardContext keeps
  // both in sync for wizard edits; mirror that here so a bulk-uploaded
  // model (which only needs to provide evidenceRules[], the simpler
  // canonical shape) doesn't hit the same "missing evidenceRule"
  // contradiction that Step 6/7 used to show for wizard-built drafts.
  // A payload observable that already sets its own evidenceRule directly
  // is left as-is.
  const evidenceRules = payload.evidenceRules || [];
  const evidenceRuleByObservableId = new Map(
    evidenceRules.map(r => [r.observableId, r])
  );
  const observables = (payload.observables || []).map(o => ({
    ...o,
    evidenceRule: o.evidenceRule || evidenceRuleByObservableId.get(o.id) || o.evidenceRule
  }));

  // Warrants must carry the construct (competencyId) they're bound to --
  // Step 3 of the wizard gates on it and shows "Unassigned Construct" /
  // disables Next with no way to fix it from a collapsed card otherwise.
  // A bulk/POST payload almost never has a reason to bind a warrant to a
  // *different* competency than the model itself, so default any warrant
  // that doesn't specify its own competencyId to the model's, same as the
  // wizard's own "Add Warrant" button already does for UI-created warrants.
  const warrants = (payload.warrants || []).map(w => ({
    ...w,
    competencyId: w.competencyId || competencyId
  }));

  // Resolve structureConfig.qMatrixName → qMatrixId when a unique Q-matrix
  // exists (Force→DINA bulk path). If the Q-matrix is not uploaded yet,
  // keep qMatrixName and omit qMatrixId so draft dina models remain valid.
  const statisticalModels = (payload.statisticalModels || []).map((sm) => {
    const cfg = sm?.structureConfig && typeof sm.structureConfig === "object"
      ? { ...sm.structureConfig }
      : sm?.structureConfig;
    if (
      cfg &&
      !cfg.qMatrixId &&
      cfg.qMatrixName &&
      (sm.type === "dina" || sm.type === "gdina")
    ) {
      const needle = String(cfg.qMatrixName).trim().toLowerCase();
      const matches = (db.qMatrixModels || []).filter(
        (q) => (q.name || "").trim().toLowerCase() === needle
      );
      if (matches.length === 1) {
        cfg.qMatrixId = matches[0].id;
      }
    }
    return cfg ? { ...sm, structureConfig: cfg } : sm;
  });

  const newModel = {
    id: `${genId()}${idSuffix}`,
    name: payload.name || "",
    description: payload.description || "",
    // Authoring / governance notes (coherence advisories, CAF rationale).
    // Not schema-gated at draft; preserved so bulk imports and wizard
    // reviews keep TR9 design intent visible beside the claim chain.
    authoringNotes: payload.authoringNotes || null,
    studentModelCoherenceNotes: payload.studentModelCoherenceNotes || null,
    competencyId,
    competencyModelVersion: competencyModel.versionNumber,
    claimStatement: payload.claimStatement || "",
    warrants,
    observables,
    evidenceRules,
    statisticalModels,
    decisionRule: payload.decisionRule || null,
    evaluationProcedures: Array.isArray(payload.evaluationProcedures)
      ? payload.evaluationProcedures
      : [],
    fairnessNotes: payload.fairnessNotes || "",
    difReviewChecklist: Array.isArray(payload.difReviewChecklist)
      ? payload.difReviewChecklist
      : [],
    calibrationPlan: payload.calibrationPlan || null,
    status: "draft",
    locked: false,
    versionNumber: 1,
    parentModelId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.evidenceModels = db.evidenceModels || [];
  db.evidenceModels.push(newModel);

  return { ok: true, status: 201, record: newModel };
}

/* =====================================================
   🔹 CREATE (DRAFT ONLY)
===================================================== */
router.post("/", canAuthor, (req, res) => {
  const db = loadDB();
  const result = createEvidenceModelRecord(req.body || {}, db);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  saveDB(db);
  res.status(result.status).json(result.record);
});

/* =====================================================
   🔹 CREATE IN BULK (DRAFT ONLY)
   body: EvidenceModel[]
      OR { competencyModelId?, evidenceModels: EvidenceModel[] }

   When competencyModelId (Student Model id) is supplied, competencyName
   remapping is scoped to that model's competencies.
===================================================== */
router.post("/bulk", canAuthor, (req, res) => {
  let rows;
  let competencyModelId = null;

  if (Array.isArray(req.body)) {
    rows = req.body;
  } else if (req.body && typeof req.body === "object" && Array.isArray(req.body.evidenceModels)) {
    rows = req.body.evidenceModels;
    competencyModelId = req.body.competencyModelId || null;
  } else {
    return res.status(400).json({
      error:
        'Request body must be a JSON array of evidence models, or { competencyModelId?, evidenceModels: [...] }.',
    });
  }

  const db = loadDB();
  const results = rows.map((row, i) => {
    const result = createEvidenceModelRecord(row || {}, db, `_${i}`, {
      competencyModelId,
    });
    return result.ok
      ? { index: i, ok: true, id: result.record.id, name: result.record.name }
      : { index: i, ok: false, error: result.error };
  });
  saveDB(db);

  const created = results.filter((r) => r.ok).length;
  res.status(207).json({ created, failed: results.length - created, results });
});

/* =====================================================
   🔹 UPDATE (DRAFT ONLY)
===================================================== */
router.put("/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const idx = db.evidenceModels?.findIndex(m => m.id === req.params.id);

  if (idx === -1) return res.status(404).json({ error: "Model not found" });

  const existing = db.evidenceModels[idx];
  if (existing.locked) {
    return res.status(409).json({
      error: "Model is confirmed. Clone to modify structure."
    });
  }

  if (req.body.competencyId) {
    const competency = db.competencies?.find(c => c.id === req.body.competencyId);
    if (!competency) {
      return res.status(400).json({ error: "Referenced competency does not exist." });
    }
  }

  /* A model under review stays under review across auto-saves -- the wizard
     PUTs silently on every Next, including when a reviewer re-walks the steps
     from the Operate tab's Review button. Forcing "draft" here would demote
     the model behind the reviewer's back. */
  const updated = {
    ...existing,
    ...req.body,
    status: existing.status === "reviewed" ? "reviewed" : "draft",
    locked: false,
    updatedAt: new Date().toISOString()
  };

  /* ---------------------------------------------------
    Draft saves validate NON-strict.

    The Evidence Wizard silently PUTs the draft on every Next (see
    EvidenceWizard.jsx's goNext), so this endpoint receives half-built
    models by design: leaving Step 3 (Warrants) the draft legitimately
    has no observables, no evidence rules and no statistical model yet.
    Validating those completeness rules here rejected the save with a
    400 and surfaced "At least one observable is required." /
    "Observable ... missing evidenceRule." in a red toast, which made
    Next look broken on Steps 3-5.

    { strict: false } keeps every referential-integrity and
    value-validity rule (dangling warrantId, evidenceRule.direction
    outside the enum, parameterSets on a draft) and relaxes only the
    presence of things a LATER wizard step authors. Nothing incomplete
    can slip through: POST /:id/confirm below validates strict, which is
    the gate that actually locks the model.
  --------------------------------------------------- */

  const { valid, errors } = validateEntity("evidenceModels", updated, db, { strict: false });
  if (!valid) return res.status(400).json({ errors });

  db.evidenceModels[idx] = updated;
  saveDB(db);

  res.json(updated);
});

/* =====================================================
   🔹 CONFIRM (STRICT + CROSS-LAYER PROTECTION)
===================================================== */
router.post("/:id/confirm", canAuthor, (req, res) => {
  const db = loadDB();
  const model = db.evidenceModels?.find(m => m.id === req.params.id);

  if (!model) return res.status(404).json({ error: "Model not found" });
  if (model.locked) {
    return res.status(409).json({ error: "Model already confirmed." });
  }

  /* Review is a real gate now. lifecycleMatrix.TRANSITIONS has always
     declared draft -> reviewed -> confirmed, but this endpoint accepted a
     draft directly, so the matrix said review was mandatory while the code
     said it was optional (the open decision in the lifecycle handoff).
     Resolved in favour of the matrix: the wizard's Save promotes to
     reviewed, and only a reviewed model reaches Lock & Confirm. */
  if (model.status !== "reviewed") {
    return res.status(409).json({
      error: "Only reviewed models can be confirmed. Save the model first, then reopen it with Review."
    });
  }

  // 🔒 Cross-layer protection
  const competency = db.competencies?.find(c => c.id === model.competencyId);
  if (!competency) {
    return res.status(400).json({ error: "Referenced competency does not exist." });
  }

  const competencyModel = db.competencyModels?.find(m => m.id === competency.modelId);
  if (!competencyModel) {
    return res.status(400).json({ error: "Referenced competency model does not exist." });
  }

  /* ---------------------------------------------------
    🔒 VERSION SYNCHRONIZATION ENFORCEMENT (Phase 2)
    Evidence must match current competency model version
  --------------------------------------------------- */

  if (model.competencyModelVersion !== competencyModel.versionNumber) {
    return res.status(409).json({
      error:
        "Evidence model is bound to an outdated competency model version. Clone and realign before confirmation."
    });
  }

  /* ---------------------------------------------------
    🔒 MEASUREMENT INTENT ENFORCEMENT (Phase 1)
    Unidimensional → single competency evidence only
  --------------------------------------------------- */

  if (competencyModel.measurementIntent === "unidimensional") {

    // Get all competencies under same model
    const siblingCompetencies = db.competencies?.filter(
      c => c.modelId === competency.modelId
    ) || [];

    const siblingIds = siblingCompetencies.map(c => c.id);

    // Check if any other competency already has confirmed evidence
    const conflictingEvidence = db.evidenceModels?.find(em =>
      em.locked &&
      em.status === "confirmed" &&
      siblingIds.includes(em.competencyId) &&
      em.competencyId !== model.competencyId
    );

    if (conflictingEvidence) {
      return res.status(409).json({
        error:
          "Unidimensional competency model allows confirmed evidence for only one competency."
      });
    }
  }

  /* ---------------------------------------------------
    🔒 PREREQUISITE EVIDENCE ENFORCEMENT (Strict Mode)
    Cannot confirm evidence unless prerequisites
    already have confirmed evidence.
  --------------------------------------------------- */

  const prerequisiteIds = (competency.relationships || [])
    .filter(r => r.type === "prerequisite")
    .map(r => r.targetCompetencyId);

  for (const prereqId of prerequisiteIds) {

    const hasConfirmedEvidence = db.evidenceModels?.some(em =>
      em.locked &&
      em.status === "confirmed" &&
      em.competencyId === prereqId
    );

    if (!hasConfirmedEvidence) {

      const prereqCompetency = db.competencies?.find(c => c.id === prereqId);

      return res.status(409).json({
        error: `Cannot confirm evidence. Prerequisite competency '${prereqCompetency?.name || prereqId}' lacks confirmed evidence model.`
      });
    }
  }

  if (competencyModel.status !== "confirmed" || !competencyModel.locked) {
    return res.status(409).json({
      error: "Cannot confirm Evidence Model while its Competency Model is draft. Confirm Competency Model first."
    });
  }

  const { valid, errors } = validateEntity("evidenceModels", model, db);
  if (!valid) return res.status(400).json({ errors });

  model.status = "confirmed";
  model.locked = true;
  model.updatedAt = new Date().toISOString();

  saveDB(db);
  res.json(model);
});

/* =====================================================
   🔹 CLONE (STRUCTURAL VERSIONING)
===================================================== */
router.post("/:id/clone", canAuthor, (req, res) => {
  const db = loadDB();
  const original = db.evidenceModels?.find(m => m.id === req.params.id);

  if (!original) return res.status(404).json({ error: "Model not found." });
  if (!original.locked) {
    return res.status(400).json({ error: "Only confirmed models can be cloned." });
  }

  const siblings = db.evidenceModels.filter(
    m => m.parentModelId === original.id || m.id === original.id
  );

  const versionNumber =
    Math.max(...siblings.map(m => m.versionNumber || 1)) + 1;

  const cloned = JSON.parse(JSON.stringify(original));

  cloned.id = genId();
  cloned.status = "draft";
  cloned.locked = false;
  cloned.parentModelId = original.id;
  cloned.versionNumber = versionNumber;
  cloned.createdAt = new Date().toISOString();
  cloned.updatedAt = new Date().toISOString();

  // Reset statistical parameter governance
  cloned.statisticalModels = cloned.statisticalModels.map(sm => ({
    ...sm,
    parameterSets: [],
    activeParameterSetId: null
  }));

  db.evidenceModels.push(cloned);
  saveDB(db);

  res.status(201).json(cloned);
});

/* =====================================================
   🔹 RECALIBRATE (CONFIRMED ONLY)
===================================================== */
router.post("/:id/recalibrate", canAuthor, (req, res) => {
  const db = loadDB();
  const model = db.evidenceModels?.find(m => m.id === req.params.id);

  if (!model) return res.status(404).json({ error: "Model not found" });

  const recalibrationBlocked = calibrationGate(model, "Recalibration");
  if (recalibrationBlocked) {
    return res.status(400).json({ error: recalibrationBlocked });
  }

  /* ---------------------------------------------------
    🔒 VERSION SYNCHRONIZATION ENFORCEMENT (Recalibration)
  --------------------------------------------------- */

  const competency = db.competencies?.find(
    c => c.id === model.competencyId
  );

  if (!competency) {
    return res.status(400).json({
      error: "Referenced competency does not exist."
    });
  }

  const competencyModel = db.competencyModels?.find(
    m => m.id === competency.modelId
  );

  if (!competencyModel) {
    return res.status(400).json({
      error: "Referenced competency model does not exist."
    });
  }

  if (model.competencyModelVersion !== competencyModel.versionNumber) {
    return res.status(409).json({
      error:
        "Recalibration blocked. Evidence model is bound to an outdated competency model version."
    });
  }

  const {
    statisticalModelId,
    parameters,
    calibrationMethod,
    sampleSize,
    notes,
    packageVersion,
    converged,
    calibratedAt,
    calibratedBy,
    parameterSetId,
    fitStatistics,
    standardErrors,
  } = req.body;

  const sm = model.statisticalModels.find(m => m.id === statisticalModelId);
  if (!sm) return res.status(400).json({ error: "Invalid statisticalModelId." });

  // D90: refuse silent provenance defaults. A parameter set that becomes
  // active drives scoring — packageVersion / sampleSize / converged must
  // be stated, not invented as "manual-unspecified" / 0 / true.
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
    return res.status(400).json({ error: "parameters object is required." });
  }
  if (typeof packageVersion !== "string" || !packageVersion.trim()) {
    return res.status(400).json({
      error: "packageVersion is required (do not omit — invented defaults are refused).",
    });
  }
  if (typeof sampleSize !== "number" || !(sampleSize > 0)) {
    return res.status(400).json({
      error: "sampleSize must be a positive number (do not omit).",
    });
  }
  if (converged !== true) {
    return res.status(400).json({
      error: "converged must be explicitly true (omission is not treated as success).",
    });
  }
  if (typeof calibrationMethod !== "string" || !calibrationMethod.trim()) {
    return res.status(400).json({ error: "calibrationMethod is required." });
  }

  const newParamSet = {
    parameterSetId: parameterSetId || genId("ps"),
    parameters,
    calibratedAt: calibratedAt || new Date().toISOString(),
    calibratedBy: calibratedBy || req.body.calibratedBy || "system",
    calibrationMethod: calibrationMethod.trim(),
    sampleSize,
    notes: notes || "",
    packageVersion: packageVersion.trim(),
    converged: true,
  };
  if (fitStatistics !== undefined) newParamSet.fitStatistics = fitStatistics;
  if (standardErrors !== undefined) newParamSet.standardErrors = standardErrors;

  sm.parameterSets = sm.parameterSets || [];
  sm.parameterSets.push(newParamSet);
  sm.activeParameterSetId = newParamSet.parameterSetId;

  model.updatedAt = new Date().toISOString();

  saveDB(db);
  res.json({ message: "Recalibration successful.", parameterSet: newParamSet });
});

/* =====================================================
   🔹 ATTACH SEED PARAMETER SETS FROM calibrationPlan
   Confirmed/suspended only. Copies calibrationPlan.seedParameterSets
   onto the named statistical models (enterprise G4 closeout).
===================================================== */
router.post("/:id/attach-seed-parameter-sets", canAuthor, (req, res) => {
  const db = loadDB();
  const model = db.evidenceModels?.find(m => m.id === req.params.id);

  if (!model) return res.status(404).json({ error: "Model not found." });

  const blocked = calibrationGate(model, "Attaching seed parameter sets");
  if (blocked) {
    return res.status(400).json({ error: blocked });
  }

  const seeds =
    (Array.isArray(req.body?.seedParameterSets) && req.body.seedParameterSets.length
      ? req.body.seedParameterSets
      : model.calibrationPlan?.seedParameterSets) || [];

  if (!Array.isArray(seeds) || seeds.length === 0) {
    return res.status(400).json({
      error: "No seedParameterSets on the request body or model.calibrationPlan.",
    });
  }

  const attached = [];
  for (const seed of seeds) {
    const statisticalModelId = seed.statisticalModelId;
    const parameterSet = seed.parameterSet;
    if (!statisticalModelId || !parameterSet || typeof parameterSet !== "object") {
      return res.status(400).json({
        error: "Each seed must include statisticalModelId and parameterSet.",
      });
    }
    const sm = model.statisticalModels.find((m) => m.id === statisticalModelId);
    if (!sm) {
      return res.status(400).json({
        error: `Invalid statisticalModelId '${statisticalModelId}'.`,
      });
    }
    const ps = {
      ...parameterSet,
      parameterSetId: parameterSet.parameterSetId || genId("ps"),
      calibratedAt: parameterSet.calibratedAt || new Date().toISOString(),
      packageVersion: parameterSet.packageVersion || "ecd-pilot-1.0.0",
      converged: parameterSet.converged !== false,
      sampleSize: parameterSet.sampleSize || 1,
      // Mark as seed so operators / activate gate can distinguish pilot
      // bridges from R-job ingest (samples README: draft bridge, not
      // Accumulation-ready measurement).
      calibrationMethod:
        parameterSet.calibrationMethod || "seed-parameter-set",
    };
    sm.parameterSets = sm.parameterSets || [];
    const existingIdx = sm.parameterSets.findIndex(
      (p) => p.parameterSetId === ps.parameterSetId
    );
    if (existingIdx >= 0) sm.parameterSets[existingIdx] = ps;
    else sm.parameterSets.push(ps);
    // D90: attach only — never flip the live scoring pointer. Activation
    // stays on POST .../activate-parameter-set (with provenance gate).
    attached.push({ statisticalModelId, parameterSetId: ps.parameterSetId });
  }

  model.updatedAt = new Date().toISOString();
  saveDB(db);
  res.json({ message: "Seed parameter sets attached.", attached });
});

/* =====================================================
   🔹 ACTIVATE PARAMETER SET (CONFIRMED ONLY)
===================================================== */
router.post("/:id/activate-parameter-set", canAuthor, (req, res) => {
  const db = loadDB();
  const model = db.evidenceModels?.find(m => m.id === req.params.id);

  if (!model) return res.status(404).json({ error: "Model not found." });

  const activationBlocked = calibrationGate(model, "Parameter set activation");
  if (activationBlocked) {
    return res.status(400).json({ error: activationBlocked });
  }

  const { statisticalModelId, parameterSetId } = req.body;

  const statModel = model.statisticalModels.find(m => m.id === statisticalModelId);
  if (!statModel) return res.status(400).json({ error: "Invalid statisticalModelId." });

  const paramSet = statModel.parameterSets.find(p => p.parameterSetId === parameterSetId);
  if (!paramSet) return res.status(400).json({ error: "Invalid parameterSetId." });

  // D90: activating a set makes it drive scoring. Refuse weak / missing
  // provenance — same bar as /recalibrate and ingest.
  if (paramSet.converged !== true) {
    return res.status(400).json({
      error: "Cannot activate a parameter set that is not explicitly converged: true.",
    });
  }
  if (typeof paramSet.packageVersion !== "string" || !paramSet.packageVersion.trim()) {
    return res.status(400).json({
      error: "Cannot activate a parameter set without packageVersion.",
    });
  }
  if (typeof paramSet.sampleSize !== "number" || !(paramSet.sampleSize > 0)) {
    return res.status(400).json({
      error: "Cannot activate a parameter set without a positive sampleSize.",
    });
  }

  statModel.activeParameterSetId = parameterSetId;
  model.updatedAt = new Date().toISOString();

  saveDB(db);
  res.json({ message: "Parameter set activated successfully." });
});

/* =====================================================
   🔹 DECISION RULE (CONFIRMED ONLY)
===================================================== */
router.post("/:id/decision-rule", canAuthor, (req, res) => {
  const db = loadDB();
  const model = db.evidenceModels?.find(m => m.id === req.params.id);

  if (!model) return res.status(404).json({ error: "Model not found." });

  const decisionRuleBlocked = calibrationGate(model, "Changing the decision rule");
  if (decisionRuleBlocked) {
    return res.status(400).json({ error: decisionRuleBlocked });
  }

  const { decisionRule } = req.body;

  if (!decisionRule || typeof decisionRule !== "object") {
    return res.status(400).json({
      error: "Valid decisionRule object is required."
    });
  }

  // Safe merge so partial updates (e.g. just cutScore) don't clobber
  // other decisionRule fields set earlier in the wizard.
  model.decisionRule = {
    ...(model.decisionRule || {}),
    ...decisionRule
  };

  model.updatedAt = new Date().toISOString();

  saveDB(db);

  res.json({
    message: "Decision rule updated.",
    decisionRule: model.decisionRule
  });
});

/* =====================================================
   🔹 LIFECYCLE TRANSITION
   -----------------------------------------------------
   PATCH /api/evidenceModels/:id/lifecycle { nextStatus }

   Evidence models were the only governed entity without this route --
   items (PATCH /items/:id/lifecycle) and task models both already use
   canTransition() from lifecycleMatrix.js, which has always declared
   confirmed → operational → suspended → operational → archived. There
   was simply no way to walk backwards down it: /activate was one-way,
   so once a model went operational its decision rule and parameters
   were frozen with no supported route back. That is the "unable to
   deactivate" dead end.
===================================================== */

/* Every status in lifecycleMatrix.STATUS needs an entry here. A handler
   returns null on success, or { status, body } to refuse.

   This is a MAP rather than a run of `if (nextStatus === ...)` on purpose:
   the first cut of this route implemented only operational / suspended /
   archived, so PATCH { nextStatus: "reviewed" } passed canTransition(),
   matched no branch, and returned HTTP 200 "moved from draft to reviewed"
   having changed precisely nothing. A missing key now fails loudly instead
   of succeeding silently. */

const TRANSITION_HANDLERS = {

  /* ---------- reviewer rejection: reviewed → draft ---------- */
  draft: (model, now) => {
    model.status = "draft";
    model.locked = false;
    model.reviewMeta = {
      ...(model.reviewMeta || {}),
      returnedToDraftAt: now,
    };
    return null;
  },

  /* ---------- submitted for review: draft → reviewed ---------- */
  reviewed: (model, now) => {
    // Review is a structural gate, not a governance lock: the model stays
    // editable so the reviewer's findings can actually be acted on.
    model.status = "reviewed";
    model.locked = false;
    model.reviewMeta = {
      ...(model.reviewMeta || {}),
      submittedForReviewAt: now,
    };
    return null;
  },

  /* ---------- confirmation is NOT done here ---------- */
  confirmed: () => ({
    status: 400,
    body: {
      error:
        "Confirmation is not available through the lifecycle route. POST /api/evidenceModels/:id/confirm owns that gate — it enforces competency-model version synchronisation, measurement-intent exclusivity, prerequisite evidence and full schema validation before locking the structure. Routing around it would create a second, weaker way to confirm.",
    },
  }),

  /* ---------- go live: confirmed | suspended → operational ---------- */
  operational: (model, now, prevStatus, db) => {

    if (!model.locked) {
      return {
        status: 400,
        body: { error: "Model must be confirmed and locked before activation." },
      };
    }

    // Re-run on every activation, not just the first: a suspended model
    // may have had its active parameter set or decision rule changed
    // while it was down, which is the whole point of suspending it.
    const errors = readinessErrorsFor(model, db);

    if (errors.length > 0) {
      return { status: 400, body: { errors } };
    }

    model.status = "operational";
    model.operationalMeta = {
      ...(model.operationalMeta || {}),
      activatedAt: now,
      reactivationCount:
        prevStatus === "suspended"
          ? (model.operationalMeta?.reactivationCount || 0) + 1
          : (model.operationalMeta?.reactivationCount || 0),
    };
    return null;
  },

  /* ---------- take out of delivery: operational → suspended ----------

     Refused while any OPERATIONAL task model is bound to this evidence
     model. Suspending the evidence under a live task would leave that task
     in delivery with nothing able to score what it collects -- responses
     gathered against a paused scoring model.

     Deliberately a REFUSAL, not a cascade. Suspending an evidence model is
     usually a calibration decision; silently deactivating every task
     running on it would be a much larger operational change than the
     author asked for, made invisibly. Blocking states the consequence and
     leaves the decision where it belongs.

     The remedy is always available and is named in the message: deactivate
     the task models (operational → suspended), then suspend this model.

     Confirmed and suspended task models do not block. Neither is
     delivering, so neither is at risk -- and the activation gate in
     server/utils/lifecycleValidation.js already stops them going
     operational while this model is down, which is the same rule read
     from the other end. Keep the two in step. */
  suspended: (model, now, _prevStatus, db) => {
    const live = liveTaskModels(model.id, db);

    if (live.length) {
      return {
        status: 409,
        body: {
          error: taskModelsStillLiveMessage("Suspending this evidence model", live),
          details: live.map(tm => ({ id: tm.id, name: tm.name, versionNumber: tm.versionNumber })),
        },
      };
    }

    model.status = "suspended";
    model.operationalMeta = {
      ...(model.operationalMeta || {}),
      suspendedAt: now,
      suspensionReason: null,
    };
    return null;
  },

  /* ---------- terminal ----------

     Same guard, for the same reason only more so: archiving is permanent
     and locks the model. If suspending under a live task is unsafe,
     archiving under one certainly is. */
  archived: (model, now, _prevStatus, db) => {
    const live = liveTaskModels(model.id, db);

    if (live.length) {
      return {
        status: 409,
        body: {
          error: taskModelsStillLiveMessage("Archiving this evidence model", live),
          details: live.map(tm => ({ id: tm.id, name: tm.name, versionNumber: tm.versionNumber })),
        },
      };
    }

    model.status = "archived";
    model.locked = true;
    model.operationalMeta = {
      ...(model.operationalMeta || {}),
      archivedAt: now,
    };
    return null;
  },
};

function applyLifecycleTransition(model, nextStatus, db) {

  const prevStatus = model.status || "draft";

  if (!canTransition(prevStatus, nextStatus)) {
    return {
      status: 400,
      body: { error: `Invalid transition from ${prevStatus} to ${nextStatus}.` },
    };
  }

  if (prevStatus === nextStatus) {
    return { status: 200, body: { message: "No change.", model } };
  }

  const handler = TRANSITION_HANDLERS[nextStatus];

  if (!handler) {
    return {
      status: 400,
      body: {
        error: `No lifecycle handler is implemented for status '${nextStatus}'. Refusing rather than reporting a move that did not happen.`,
      },
    };
  }

  const now = new Date().toISOString();
  const refusal = handler(model, now, prevStatus, db);

  if (refusal) return refusal;

  model.updatedAt = now;

  return {
    status: 200,
    body: {
      message: `Evidence model moved from ${prevStatus} to ${nextStatus}.`,
      model,
    },
  };
}

router.patch("/:id/lifecycle", canAuthor, (req, res) => {

  const db = loadDB();
  const model = db.evidenceModels?.find(m => m.id === req.params.id);

  if (!model) return res.status(404).json({ error: "Model not found." });

  const { nextStatus, reason } = req.body || {};

  if (!nextStatus) {
    return res.status(400).json({ error: "nextStatus is required." });
  }

  const result = applyLifecycleTransition(model, nextStatus, db);

  if (result.status !== 200) {
    return res.status(result.status).json(result.body);
  }

  if (nextStatus === "suspended" && reason) {
    model.operationalMeta.suspensionReason = String(reason);
  }

  saveDB(db);
  res.json(result.body);
});

/* =====================================================
   🔹 ACTIVATE (alias — kept for the existing client hook)
   Thin wrapper over the lifecycle transition above so there is exactly
   one implementation of the readiness gate. Accepts confirmed OR
   suspended as the source, which is what makes reactivation work.
===================================================== */
router.post("/:id/activate", canAuthor, (req, res) => {

  const db = loadDB();
  const model = db.evidenceModels?.find(m => m.id === req.params.id);

  if (!model) return res.status(404).json({ error: "Model not found." });

  const result = applyLifecycleTransition(model, "operational", db);

  if (result.status !== 200) {
    return res.status(result.status).json(result.body);
  }

  saveDB(db);
  res.json({ message: "Evidence model activated successfully.", model });
});

/* =====================================================
   🔹 DELETE (DRAFT ONLY)
===================================================== */
router.delete("/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const model = db.evidenceModels?.find(m => m.id === req.params.id);

  if (!model) return res.status(404).json({ error: "Model not found" });
  if (model.locked) {
    return res.status(409).json({ error: "Confirmed models cannot be deleted." });
  }

  db.evidenceModels = db.evidenceModels.filter(m => m.id !== model.id);
  saveDB(db);

  res.status(204).end();
});

export default router;
