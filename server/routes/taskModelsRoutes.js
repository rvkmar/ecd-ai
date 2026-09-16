// server/routes/api/taskModelsRoutes.js
// 🔒 Extreme Strict ECD — Task Model Routes
// Blueprint-Only TaskModel (No Item Ownership)

import express from "express";
import { authenticateToken } from "../utils/authMiddleware.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { validateEntity, isLinkableEvidenceModel } from "../../src/utils/schema.js";
import { validateTaskModelLifecycle } from "../utils/lifecycleValidation.js";
import {
  forceCloseSession,
  liveSessionsForTaskModel,
  sessionsDependingOnTaskModel,
} from "../utils/sessionDependencies.js";
import { authorizeRole } from "../utils/authMiddleware.js";
import { canTransition } from "../utils/lifecycleMatrix.js";
import { compileAndActivate } from "../compositeLibrary/activation.js";

const router = express.Router();

// Every endpoint in this router requires a valid, logged-in session.
// (Previously this file had no auth check at all — added as part of the
// Phase 1 security hardening pass; see AUTH_SECURITY_FIXES.md.)
router.use(authenticateToken);

// Every write route also needs a role gate: only force-deactivate had
// one. src/config/rolePermissions.js declares taskModels editing as
// admin+district (canEdit) and deletion as admin-only (canDelete) --
// matching that split here rather than gating every write route alike.
const canAuthor = authorizeRole(["admin", "district"]);
const canDelete = authorizeRole(["admin"]);

// Date.now() alone collides whenever two records are created inside the
// same millisecond -- which POST /bulk does routinely, and two rapid
// clones can too. A monotonic counter is appended so ids stay unique
// without changing their `tm<digits>` shape.
let idCounter = 0;
const genId = (prefix = "tm") => `${prefix}${Date.now()}${(idCounter++ % 1000)
  .toString()
  .padStart(3, "0")}`;

/* =====================================================
   🔹 HELPER: Validate Evidence Model Linkage
   - evidenceModelIds must exist
   - must be confirmed + locked
===================================================== */
// `allowDraftParents` is set only by POST /bulk: it permits a *draft* Task
// Model to declare *draft* Evidence Models, so a whole authored chain can be
// imported from JSON in one sitting. Existence is still enforced; only the
// confirmed+locked requirement is deferred to confirmation, which never
// passes the flag. See the note on validateEntity's option in schema.js.
function validateEvidenceModels(taskModel, db, strict = true, allowDraftParents = false) {
  const errors = [];

  if (!Array.isArray(taskModel.evidenceModelIds) || taskModel.evidenceModelIds.length === 0) {
    // A draft saved on the way out of Step 1 has not reached the binding
    // step yet. Presence is a confirmation-time rule; see the strictness
    // note in src/utils/schema.js's taskModels block.
    if (strict) errors.push("TaskModel must reference at least one evidenceModelId.");
    return errors;
  }

  for (const emId of taskModel.evidenceModelIds) {
    const em = db.evidenceModels?.find(e => e.id === emId);

    if (!em) {
      errors.push(`Invalid evidenceModelId '${emId}'.`);
      continue;
    }

    if (!allowDraftParents && !isLinkableEvidenceModel(em)) {
      errors.push(
        `EvidenceModel '${emId}' must be confirmed before linking to TaskModel (this one is '${em.status}').`
      );
    }
  }

  /* A TaskModel derives its construct from the Evidence Model nominated
     as primary -- it no longer declares a competency of its own. The
     pointer must resolve INTO the declared binding, which is what makes
     it impossible for the two to disagree. */
  if (
    taskModel.primaryEvidenceModelId &&
    !taskModel.evidenceModelIds.includes(taskModel.primaryEvidenceModelId)
  ) {
    errors.push(
      `primaryEvidenceModelId '${taskModel.primaryEvidenceModelId}' is not among the declared evidenceModelIds.`
    );
  }

  return errors;
}

