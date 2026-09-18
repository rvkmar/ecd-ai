// server/routes/itemsRoutes.js
// =============================================================
// Item Bank routes — ECD governed
// -------------------------------------------------------------
// One Item = one instantiation of one Task Model.
//
// WHAT CHANGED AND WHY
//
// 1. THE DERIVED FIELDS ARE NOW DERIVED. An item carries five structural
//    pointers but only ever authored two of them: `taskModelId` (+ its
//    version lock) and `observationId`. `evidenceModelId` and
//    `evidenceModelVersion` are a pure function of those two, and are
//    recomputed here on EVERY write. Before, they were accepted from the
//    payload and then checked for disagreement — four "mismatch" errors
//    whose only job was to detect drift the design itself created.
//
// 2. THE SIMULATION GATE IS GONE, folded into validateItemLifecycle().
//    `simulateItemEvidence()` enforced a smaller and partly contradictory
//    set of rules from the ones schema.js enforced a few lines later in
//    the same request, so an item could pass the gate and fail the write
//    with an unrelated message. GET /:id/simulate remains — as a
//    READ-ONLY preflight that reports exactly what the confirm
//    transition would say, from the same code.
//
// 3. LIFECYCLE IS ONE MATRIX. server/utils/lifecycleMatrix.js declares
//    reviewed -> draft, confirmed -> archived, operational -> archived
//    and suspended -> operational. schema.js's own index-comparison guard
//    rejected all four, so an item could only ever move forwards one
//    step: no reviewer rejection, no reactivation, no archiving except
//    by walking every intermediate state. That guard is replaced by
//    canTransition() and the transitions are reachable.
//
// 4. WRITES ARE ROLE-GATED. This router required only a valid token, so
//    any authenticated user — a student — could create, confirm, activate
//    or delete bank items. Reads stay open to any authenticated user
//    because delivery needs them.
// =============================================================

import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import {
  validateEntity,
  isInstantiableTaskModel,
} from "../../src/utils/schema.js";
import { validateItemLifecycle } from "../utils/lifecycleValidation.js";
import { canTransition, TRANSITIONS } from "../utils/lifecycleMatrix.js";
import { liveSessionsForItem } from "../utils/sessionDependencies.js";
import { recordItemUsage } from "../utils/itemExposure.js";
import { SESSION_STATUS } from "../../src/utils/sessionStatus.js";

const router = express.Router();

router.use(authenticateToken);
router.use(sanitizeRequestInputs);

// Authoring and governance are admin/district, matching
// src/config/rolePermissions.js. Reads are left to any authenticated
// user: sessions deliver items, and the student's own session player
// fetches them.
const AUTHOR_ROLES = ["admin", "district"];
const canAuthor = authorizeRole(AUTHOR_ROLES);

/* =============================================================
   Utilities
============================================================= */

// Date.now() alone collides whenever two records are created inside the
// same millisecond -- which POST /bulk does routinely, and two rapid
// clones can too. Same monotonic-counter shape as taskModelsRoutes.
let idCounter = 0;
const genId = (prefix = "it") =>
  `${prefix}_${Date.now().toString(36)}_${(idCounter++ % 1000)
    .toString()
    .padStart(3, "0")}`;

const now = () => new Date().toISOString();

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/* -------------------------------------------------------------
   THE DERIVATION

   Given a task model and the observation the item elicits, produce the
   evidence binding. This is the single server-side definition; the
   client's deriveEvidenceBinding() in itemConstants.js is the same walk
   for display purposes only -- what is STORED always comes from here.
------------------------------------------------------------- */
function deriveEvidenceBinding(taskModel, observationId, db) {
  const declared = (taskModel?.expectedObservations || []).find(
    (eo) => eo.observationId === observationId
  );

  if (!declared) {
    return { declared: null, evidenceModelId: null, evidenceModelVersion: null };
  }

  const em = (db.evidenceModels || []).find((e) => e.id === declared.evidenceModelId);

  return {
    declared,
    evidenceModelId: declared.evidenceModelId ?? null,
    evidenceModelVersion: em?.versionNumber ?? null,
  };
}

