// server/compositeLibrary/activePackage.js
//
// D49c. The single lookup for "the active compiled package for this Task
// Model". Activity Selection (D56) already had this as a local helper;
// Evidence Identification now needs the same fact, and two copies of
// "which package is live" are free to disagree about which items are
// scorable. One definition, two callers.
//
// Also the place Identification decides whether that package is FIT to
// score against. ADR 0003a (docs/adr/0003a-identification-reads-the-active-package.md):
// missing, inactive, or stale → refuse. Never silently fall through to
// the live authoring graph as if it were the package.

import { isCompositeLibraryStale } from "./builder.js";

/**
 * The active compiled package for a Task Model, or null.
 *
 * `active` is set by exactly one place — compositeLibrary/activation.js's
 * compileAndActivate(), which also deactivates whatever package was active
 * for that Task Model before — so at most one can match.
 */
export function activePackageFor(taskModelId, db) {
  if (!taskModelId) return null;
  return (
    (db.compositeLibrary || []).find((p) => p.taskModelId === taskModelId && p.active === true) ||
    null
  );
}

/**
 * The compiled entry for one item inside a package, or null.
 */
export function packageEntryFor(pkg, itemId) {
  if (!pkg || !itemId) return null;
  return (pkg.items || []).find((e) => e.itemId === itemId) || null;
}

/**
 * Resolve the structural facts Identification is allowed to score against:
 * the compiled item entry from the ACTIVE, non-stale package for the
 * item's Task Model.
 *
 * @param {object} item - needs `.id` and either `.taskModelId` or a
 *   `taskModelId` option (the submit path prefers the task instance's
 *   Task Model, already checked to match the item).
 * @param {object} db - full snapshot (needs .compositeLibrary, .taskModels,
 *   .evidenceModels)
 * @param {{ taskModelId?: string }} [options]
 * @returns {{ ok: true, package: object, entry: object }
 *          |{ ok: false, status: number, error: string }}
 */
export function resolveIdentificationStructure(item, db, options = {}) {
  const taskModelId = options.taskModelId || item?.taskModelId;

  if (!taskModelId) {
    return {
      ok: false,
      status: 409,
      error:
        "Item has no taskModelId; scoring cannot resolve a composite library package and refuses rather than re-walking the live authoring graph.",
    };
  }

  const pkg = activePackageFor(taskModelId, db);

  if (!pkg) {
    return {
      ok: false,
      status: 409,
      error:
        `No active composite library package for task model '${taskModelId}'. Scoring refuses rather than re-walking the live authoring graph. Rebuild via POST /api/compositeLibrary/rebuild/${taskModelId}.`,
    };
  }

  const taskModel = (db.taskModels || []).find((tm) => tm.id === taskModelId);

  if (!taskModel) {
    return {
      ok: false,
      status: 409,
      error:
        `Task model '${taskModelId}' is missing; the active package '${pkg.id || "(unidentified)"}' cannot be checked for staleness and will not be used for scoring.`,
    };
  }

  const { stale, reasons } = isCompositeLibraryStale(pkg, {
    taskModel,
    evidenceModels: db.evidenceModels || [],
    rubrics: db.rubrics || [],
  });

  if (stale) {
    return {
      ok: false,
      status: 409,
      error:
        `Active composite library package '${pkg.id || "(unidentified)"}' for task model '${taskModelId}' is stale and cannot be used for scoring: ${reasons.join(" ")} Rebuild via POST /api/compositeLibrary/rebuild/${taskModelId}.`,
    };
  }

  const itemId = item?.id;
  const entry = packageEntryFor(pkg, itemId);

  if (!entry) {
    return {
      ok: false,
      status: 409,
      error: `Item '${itemId}' is not in the active composite library package for task model '${taskModelId}'.`,
    };
  }

  return { ok: true, package: pkg, entry };
}