/* =====================================================
   🔹 HELPER: Validate Expected Observations
   - observation must exist in linked EM
   - evidenceModelId must match
===================================================== */
function validateExpectedObservations(taskModel, db, strict = true) {
  const errors = [];

  if (!Array.isArray(taskModel.expectedObservations) || taskModel.expectedObservations.length === 0) {
    // Observables are authored in Step 3; a draft leaving Step 2 has none.
    if (strict) errors.push("TaskModel must declare at least one expectedObservation.");
    return errors;
  }

  const evidenceModels = db.evidenceModels || [];

  const validObservables = new Map();

  for (const emId of taskModel.evidenceModelIds || []) {
    const em = evidenceModels.find(e => e.id === emId);
    if (!em) continue;

    for (const observable of em.observables || []) {
      validObservables.set(observable.id, em.id);
    }
  }

  for (const eo of taskModel.expectedObservations) {

    if (!eo.observationId) {
      errors.push("expectedObservation missing observationId.");
      continue;
    }

    if (!eo.evidenceModelId) {
      errors.push(`expectedObservation '${eo.observationId}' missing evidenceModelId.`);
      continue;
    }

    if (!validObservables.has(eo.observationId)) {
      errors.push(`Invalid observationId '${eo.observationId}'.`);
      continue;
    }

    const correctEm = validObservables.get(eo.observationId);

    if (eo.evidenceModelId !== correctEm) {
      errors.push(`Observation '${eo.observationId}' does not belong to evidenceModel '${eo.evidenceModelId}'.`);
    }

    if (!taskModel.evidenceModelIds.includes(eo.evidenceModelId)) {
      errors.push(`evidenceModelId '${eo.evidenceModelId}' not declared in TaskModel.`);
    }
  }

  return errors;
}

/* =====================================================
   🔹 HELPER: Validate SubTask References
===================================================== */
function validateSubTasks(taskModel, db) {
  const errors = [];
  const allIds = new Set((db.taskModels || []).map(t => t.id));

  for (const sid of taskModel.subTaskIds || []) {
    if (!allIds.has(sid)) errors.push(`Invalid subTaskId '${sid}'.`);
    if (sid === taskModel.id) errors.push("TaskModel cannot reference itself.");
  }

  return errors;
}

/* =====================================================
   🔹 Shared create logic, used by both POST / (single) and POST /bulk.
   Mutates `db` (pushes the new task model) but does not save it -- the
   caller persists once, so bulk import writes the file once per batch
   instead of once per row.
===================================================== */
function createTaskModelRecord(payload = {}, db, idSuffix = "", options = {}) {
  const allowDraftParents = options.allowDraftParents === true;

  let evidenceModelIds = Array.isArray(payload.evidenceModelIds)
    ? [...payload.evidenceModelIds]
    : [];
  if ((!evidenceModelIds.length) && payload.evidenceModelName) {
    const needle = String(payload.evidenceModelName).trim().toLowerCase();
    const matches = (db.evidenceModels || []).filter(
      (em) => (em.name || "").trim().toLowerCase() === needle
    );
    if (matches.length === 1) evidenceModelIds = [matches[0].id];
    else if (matches.length === 0) {
      return {
        ok: false,
        status: 400,
        error: `No evidence model found named "${payload.evidenceModelName}".`,
      };
    } else {
      return {
        ok: false,
        status: 400,
        error: `"${payload.evidenceModelName}" matches ${matches.length} evidence models; use evidenceModelIds.`,
      };
    }
  }
  if (Array.isArray(payload.evidenceModelNames) && payload.evidenceModelNames.length) {
    evidenceModelIds = [];
    for (const emName of payload.evidenceModelNames) {
      const needle = String(emName).trim().toLowerCase();
      const matches = (db.evidenceModels || []).filter(
        (em) => (em.name || "").trim().toLowerCase() === needle
      );
      if (matches.length !== 1) {
        return {
          ok: false,
          status: 400,
          error: `evidenceModelNames entry "${emName}" must match exactly one evidence model.`,
        };
      }
      evidenceModelIds.push(matches[0].id);
    }
  }

  let primaryEvidenceModelId =
    payload.primaryEvidenceModelId || evidenceModelIds[0] || "";
  if (!payload.primaryEvidenceModelId && payload.primaryEvidenceModelName) {
    const needle = String(payload.primaryEvidenceModelName).trim().toLowerCase();
    const match = (db.evidenceModels || []).find(
      (em) => (em.name || "").trim().toLowerCase() === needle
    );
    if (match) primaryEvidenceModelId = match.id;
  }

  const expectedObservations = (payload.expectedObservations || []).map((eo) => {
    if (eo.evidenceModelId) return eo;
    if (eo.evidenceModelName) {
      const needle = String(eo.evidenceModelName).trim().toLowerCase();
      const match = (db.evidenceModels || []).find(
        (em) => (em.name || "").trim().toLowerCase() === needle
      );
      if (match) return { ...eo, evidenceModelId: match.id };
    }
    if (evidenceModelIds.length === 1) {
      return { ...eo, evidenceModelId: evidenceModelIds[0] };
    }
    return eo;
  });

  const newTaskModel = {
    ...payload,

    id: `${genId()}${idSuffix}`,
    name: payload.name || "",
    description: payload.description || "",
    designRationale: payload.designRationale || "",

    evidenceModelIds,
    primaryEvidenceModelId,
    expectedObservations,

    // `questionBlueprint` used to be seeded here. It appears in no schema,
    // no route and no component -- a phantom field written onto every
    // created record. `blueprintConstraints` is the real one, and it was
    // never defaulted, so a payload omitting it failed validation with a
    // message about a field the create handler had declined to supply.
    taskStructure: payload.taskStructure || {},
    blueprintConstraints: payload.blueprintConstraints || {},

    taskCompositionType: payload.taskCompositionType || "",
    subTaskIds: payload.subTaskIds || [],
    actions: payload.actions || [],

    selectedItemIds: payload.selectedItemIds || [],
    itemMappings: payload.itemMappings || [],

    fairnessRisks: payload.fairnessRisks || [],
    fairnessNotes: payload.fairnessNotes || "",
    accessibilityAssumptions: payload.accessibilityAssumptions || {},
    equivalenceGroupId: payload.equivalenceGroupId || "",

    status: "draft",
    locked: false,
    versionNumber: 1,
    parentModelId: null,

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const errors = [];

  /* A newly created TaskModel is always a draft (status is forced above),
     and the wizard creates it from Step 1 with nothing authored beyond a
     name. Validate it the way a draft should be: referential integrity
     enforced, completeness deferred to confirmation. */
  const strict = false;

  errors.push(...validateEvidenceModels(newTaskModel, db, strict, allowDraftParents));
  errors.push(...validateExpectedObservations(newTaskModel, db, strict));
  errors.push(...validateSubTasks(newTaskModel, db));

  const schemaResult = validateEntity("taskModels", newTaskModel, db, { strict, allowDraftParents });
  if (!schemaResult.valid) errors.push(...schemaResult.errors);

  if (errors.length) {
    return { ok: false, status: 400, error: "TaskModel validation failed", details: errors };
  }

  db.taskModels = db.taskModels || [];
  db.taskModels.push(newTaskModel);

  return { ok: true, status: 201, record: newTaskModel };
}

/* =====================================================
   🔹 CREATE (Draft Only)
===================================================== */
router.post("/", canAuthor, (req, res) => {
  const db = loadDB();
  const result = createTaskModelRecord(req.body || {}, db);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error, details: result.details });
  }
  saveDB(db);
  res.status(result.status).json(result.record);
});