/* Apply the derivation to a record in place and return it. Called on
   every create and every update, so the two derived fields can never
   drift from the pointer that produces them. */
function applyDerivedBinding(record, db) {
  const taskModel = (db.taskModels || []).find((t) => t.id === record.taskModelId);

  if (!taskModel) return record;

  record.taskModelVersion = taskModel.versionNumber;

  const { evidenceModelId, evidenceModelVersion } = deriveEvidenceBinding(
    taskModel,
    record.observationId,
    db
  );

  record.evidenceModelId = evidenceModelId;
  record.evidenceModelVersion = evidenceModelVersion;

  return record;
}

/* Structural completeness is only enforced once the item is leaving
   draft. A draft is by definition half-authored; enforcing confirmation
   rules on it blocks the wizard before the author reaches the step that
   would satisfy them. Mirrors the taskModels router. */
function strictFor(status) {
  return (status || "draft") !== "draft";
}

function validationFailure(res, errors, message = "Item validation failed.") {
  return res.status(400).json({ error: message, details: errors });
}

/* =============================================================
   READ
============================================================= */

/* GET /api/items
   Query filters, all optional and combinable:
     status=draft|reviewed|...      (repeatable: ?status=confirmed&status=operational)
     taskModelId=<id>
     evidenceModelId=<id>
     equivalenceGroupId=<id>
     calibration=calibrated|uncalibrated|pilot
     exposure=healthy|nearing|exhausted|unbounded
     q=<free text over id, subject, topic, tags>

   The list previously returned the entire collection unfiltered and every
   consumer re-filtered it in the browser -- fine at ten items, not at ten
   thousand. */
router.get("/", (req, res) => {
  const db = loadDB();
  let items = db.items || [];

  const asArray = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

  const statuses = asArray(req.query.status);
  if (statuses.length) {
    items = items.filter((i) => statuses.includes(i.status));
  }

  if (req.query.taskModelId) {
    items = items.filter((i) => i.taskModelId === req.query.taskModelId);
  }

  if (req.query.evidenceModelId) {
    items = items.filter((i) => i.evidenceModelId === req.query.evidenceModelId);
  }

  if (req.query.equivalenceGroupId) {
    items = items.filter(
      (i) => i.equivalenceGroupId === req.query.equivalenceGroupId
    );
  }

  if (req.query.calibration) {
    items = items.filter(
      (i) =>
        (i.psychometrics?.calibrationStatus || "uncalibrated") ===
        req.query.calibration
    );
  }

  if (req.query.exposure) {
    items = items.filter((i) => {
      const used = i.exposureControl?.usageCount || 0;
      const ceiling = i.exposureControl?.maxUsageBeforeRetire || 0;

      if (!ceiling) return req.query.exposure === "unbounded";

      const ratio = used / ceiling;
      if (req.query.exposure === "exhausted") return ratio >= 1;
      if (req.query.exposure === "nearing") return ratio >= 0.8 && ratio < 1;
      if (req.query.exposure === "healthy") return ratio < 0.8;
      return true;
    });
  }

  if (req.query.q) {
    const q = String(req.query.q).toLowerCase();
    items = items.filter((i) =>
      [
        i.id,
        i.metadata?.subject,
        i.metadata?.topic,
        i.metadata?.grade,
        ...(i.metadata?.tags || []),
      ]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q))
    );
  }

  res.json(items);
});

router.get("/:id", (req, res) => {
  const db = loadDB();
  const item = db.items?.find((i) => i.id === req.params.id);

  if (!item) return res.status(404).json({ error: "Item not found." });

  res.json(item);
});

/* GET /api/items/:id/simulate
   READ-ONLY preflight. Reports exactly what confirming this item would
   say, computed from the SAME two validators the transition itself runs
   -- so a green simulation can no longer be followed by a red confirm. */
