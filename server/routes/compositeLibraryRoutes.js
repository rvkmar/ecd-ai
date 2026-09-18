// server/routes/compositeLibraryRoutes.js
// ------------------------------------------------------------------
// Composite library: the compiled, versioned delivery package built at
// Task Model activation. Per item: its presentation material, its
// interaction parameters, its evidence-activation mapping and the
// weights of evidence it contributes.
//
// THIS ROUTER IS DELIBERATELY READ-ONLY. That is a design decision, not
// an unfinished one, and it has two independent reasons:
//
//   1. schema.js declares this collection with NO status and no
//      lifecycle, and says why: "a build ARTIFACT keyed by
//      (taskModelId, taskModelVersion), not an authored entity a human
//      drafts/reviews/revises." A generic POST/PUT here would let a
//      human hand-author a delivery package that no Task Model
//      compiles to -- which is precisely the class of contradiction
//      the schema's own note exists to prevent.
//
//   2. ADR 0003 puts the compile boundary at structural facts. The
//      builder (compositeLibrary/builder.js, Day 24) is the only thing
//      that may produce one of these, and D49 is the unit that gives
//      it a caller at Task Model promotion. Exposing a write endpoint
//      now would create a second, uncompiled path into the same
//      collection before the first one exists.
//
// So: reads here, writes from the activation path in D49. The one
// mutating endpoint below is an explicit, admin-only REBUILD, which
// delegates to the builder rather than accepting a body -- the caller
// says which Task Model to compile, never what the package contains.
// ------------------------------------------------------------------
import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { isCompositeLibraryStale } from "../compositeLibrary/builder.js";
import { compileAndActivate } from "../compositeLibrary/activation.js";

const router = express.Router();

router.use(authenticateToken);
router.use(sanitizeRequestInputs);

const canRebuild = authorizeRole(["admin"]);

// D49a: id generation moved into compositeLibrary/activation.js, so the two
// paths that create a package share one counter and cannot mint the same id
// inside a single millisecond.

// ------------------------------
// GET /api/compositeLibrary            ?taskModelId= filters
//                                      ?active=true  only live packages
// ------------------------------
router.get("/", (req, res) => {
  const db = loadDB();
  let rows = db.compositeLibrary || [];
  const { taskModelId, active } = req.query;
  if (taskModelId) rows = rows.filter((r) => r.taskModelId === taskModelId);
  if (active === "true") rows = rows.filter((r) => r.active === true);
  res.json(rows);
});

// ------------------------------
// GET /api/compositeLibrary/active/:taskModelId
// The delivery-path read: the one package currently served for a Task
// Model. schema.js enforces at most one active package per taskModelId,
// so this is a single record or a 404.
// ------------------------------
router.get("/active/:taskModelId", (req, res) => {
  const db = loadDB();
  const row = (db.compositeLibrary || []).find(
    (r) => r.taskModelId === req.params.taskModelId && r.active === true
  );
  if (!row) {
    return res.status(404).json({
      error: `No active composite library for task model '${req.params.taskModelId}'.`,
    });
  }
  res.json(row);
});

// ------------------------------
// GET /api/compositeLibrary/:id
// ------------------------------
router.get("/:id", (req, res) => {
  const db = loadDB();
  const row = (db.compositeLibrary || []).find((r) => r.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Composite library package not found" });
  res.json(row);
});

// ------------------------------
// GET /api/compositeLibrary/:id/staleness
// Reports whether a package still reflects its sources, using the same
// isCompositeLibraryStale() the activation path uses. Advisory: it never
// mutates. Day 25 proved the boundary this rests on -- a package is stale
// on a Task Model or Evidence Model VERSION change, and explicitly NOT on
// recalibration alone (ADR 0003).
// ------------------------------
router.get("/:id/staleness", (req, res) => {
  const db = loadDB();
  const row = (db.compositeLibrary || []).find((r) => r.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Composite library package not found" });

  const taskModel = (db.taskModels || []).find((t) => t.id === row.taskModelId);
  if (!taskModel) {
    return res.status(409).json({
      error: `Package references task model '${row.taskModelId}', which no longer exists.`,
    });
  }

  const evidenceModels = (db.evidenceModels || []).filter((em) =>
    (taskModel.evidenceModelIds || []).includes(em.id)
  );

  try {
    const stale = isCompositeLibraryStale(row, { taskModel, evidenceModels });
    res.json({ id: row.id, taskModelId: row.taskModelId, stale });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ------------------------------
// POST /api/compositeLibrary/rebuild/:taskModelId
// Compile a fresh package from the CURRENT state of a Task Model. Takes
// no body: the package's contents are derived, never supplied. The
// previous active package for the same Task Model is deactivated rather
// than deleted, so a session that resolved against it can still be
// explained after the fact.
//
// D49 wires this same builder call into Task Model promotion so a
// package appears without anyone asking. This endpoint is the manual
// escape hatch for a stale package, not the primary path.
// ------------------------------
router.post("/rebuild/:taskModelId", canRebuild, (req, res) => {
  const db = loadDB();
  const taskModel = (db.taskModels || []).find((t) => t.id === req.params.taskModelId);
  if (!taskModel) return res.status(404).json({ error: "TaskModel not found" });

  // D49a: the compile / refuse-if-empty / deactivate-previous / validate
  // sequence used to live here. It now lives in compositeLibrary/activation.js
  // because Task Model promotion needs exactly the same behaviour, and two
  // copies of "what activating a package means" would be free to drift. This
  // route is now only responsible for deciding WHICH Task Model to compile
  // and for persisting the result.
  const result = compileAndActivate(taskModel, db);

  if (!result.ok) {
    // Deliberately no saveDB() on failure: compileAndActivate mutates the
    // snapshot as it deactivates the previous package, and that mutation must
    // die with the request rather than retiring a live package on a failed
    // rebuild.
    return res.status(result.status).json({
      error: result.error,
      details: result.details,
    });
  }

  saveDB(db);

  res.status(201).json({ ...result.record, warnings: result.warnings });
});

export default router;