/* =====================================================
   🔹 CREATE IN BULK (Draft Only)
   body: TaskModel[] -- each row validated and inserted with the same rules
   as POST / above (evidence model linkage, expected observations, sub-task
   references, schema), with ONE deliberate relaxation: an evidence model
   referenced here may still be a draft. Bulk import exists to land a whole
   authored chain as drafts from JSON; requiring Lock & Confirm on every
   evidence model mid-import made that impossible. The confirmed+locked
   requirement is enforced at confirmation instead, where it protects
   something -- see `allowDraftParents` in src/utils/schema.js.
===================================================== */
router.post("/bulk", canAuthor, (req, res) => {
  const rows = req.body;
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: "Request body must be a JSON array of task models." });
  }

  const db = loadDB();
  const results = rows.map((row, i) => {
    const result = createTaskModelRecord(row || {}, db, `_${i}`, { allowDraftParents: true });
    return result.ok
      ? { index: i, ok: true, id: result.record.id, name: result.record.name }
      : { index: i, ok: false, error: result.error, details: result.details };
  });
  saveDB(db);

  const created = results.filter((r) => r.ok).length;
  res.status(207).json({ created, failed: results.length - created, results });
});

/* =====================================================
   🔹 UPDATE

   Two distinct operations share this route:

   a) EDITING an unlocked (draft / reviewed) TaskModel -- full merge of
      the submitted body, then full revalidation.

   b) PROMOTING a locked TaskModel -- a STATUS-ONLY transition.

   (b) used to be impossible. This handler returned 409 for any request
   against a locked record, and confirmation sets locked = true -- so
   `confirmed → operational → archived`, which lifecycleMatrix declares
   and TaskModelList renders buttons for, could never be performed
   through the only route the client calls. Activation and archival were
   both unreachable.

   The immutability guarantee is preserved by construction: for a locked
   record the merge is discarded entirely and only `status` is taken from
   the body, so a stale or hostile client payload cannot smuggle a
   structural edit in alongside the transition.
===================================================== */
router.put("/:id", canAuthor, (req, res) => {

  const db = loadDB();

  // `db.taskModels?.findIndex(...)` yields undefined when the collection
  // is missing, and `undefined === -1` is false -- so the not-found guard
  // fell through and `db.taskModels[undefined]` threw a 500 on a fresh
  // database instead of returning 404.
  const taskModels = db.taskModels || [];
  const idx = taskModels.findIndex(m => m.id === req.params.id);

  if (idx === -1) {
    return res.status(404).json({ error: "TaskModel not found" });
  }

  const existing = taskModels[idx];
  const prevStatus = existing.status;

  const isLocked = Boolean(existing.locked);
  const nextStatus = req.body?.status || prevStatus;

  /* ---------------------------------------------------
     LOCKED: status-only transition
  --------------------------------------------------- */
  if (isLocked) {

    if (nextStatus === prevStatus) {
      return res.status(409).json({
        error:
          "Confirmed TaskModel cannot be modified. Clone it to create a new version."
      });
    }

    if (!canTransition(prevStatus, nextStatus)) {
      return res.status(400).json({
        error: `Invalid lifecycle transition from ${prevStatus} to ${nextStatus}`
      });
    }

    const promoted = {
      ...existing,
      status: nextStatus,
      // Locked stays locked for every state reachable from confirmed.
      locked: true,
      updatedAt: new Date().toISOString()
    };

    const lifecycleErrors = validateTaskModelLifecycle(promoted, db);

    if (lifecycleErrors.length) {
      return res.status(400).json({
        error: "TaskModel lifecycle validation failed",
        details: lifecycleErrors
      });
    }

    /* --------------------------------------------------
       D49a: ACTIVATION COMPILES THE DELIVERY PACKAGE

       This is the caller finding F4 said `buildCompositeLibrary()` never
       had, and the moment ADR 0003 names: "a compiled versioned package
       built at Task Model activation".

       WHY HERE and nowhere else: `operational` is reachable only through
       this branch. Confirmation sets locked = true, and every state
       reachable from confirmed stays locked, so confirmed -> operational
       and suspended -> operational both land here. The unlocked branch
       below cannot reach `operational` -- canTransition() offers it only
       from confirmed or suspended, and both are locked.

       REACTIVATION RECOMPILES, deliberately. suspended -> operational is a
       Task Model re-entering service, and the item bank may have moved
       while it was out: items archived, new items confirmed. Serving a
       package compiled before the suspension would deliver a snapshot of
       an item bank that no longer exists. Recompiling is cheap; the
       previous package is deactivated rather than deleted, so anything
       already scored against it is still explicable.

       WHAT DOES NOT HAPPEN HERE: an Evidence Model version bump does NOT
       silently recompile this package. That would make writing one entity
       mutate another entity's delivery artefact, with nothing in the
       request saying so. A live package that has fallen behind reports
       itself through GET /api/compositeLibrary/:id/staleness (D48), and a
       human rebuilds it through POST /api/compositeLibrary/rebuild/:id.
       Refuse or advise, never act quietly -- the same rule every other
       cross-entity effect in this codebase follows.
    -------------------------------------------------- */
    if (nextStatus === "operational") {
      const activation = compileAndActivate(promoted, db);

      if (!activation.ok) {
        // Nothing is saved: neither the promotion nor the partial
        // deactivation compileAndActivate performed on the snapshot. The
        // Task Model stays in its previous state rather than going live
        // with no package behind it.
        return res.status(activation.status).json({
          error: activation.error,
          details: activation.details,
        });
      }

      db.taskModels[idx] = promoted;
      saveDB(db);

      // The package and its warnings ride back with the Task Model so the
      // author sees, at the moment of activation, that (say) an item was
      // skipped because its evidenceModelId did not resolve.
      return res.json({
        ...promoted,
        compositeLibrary: {
          id: activation.record.id,
          taskModelVersion: activation.record.taskModelVersion,
          itemCount: activation.record.items.length,
          warnings: activation.warnings,
        },
      });
    }

    db.taskModels[idx] = promoted;
    saveDB(db);

    return res.json(promoted);
  }

  /* ---------------------------------------------------
     UNLOCKED: full edit
  --------------------------------------------------- */
  const updated = {
    ...existing,
    ...req.body,
    updatedAt: new Date().toISOString()
  };

  // Confirmation locks the TaskModel. This route is what the wizard
  // actually calls to confirm (a PUT carrying status: "confirmed"), and
  // the client never sends `locked: true` itself -- without this,
  // validateEntity's "Confirmed TaskModel must be locked" rule was
  // unsatisfiable through the only path that reaches it.
  if (nextStatus === "confirmed") {
    updated.locked = true;
  }

  if (!canTransition(prevStatus, nextStatus)) {
    return res.status(400).json({
      error: `Invalid lifecycle transition from ${prevStatus} to ${nextStatus}`
    });
  }

  const errors = [];

  /* Draft saves are auto-saves: the wizard PUTs on every Next. Only a
     record leaving `draft` is held to full structural completeness. */
  const strict = nextStatus !== "draft";

  errors.push(...validateEvidenceModels(updated, db, strict));
  errors.push(...validateExpectedObservations(updated, db, strict));
  errors.push(...validateSubTasks(updated, db));

  if (prevStatus !== nextStatus) {
    errors.push(...validateTaskModelLifecycle(updated, db));
  }

  const schemaResult = validateEntity("taskModels", updated, db, { strict });
  if (!schemaResult.valid) errors.push(...schemaResult.errors);

  if (errors.length) {
    return res.status(400).json({
      error: "TaskModel validation failed",
      details: errors
    });
  }

  db.taskModels[idx] = updated;
  saveDB(db);

  res.json(updated);
});