router.get("/:id/simulate", (req, res) => {
  const db = loadDB();
  const item = db.items?.find((i) => i.id === req.params.id);

  if (!item) return res.status(404).json({ error: "Item not found." });

  const candidate = { ...item, status: "confirmed" };

  const structural = validateEntity("items", candidate, db, { strict: true });
  const lifecycle = validateItemLifecycle(candidate, db);

  const errors = [...(structural.valid ? [] : structural.errors), ...lifecycle];

  res.json({
    valid: errors.length === 0,
    errors,
    checkedAs: "confirmed",
  });
});

/* =============================================================
   CREATE
============================================================= */

// Shared create logic for POST / and POST /bulk. Mutates `db` but does
// not save -- the caller persists once, so a bulk import writes the file
// once per batch instead of once per row.
function createItemRecord(payload = {}, db, creatorId = "system", options = {}) {
  // Set only by POST /bulk -- see the note on validateEntity's
  // `allowDraftParents` option in src/utils/schema.js. It lets an imported
  // item bind to a Task Model that is still a draft, so a whole authored
  // chain can land from JSON in one sitting. The Task Model must still
  // exist and must still declare the observation, and item CONFIRMATION
  // still refuses a draft Task Model (validateItemLifecycle).
  const allowDraftParents = options.allowDraftParents === true;
  let taskModelId = payload.taskModelId;
  if (!taskModelId && payload.taskModelName) {
    const needle = String(payload.taskModelName).trim().toLowerCase();
    const matches = (db.taskModels || []).filter(
      (t) => (t.name || "").trim().toLowerCase() === needle
    );
    if (matches.length === 0) {
      return {
        ok: false,
        status: 400,
        error: `No task model found named "${payload.taskModelName}".`,
      };
    }
    if (matches.length > 1) {
      return {
        ok: false,
        status: 400,
        error: `"${payload.taskModelName}" matches ${matches.length} task models; use taskModelId.`,
      };
    }
    taskModelId = matches[0].id;
  }
  if (!taskModelId) {
    return { ok: false, status: 400, error: "taskModelId is required. An item exists only as an instantiation of a Task Model." };
  }

  const taskModel = (db.taskModels || []).find((t) => t.id === taskModelId);

  if (!taskModel) {
    return { ok: false, status: 400, error: `Invalid taskModelId '${payload.taskModelId}'.` };
  }

  if (!allowDraftParents && !isInstantiableTaskModel(taskModel)) {
    return {
      ok: false,
      status: 400,
      error: `Task Model '${taskModel.name || taskModel.id}' is ${taskModel.status}${
        taskModel.locked ? "" : " and unlocked"
      }; items may only instantiate confirmed, operational or suspended Task Models.`,
    };
  }

  // observationId is optional at creation. The wizard binds the Task
  // Model first and picks the observation second, and a create that
  // demanded both meant the very first autosave 400'd. It is required
  // from `reviewed` onward, which schema.js's strict mode enforces.
  if (payload.observationId) {
    const declared = (taskModel.expectedObservations || []).find(
      (eo) => eo.observationId === payload.observationId
    );

    if (!declared) {
      return {
        ok: false,
        status: 400,
        error: `Observation '${payload.observationId}' is not declared in this Task Model's expectedObservations.`,
      };
    }
  }

  const newItem = {
    id: genId(),
    // Optional display name used by Q-matrix bulk remapping (itemName).
    name: payload.name || null,

    taskModelId: taskModel.id,
    taskModelVersion: taskModel.versionNumber,
    observationId: payload.observationId || null,
    // Derived below; never read from the payload.
    evidenceModelId: null,
    evidenceModelVersion: null,

    stimulus: payload.stimulus || { layout: "single", blocks: [] },
    interaction: payload.interaction || {
      type: "",
      responseComponents: [],
      config: {},
    },
    scoring: payload.scoring || {
      method: "",
      maxScore: 1,
      evidenceActivationMap: [],
    },

    learningDomain: payload.learningDomain || "cognitive",
    cognitiveDemand: payload.cognitiveDemand || {},
    metadata: payload.metadata || {},

    psychometrics: {
      statisticalModelType: payload.psychometrics?.statisticalModelType || "",
      calibrationStatus: payload.psychometrics?.calibrationStatus || "uncalibrated",
      // Pilot parameters may legitimately arrive with a bulk import of an
      // already-calibrated bank; they were silently dropped before.
      irtParams: payload.psychometrics?.irtParams || {},
    },

    // Dropped entirely by the previous implementation, which is why no
    // bulk-imported item could ever be activated.
    equivalenceGroupId: payload.equivalenceGroupId || "",

    exposureControl: {
      usageCount: 0,
      maxUsageBeforeRetire: payload.exposureControl?.maxUsageBeforeRetire || 0,
      reactivationCount: 0,
      maxReactivations: payload.exposureControl?.maxReactivations || 0,
    },

    status: "draft",
    locked: false,
    versionNumber: 1,
    parentItemId: null,

    creator: creatorId,
    modifier: null,
    createdAt: now(),
    updatedAt: now(),
  };

  applyDerivedBinding(newItem, db);

  // A create is always a draft, so never strict. The previous
  // implementation validated strictly and therefore rejected every
  // possible payload: a brand-new item has no activation map, and
  // "Explicit evidenceActivationMap is required" ran unconditionally.
  const { valid, errors } = validateEntity("items", newItem, db, { strict: false, allowDraftParents });

  if (!valid) {
    return { ok: false, status: 400, error: "Item validation failed.", details: errors };
  }

  db.items = db.items || [];
  db.items.push(newItem);

  return { ok: true, status: 201, record: newItem };
}

