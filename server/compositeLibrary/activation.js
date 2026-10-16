// server/compositeLibrary/activation.js
//
// D49a. The single place a compositeLibrary package is compiled, checked
// and made active.
//
// WHY THIS MODULE EXISTS AT ALL. Two callers now need identical behaviour:
//
//   1. Task Model promotion to `operational` (taskModelsRoutes.js) -- the
//      primary path, and what ADR 0003 means by "built at Task Model
//      activation".
//   2. POST /api/compositeLibrary/rebuild/:taskModelId (D48) -- the manual
//      escape hatch for a package that has gone stale.
//
// D48 wrote the compile/refuse/deactivate sequence inline in the rebuild
// route. Copying it into the promotion path would leave two definitions of
// what "activate a package" means, free to drift -- and a drift between two
// modules that independently decide which items are deliverable is exactly
// the quiet class of failure this project keeps finding (F4, G4, F6, and the
// D48 guard's own blind spot). One definition, two callers.
//
// WHAT THIS MODULE DOES NOT DO: decide WHEN to activate. That is lifecycle
// policy and belongs to the routes. It also does not save; it mutates the
// passed `db` snapshot and lets the caller persist, so a promotion can write
// the Task Model and its package in one saveDB() rather than leaving a
// window where one landed and the other did not.

import { validateEntity } from "../../src/utils/schema.js";
import { buildCompositeLibrary } from "./builder.js";

// Shared with no one: both callers now come through here, so the counter
// cannot collide the way two independent `genId`s in two route files would.
// Date.now() alone collides whenever two records are created inside the same
// millisecond, which a bulk promotion would do routinely.
let idCounter = 0;
const genId = () => `cl${Date.now()}${(idCounter++ % 1000).toString().padStart(3, "0")}`;

/**
 * Compile a package for `taskModel` and make it the active one, replacing
 * whichever package was active for that Task Model before.
 *
 * Mutates `db.compositeLibrary` in place. Does NOT save.
 *
 * @param {object} taskModel - the Task Model to compile. For a promotion this
 *   MUST be the record as it will be AFTER the transition (status
 *   'operational', locked true) -- the builder refuses to surface items for a
 *   Task Model that is not itself instantiable, so passing the pre-transition
 *   record would silently compile an empty package.
 * @param {object} db - full db snapshot, mutated in place on success.
 * @returns {{ok: true, record: object, warnings: string[]}
 *          |{ok: false, status: number, error: string, details?: string[]}}
 */
export function compileAndActivate(taskModel, db) {
  let built;
  try {
    built = buildCompositeLibrary(taskModel, db);
  } catch (e) {
    // The builder DEGRADES for data problems and throws only for programmer
    // errors (a missing argument). A throw here is a bug in the caller, not
    // bad authoring, so it is a 500 rather than a 4xx.
    return {
      ok: false,
      status: 500,
      error: "Composite library build failed",
      details: [e.message],
    };
  }

  const { record: compiled, warnings } = built;

  // REFUSING RATHER THAN GUESSING.
  //
  // Read the comment before changing this: on the PROMOTION path this branch
  // should be unreachable, and that is the point of it.
  //
  // validateTaskModelLifecycle() already refuses to activate a Task Model
  // unless at least one item matches (taskModelId, taskModelVersion) with
  // status in confirmed/operational/suspended. buildCompositeLibrary() then
  // selects items with exactly that same filter. So if the lifecycle gate
  // passed, the compile cannot be empty -- unless those two filters have
  // drifted apart, which is a defect neither module could detect on its own.
  //
  // This check is therefore a coherence assertion between two modules that
  // independently define "a deliverable item", and it fails LOUDLY the day
  // they disagree. On the REBUILD path it is a genuine user-facing refusal:
  // that endpoint has no lifecycle gate in front of it.
  //
  // Activating an empty package would make a Task Model look delivery-ready
  // while resolving to nothing at request time -- a Task Model that is live,
  // selectable, and silently undeliverable.
  if (!Array.isArray(compiled.items) || compiled.items.length === 0) {
    return {
      ok: false,
      status: 409,
      error:
        "Refusing to activate an empty composite library package. The Task Model compiled to zero items.",
      details: warnings,
    };
  }

  const now = new Date().toISOString();
  const record = {
    ...compiled,
    id: genId(),
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  db.compositeLibrary = db.compositeLibrary || [];

  // Deactivate the previous package BEFORE validating. schema.js enforces at
  // most one active package per taskModelId; validating first would fail
  // against the package we are about to retire. The old record is kept, never
  // deleted -- a session that resolved against it must still be explicable
  // after the fact, which is the whole point of a versioned package.
  db.compositeLibrary = db.compositeLibrary.map((r) =>
    r.taskModelId === record.taskModelId && r.active
      ? { ...r, active: false, updatedAt: now }
      : r
  );

  const { valid, errors } = validateEntity("compositeLibrary", record, db);
  if (!valid) {
    // The deactivation above mutated `db`. Since nothing is saved unless the
    // caller saves, and every caller returns without saving on !ok, the
    // mutation dies with the request. Callers must not save on failure.
    return {
      ok: false,
      status: 400,
      error: "Composite library validation failed",
      details: errors,
    };
  }

  db.compositeLibrary.push(record);

  // Warnings travel with the package rather than being swallowed: a package
  // can compile successfully and still have skipped an item whose
  // evidenceModelId did not resolve, and whoever activated it needs to see
  // that.
  return { ok: true, record, warnings };
}

/**
 * Rebuild the active package for an instantiable Task Model.
 * Does not save. An empty compile is a reported failure, not a thrown one,
 * so confirmation can still land and the author can see why delivery
 * would refuse scoring.
 */
export function rebuildPackageForTaskModel(taskModel, db) {
  if (!taskModel) {
    return { ok: false, error: "Task model not found; composite library was not rebuilt." };
  }
  const result = compileAndActivate(taskModel, db);
  if (!result.ok) {
    return { ok: false, error: result.error, details: result.details || [] };
  }
  return {
    ok: true,
    id: result.record.id,
    taskModelId: result.record.taskModelId,
    itemCount: result.record.items.length,
    warnings: result.warnings || [],
  };
}