/* =====================================================
   🔹 CONFIRM (Reviewed → Confirmed)
===================================================== */
router.post("/:id/confirm", canAuthor, (req, res) => {

  const db = loadDB();
  const model = db.taskModels?.find(m => m.id === req.params.id);

  if (!model)
    return res.status(404).json({ error: "TaskModel not found." });

  if (model.status !== "reviewed") {
    return res.status(400).json({
      error: "Only reviewed TaskModels can be confirmed."
    });
  }

  const errors = [];

  // Confirmation is the strict gate -- everything deferred during drafting
  // is enforced here. The lifecycle check was missing from this route
  // while PUT ran it, so the two confirmation paths disagreed about what
  // "confirmed" required.
  errors.push(...validateEvidenceModels(model, db, true));
  errors.push(...validateExpectedObservations(model, db, true));
  errors.push(...validateSubTasks(model, db));
  errors.push(...validateTaskModelLifecycle({ ...model, status: "confirmed" }, db));

  const schemaResult = validateEntity("taskModels", model, db, { strict: true });
  if (!schemaResult.valid) errors.push(...schemaResult.errors);

  if (errors.length) {
    return res.status(400).json({
      error: "Validation failed",
      details: errors
    });
  }

  model.status = "confirmed";
  model.locked = true;
  model.updatedAt = new Date().toISOString();

  saveDB(db);
  res.json(model);
});