router.post("/", canAuthor, (req, res) => {
  const db = loadDB();
  const result = createItemRecord(req.body || {}, db, req.user?.id || "system");

  if (!result.ok) {
    return res
      .status(result.status)
      .json({ error: result.error, details: result.details });
  }

  saveDB(db);
  res.status(result.status).json(result.record);
});

/* POST /api/items/bulk — body: Item[]
   Same rules as POST / above (taskModelId must exist, observationId must be
   declared on it) with ONE deliberate relaxation: the Task Model may still
   be a draft. Bulk import exists to land a whole authored chain as drafts
   from JSON, so it must not require Lock & Confirm on the Task Model first.
   Confirmation still enforces it. See `allowDraftParents` in schema.js. */
router.post("/bulk", canAuthor, (req, res) => {
  const rows = req.body;

  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: "Request body must be a JSON array of items." });
  }

  const db = loadDB();
  const creatorId = req.user?.id || "system";

  const results = rows.map((row, i) => {
    const result = createItemRecord(row || {}, db, creatorId, { allowDraftParents: true });
    return result.ok
      ? { index: i, ok: true, id: result.record.id }
      : { index: i, ok: false, error: result.error, details: result.details };
  });

  const created = results.filter((r) => r.ok).length;

  // Only touch the file when something actually landed. An all-failed
  // batch used to rewrite the database for no reason.
  if (created > 0) saveDB(db);

  res.status(207).json({ created, failed: results.length - created, results });
});

/* =============================================================
   UPDATE
============================================================= */

router.put("/:id", canAuthor, (req, res) => {
  const db = loadDB();

  // `db.items?.findIndex(...)` yields undefined on a database with no
  // items array, and `undefined === -1` is false -- so the guard passed
  // and `db.items[undefined]` threw a 500 on a fresh install.
  const items = db.items || [];
  const index = items.findIndex((i) => i.id === req.params.id);

  if (index === -1) return res.status(404).json({ error: "Item not found." });

  const existing = items[index];

  if (existing.status === "archived") {
    return res.status(409).json({ error: "An archived item cannot be modified." });
  }

  /* A locked record accepts a STATUS-ONLY transition and nothing else.

     The previous 409-on-any-locked-record meant a confirmed item could
     never be promoted through this route at all -- the same welded-shut
     failure the Task Model router had, and for the same reason: locking
     was treated as "no request may touch this" rather than "the
     structure may not change". Immutability now holds by construction:
     for a locked record every field except `status` is discarded, so
     there is no path through this handler that can alter one. */
  if (existing.locked) {
    const requested = req.body?.status;

    if (!requested || requested === existing.status) {
      return res.status(409).json({
        error:
          "This item is confirmed and locked. Its structure cannot change — clone it to make a new version, or use PATCH /:id/lifecycle to move its status.",
      });
    }

    return applyLifecycle(req, res, db, items, index, requested, {
      force: req.body?.force === true,
    });
  }

  const STRUCTURAL_FIELDS = ["taskModelVersion", "evidenceModelId", "evidenceModelVersion"];

  const sanitized = { ...req.body };
  // Derived fields are never accepted from a client.
  STRUCTURAL_FIELDS.forEach((f) => delete sanitized[f]);
  // Neither is lifecycle state: that is PATCH /:id/lifecycle's job.
  delete sanitized.status;
  delete sanitized.locked;
  delete sanitized.versionNumber;
  delete sanitized.parentItemId;
  delete sanitized.id;

  const updated = {
    ...existing,
    ...sanitized,
    // A reviewed item stays reviewed across the wizard's silent
    // auto-saves; a draft stays a draft.
    status: existing.status,
    locked: false,
    updatedAt: now(),
    modifier: req.user?.id || "system",
  };

  applyDerivedBinding(updated, db);

  const { valid, errors } = validateEntity("items", updated, db, {
    strict: strictFor(updated.status),
  });

  if (!valid) return validationFailure(res, errors);

  items[index] = updated;
  db.items = items;
  saveDB(db);

  res.json(updated);
});

/* =============================================================
   LIFECYCLE
============================================================= */

/* Shared by PATCH /:id/lifecycle and the status-only PUT path above, so
   the two can never diverge. */
function applyLifecycle(req, res, db, items, index, nextStatus, options = {}) {
  const item = items[index];
  const prevStatus = item.status || "draft";

  if (!nextStatus) {
    return res.status(400).json({ error: "nextStatus is required." });
  }

  if (!canTransition(prevStatus, nextStatus)) {
    return res.status(400).json({
      error: `Item cannot move from '${prevStatus}' to '${nextStatus}'.`,
      allowed: TRANSITIONS[prevStatus] || [],
    });
  }

  const updated = { ...item, status: nextStatus, updatedAt: now() };
  updated.modifier = req.user?.id || "system";

  /* Locking is a property of the frozen states, not of one transition.
     Setting it only on entry to `confirmed` meant a record that reached
     `operational` by any other path carried locked:false and was
     editable. */
  updated.locked = ["confirmed", "operational", "suspended", "archived"].includes(
    nextStatus
  );

  if (nextStatus === "operational") {

    const used = updated.exposureControl?.usageCount || 0;
    const ceiling = updated.exposureControl?.maxUsageBeforeRetire || 0;

    /* The previous implementation silently rewrote the requested status
       to "suspended" here. The caller asked to activate and got back an
       item in a different state -- and because the schema's linear guard
       treated confirmed -> suspended as a two-step skip, the write then
       failed with "Item lifecycle skipping not allowed", which says
       nothing about exposure. Refuse the transition and say why. */
    if (ceiling > 0 && used >= ceiling) {
      return res.status(400).json({
        error: `This item has been delivered ${used} times against a ceiling of ${ceiling}. Raise the ceiling, or clone it to start a fresh exposure budget.`,
      });
    }

    // Returning a suspended item to service is a reactivation, and the
    // count is what maxReactivations is measured against.
    if (prevStatus === "suspended") {
      updated.exposureControl = {
        ...updated.exposureControl,
        reactivationCount: (updated.exposureControl?.reactivationCount || 0) + 1,
      };
    }
  }

  const lifecycleErrors = validateItemLifecycle(updated, db, {
    force: options.force === true,
  });

  if (lifecycleErrors.length) {
    return res.status(400).json({
      error: "Item lifecycle validation failed.",
      details: lifecycleErrors,
    });
  }

  const { valid, errors } = validateEntity("items", updated, db, {
    strict: strictFor(nextStatus),
  });

  if (!valid) return validationFailure(res, errors, "Item lifecycle validation failed.");

  items[index] = updated;
  db.items = items;
  saveDB(db);

  return res.json(updated);
}