/* =====================================================
   🔹 DEPENDANTS (read-only)

   What would be affected by deactivating this Task Model. The Force
   Deactivate dialog reads this so it can state the cost BEFORE the user
   commits, rather than reporting it afterwards.
===================================================== */
router.get("/:id/dependents", (req, res) => {

  const db = loadDB();
  const model = db.taskModels?.find(m => m.id === req.params.id);

  if (!model) return res.status(404).json({ error: "TaskModel not found" });

  const depending = sessionsDependingOnTaskModel(model.id, db);
  const live = liveSessionsForTaskModel(model.id, db);

  res.json({
    taskModelId: model.id,
    status: model.status,
    sessions: {
      total: depending.length,
      live: live.length,
      liveSessions: live.map(s => ({
        id: s.id,
        studentId: s.studentId || null,
        status: s.status,
        startedAt: s.startedAt || null,
        responses: (s.responses || []).length,
      })),
    },
    items: (db.items || []).filter(i => i.taskModelId === model.id).length,
  });
});

/* =====================================================
   🔹 FORCE DEACTIVATE (operational → suspended, closing live sessions)

   The escape hatch that makes the deactivation gate safe to have. It
   closes every live session depending on this Task Model and then
   deactivates it, in ONE atomic write -- a two-call client-side version
   of this could close the sessions and then fail to deactivate, which is
   the worst of both outcomes.

   Restricted to admin and district. It ends other people's in-flight
   sessions; that is not a routine authoring action.

   Sessions are CLOSED, never deleted: responses are locked and the
   session lands in "submitted", so whatever evidence was collected before
   the closure still validates, still scores and still reports. See
   forceCloseSession() in server/utils/sessionDependencies.js.
===================================================== */
router.post("/:id/force-deactivate", authorizeRole(["admin", "district"]), (req, res) => {

  const db = loadDB();
  const idx = (db.taskModels || []).findIndex(m => m.id === req.params.id);

  if (idx === -1) return res.status(404).json({ error: "TaskModel not found" });

  const model = db.taskModels[idx];

  if (model.status !== "operational") {
    return res.status(400).json({
      error: `Only an operational TaskModel can be force-deactivated (this one is '${model.status}').`
    });
  }

  const reason = typeof req.body?.reason === "string" && req.body.reason.trim()
    ? req.body.reason.trim()
    : null;

  const now = new Date().toISOString();

  /* VALIDATE BEFORE MUTATING. Every other lifecycle rule still applies --
     only the live-session block is waived ({ force: true }) -- so a
     structurally broken model cannot push through on the force path.

     The order matters and used to be wrong: sessions were closed first and
     validated afterwards. In production that was survivable by accident,
     because a failed request returns before saveDB() and loadDB() re-reads
     the file on the next call, so the mutations were discarded. It is not
     survivable anywhere the db object outlives the request -- a mocked
     loadDB in the test suite, or any future caching or in-memory data
     layer -- where a refused call would leave every session closed and the
     TaskModel still operational: the worst of both outcomes, silently.

     Nothing is touched until the transition is known to be legal. */
  const errors = validateTaskModelLifecycle(
    { ...model, status: "suspended" },
    db,
    { force: true }
  );

  if (errors.length) {
    return res.status(400).json({
      error: "TaskModel validation failed",
      details: errors
    });
  }

  const live = liveSessionsForTaskModel(model.id, db);

  const closed = live.map(session => {
    forceCloseSession(session, now, reason);
    return { id: session.id, studentId: session.studentId || null };
  });

  model.status = "suspended";
  model.updatedAt = now;
  model.deactivation = {
    deactivatedAt: now,
    forced: true,
    closedSessionCount: closed.length,
    reason,
  };

  saveDB(db);

  res.json({
    message:
      closed.length === 0
        ? "Task Model deactivated. No live sessions depended on it."
        : `Task Model deactivated. ${closed.length} live session${closed.length === 1 ? "" : "s"} closed.`,
    model,
    closedSessions: closed,
  });
});