router.patch("/:id/lifecycle", canAuthor, (req, res) => {
  const db = loadDB();
  const items = db.items || [];
  const index = items.findIndex((i) => i.id === req.params.id);

  if (index === -1) return res.status(404).json({ error: "Item not found." });

  // Forcing past the live-session gate is an admin act, matching
  // POST /api/taskModels/:id/force-deactivate.
  const force = req.body?.force === true;

  if (force && req.user?.role !== "admin") {
    return res
      .status(403)
      .json({ error: "Only an admin may force a transition past live sessions." });
  }

  return applyLifecycle(req, res, db, items, index, req.body?.nextStatus, { force });
});

/* GET /api/items/:id/dependents
   What a suspension or archival would break. The UI asks before it
   offers the force option, so the warning names real sessions. */
router.get("/:id/dependents", (req, res) => {
  const db = loadDB();
  const item = db.items?.find((i) => i.id === req.params.id);

  if (!item) return res.status(404).json({ error: "Item not found." });

  const live = liveSessionsForItem(item.id, db);

  res.json({
    liveSessionCount: live.length,
    liveSessions: live.map((s) => ({
      id: s.id,
      studentId: s.studentId ?? null,
      status: s.status ?? SESSION_STATUS.IN_PROGRESS,
    })),
  });
});

/* =============================================================
   CLONE
============================================================= */

router.post("/:id/clone", canAuthor, (req, res) => {
  const db = loadDB();
  const original = db.items?.find((i) => i.id === req.params.id);

  if (!original) return res.status(404).json({ error: "Item not found." });

  /* Any LOCKED item may be cloned, not only a confirmed one.

     Restricting this to `confirmed` produced a dead end: PUT refuses a
     locked record and tells the author to clone, but an operational or
     suspended item could not be cloned either -- so the two guards
     between them made a live item permanently unmaintainable. Cloning is
     the maintenance path; it has to be available wherever editing is
     not. An archived item is excluded: it is retired, and reviving it
     should be a deliberate re-authoring. */
  if (!original.locked) {
    return res.status(400).json({
      error: "This item is still editable — edit it directly rather than cloning.",
    });
  }

  if (original.status === "archived") {
    return res.status(400).json({
      error: "An archived item cannot be cloned. Author a new item against the Task Model instead.",
    });
  }

  const siblings = db.items.filter(
    (i) => i.parentItemId === original.id || i.id === original.id
  );

  const versionNumber =
    siblings.reduce((max, i) => Math.max(max, i.versionNumber || 1), 0) + 1;

  const cloned = deepClone(original);

  cloned.id = genId();
  cloned.status = "draft";
  cloned.locked = false;
  cloned.parentItemId = original.id;
  cloned.versionNumber = versionNumber;
  cloned.creator = req.user?.id || "system";
  cloned.modifier = null;
  cloned.createdAt = now();
  cloned.updatedAt = now();

  // Calibration belongs to the responses the ORIGINAL collected. A clone
  // has none, so it starts uncalibrated.
  cloned.psychometrics = {
    statisticalModelType: cloned.psychometrics?.statisticalModelType || "",
    calibrationStatus: "uncalibrated",
    irtParams: {},
    dinaParams: {},
  };

  /* Exposure counters reset too. deepClone carried usageCount across, so
     a clone of an item near its ceiling inherited the exposure and
     auto-retired the moment it was activated -- the clone exists
     precisely because the original was used up. */
  cloned.exposureControl = {
    usageCount: 0,
    maxUsageBeforeRetire: cloned.exposureControl?.maxUsageBeforeRetire || 0,
    reactivationCount: 0,
    maxReactivations: cloned.exposureControl?.maxReactivations || 0,
  };

  applyDerivedBinding(cloned, db);

  // The clone was previously pushed without validation of any kind.
  const { valid, errors } = validateEntity("items", cloned, db, { strict: false });

  if (!valid) return validationFailure(res, errors, "Clone failed validation.");

  db.items.push(cloned);
  saveDB(db);

  res.status(201).json(cloned);
});

/* =============================================================
   CALIBRATE
============================================================= */

router.post("/:id/calibrate", canAuthor, (req, res) => {
  const db = loadDB();
  const items = db.items || [];
  const index = items.findIndex((i) => i.id === req.params.id);

  if (index === -1) return res.status(404).json({ error: "Item not found." });

  const item = items[index];

  /* The previous implementation required `status === "confirmed"` and
     then, on the next line, refused the request if the status was
     operational or suspended -- unreachable code guarding against a state
     the first check had already excluded. The effect was that an
     OPERATIONAL item could never be calibrated, which is backwards:
     calibration is estimated from live response data, and live response
     data only exists once the item is in service. Confirmed, operational
     and suspended items may all be calibrated; a draft may not, because
     its structure can still change under the estimate. */
  if (!["confirmed", "operational", "suspended"].includes(item.status)) {
    return res.status(400).json({
      error: `Calibration applies to confirmed, operational or suspended items (this one is '${item.status}').`,
    });
  }

  const em = (db.evidenceModels || []).find((e) => e.id === item.evidenceModelId);
  const activeModel = em?.statisticalModels?.find((sm) => sm.active);

  /* Writing IRT parameters onto an item whose Evidence Model is not
     IRT-scored used to succeed here and then make the record permanently
     invalid: schema.js rejects "IRT parameters not allowed unless EM uses
     IRT", so every later save or transition of that item failed with an
     error the calibration screen had caused and never mentioned. */
  if (!activeModel) {
    return res.status(400).json({
      error: "The Evidence Model behind this item has no active statistical model, so there is nothing to calibrate against.",
    });
  }

  if (!["irt", "rasch"].includes(activeModel.type)) {
    return res.status(400).json({
      error: `This item is scored by a '${activeModel.type}' model, which does not take item parameters. Calibration applies to IRT and Rasch models.`,
    });
  }

  const { a, b, c, sampleSize, method } = req.body || {};

  // Rasch fixes discrimination at 1 by definition; accepting an `a` for
  // it would silently store a parameter the model does not use.
  const expectedA = activeModel.type === "rasch" ? 1 : a;

  if (activeModel.type === "irt" && (typeof a !== "number" || !Number.isFinite(a))) {
    return res.status(400).json({ error: "Discrimination 'a' must be a finite number." });
  }

  if (typeof b !== "number" || !Number.isFinite(b)) {
    return res.status(400).json({ error: "Difficulty 'b' must be a finite number." });
  }

  if (c !== undefined && c !== null && (typeof c !== "number" || c < 0 || c > 1)) {
    return res.status(400).json({ error: "Guessing 'c' must be a number between 0 and 1." });
  }

  const updated = {
    ...item,
    psychometrics: {
      ...item.psychometrics,
      statisticalModelType: activeModel.type,
      calibrationStatus:
        sampleSize && sampleSize > 0 ? "calibrated" : "pilot",
      irtParams: {
        a: expectedA,
        b,
        c: c ?? 0,
        sampleSize: sampleSize || 0,
        method: method || "manual",
        source: method || "manual",
        updatedAt: now(),
        calibratedAt: now(),
        calibratedBy: req.user?.id || "system",
      },
    },
    updatedAt: now(),
  };

  // Calibration used to write straight to the record and save, skipping
  // validateEntity entirely -- the one write path in this router that
  // could produce an invalid item.
  const { valid, errors } = validateEntity("items", updated, db, {
    strict: strictFor(updated.status),
  });

  if (!valid) return validationFailure(res, errors, "Calibration failed validation.");

  items[index] = updated;
  db.items = items;
  saveDB(db);

  res.json({
    message: "Item calibrated.",
    calibrationStatus: updated.psychometrics.calibrationStatus,
    irtParams: updated.psychometrics.irtParams,
  });
});