/* =====================================================
   🔹 CLONE (Versioned Structural Evolution)
===================================================== */
router.post("/:id/clone", canAuthor, (req, res) => {

  const db = loadDB();
  const original = db.taskModels?.find(m => m.id === req.params.id);

  if (!original)
    return res.status(404).json({ error: "TaskModel not found." });

  if (!original.locked)
    return res.status(400).json({
      error: "Only confirmed TaskModels can be cloned."
    });

  const siblings = db.taskModels.filter(
    m => m.parentModelId === original.id || m.id === original.id
  );

  const versionNumber =
    Math.max(...siblings.map(m => m.versionNumber || 1)) + 1;

  const cloned = {
    ...JSON.parse(JSON.stringify(original)),
    id: genId(),
    status: "draft",
    locked: false,
    parentModelId: original.id,
    versionNumber,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.taskModels.push(cloned);
  saveDB(db);

  res.status(201).json(cloned);
});

/* =====================================================
   🔹 GET ALL
===================================================== */
router.get("/", (req, res) => {
  const db = loadDB();
  res.json(db.taskModels || []);
});

/* =====================================================
   🔹 GET ONE
===================================================== */
router.get("/:id", (req, res) => {
  const db = loadDB();
  const model = db.taskModels?.find(m => m.id === req.params.id);

  if (!model)
    return res.status(404).json({ error: "TaskModel not found" });

  res.json(model);
});

/* =====================================================
   🔹 DELETE (Draft Only)
===================================================== */
router.delete("/:id", canDelete, (req, res) => {

  const db = loadDB();
  const model = db.taskModels?.find(m => m.id === req.params.id);

  if (!model)
    return res.status(404).json({ error: "TaskModel not found" });

  if (model.locked)
    return res.status(409).json({
      error: "Confirmed TaskModels cannot be deleted."
    });

  db.taskModels = db.taskModels.filter(m => m.id !== model.id);
  saveDB(db);

  res.status(204).end();
});

export default router;