/* =============================================================
   EXPOSURE

   POST /api/items/:id/record-usage
   Increments the delivery counter and auto-suspends on exhaustion.

   `usageCount` has been in the schema, on the dashboard, in the exposure
   risk filter and in the auto-retire rule since the beginning, and NOTHING
   HAS EVER INCREMENTED IT -- every exposure figure in the product reads a
   counter permanently at zero. This is the endpoint that moves it. It is
   deliberately explicit rather than implicit in session submission:
   sessions currently deliver `questions`, not `items` (see
   server/routes/sessionRoutes.js), so wiring it into that path would mean
   changing session handling inside an item-bank change. Until delivery is
   migrated, this is the seam.
============================================================= */
router.post("/:id/record-usage", canAuthor, (req, res) => {
  const db = loadDB();
  const items = db.items || [];
  const index = items.findIndex((i) => i.id === req.params.id);

  if (index === -1) return res.status(404).json({ error: "Item not found." });

  // Day 29: the actual increment/auto-retire logic now lives in
  // server/utils/itemExposure.js, shared with the item-based session
  // delivery path (server/routes/sessionRoutes.js) -- see that module's
  // header for why this couldn't just be an internal HTTP call instead.
  const result = recordItemUsage(items[index], db, { count: req.body?.count });

  if (!result.ok) {
    if (result.details) return validationFailure(res, result.details, result.error);
    return res.status(409).json({ error: result.error });
  }

  items[index] = result.item;
  db.items = items;
  saveDB(db);

  res.json({
    usageCount: result.usageCount,
    maxUsageBeforeRetire: result.maxUsageBeforeRetire,
    status: result.status,
    autoSuspended: result.autoSuspended,
  });
});

/* =============================================================
   DELETE
============================================================= */

router.delete("/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const items = db.items || [];
  const item = items.find((i) => i.id === req.params.id);

  if (!item) return res.status(404).json({ error: "Item not found." });

  if (item.locked) {
    return res.status(409).json({
      error: "A confirmed item cannot be deleted. Archive it instead — the responses it collected still have to be interpretable.",
    });
  }

  /* A draft item can still have been answered: nothing stops a session
     from recording a response against an item that was later reverted to
     draft. Deleting it would orphan those responses, and a report that
     cannot resolve an item silently drops the evidence. */
  const answered = (db.sessions || []).filter((s) =>
    (s.responses || []).some((r) => r && r.itemId === item.id)
  );

  if (answered.length) {
    return res.status(409).json({
      error: `${answered.length} session(s) have recorded responses against this item, so deleting it would orphan them. Archive it instead.`,
    });
  }

  // Items referenced by a Task Model's advisory item map, cleaned up here
  // rather than left dangling for Step6ItemMapping to render as a blank
  // row.
  for (const tm of db.taskModels || []) {
    if (Array.isArray(tm.itemMappings)) {
      tm.itemMappings = tm.itemMappings.filter((m) => m.itemId !== item.id);
    }
    if (Array.isArray(tm.selectedItemIds)) {
      tm.selectedItemIds = tm.selectedItemIds.filter((id) => id !== item.id);
    }
  }

  db.items = items.filter((i) => i.id !== item.id);
  saveDB(db);

  res.status(204).end();
});

export default router;
