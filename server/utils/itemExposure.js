// server/utils/itemExposure.js
//
// Day 29 (Week 6): the exposure-increment logic behind
// POST /api/items/:id/record-usage, extracted into a directly-callable
// function so the item-based session delivery path (server/routes/
// sessionRoutes.js) can call it too.
//
// This has to be a plain function, not an HTTP call to the existing route:
// that route is gated `canAuthor` (admin/district/teacher), but recording
// usage is a system-level side effect of DELIVERY, triggered by a student's
// own submission -- routing it through an author-only endpoint would mean
// either opening that gate to students (wrong, it's still an authoring
// action for the OTHER things that route could theoretically do) or the
// student's request failing authorization. A shared function sidesteps the
// question entirely: both callers run the same logic, gated by their own
// route's own auth, not by each other's.
//
// `usageCount` has been in the schema, on the dashboard, in the exposure
// risk filter and in the auto-retire rule since the beginning, and nothing
// has ever incremented it outside of a manual call to the route above --
// which nothing in the app ever made. Every exposure figure has been a
// permanent zero. This is what makes them real measurements.

import { validateEntity } from "../../src/utils/schema.js";

/**
 * Increment an item's usage counter and auto-suspend it if that pushes it
 * to or past its exposure ceiling. Only an `operational` item accrues
 * exposure -- delivering a draft/confirmed item in a preview or test
 * context is not "real" exposure, so this is a no-op (not an error) for
 * any other status, matching the existing route's semantics before this
 * extraction (that route also refused non-operational items, with a 409;
 * callers other than the HTTP route can decide for themselves whether a
 * no-op is fine or something worth surfacing).
 *
 * @param {object} item - a full items record
 * @param {object} db - the full db snapshot (needed for validateEntity's
 *   referential-integrity checks)
 * @param {{ count?: number }} [options] - how many uses to record; defaults
 *   to 1, and any non-positive/non-finite value is treated as 1
 * @returns {{ ok: true, item: object, usageCount: number,
 *   maxUsageBeforeRetire: number, status: string, autoSuspended: boolean }
 *   | { ok: false, error: string, details?: string[] }}
 */
export function recordItemUsage(item, db, { count } = {}) {
  if (!item) {
    return { ok: false, error: "recordItemUsage requires an item." };
  }

  if (item.status !== "operational") {
    return {
      ok: false,
      error: `Only an operational item accrues exposure (this one is '${item.status}').`,
    };
  }

  const delta = Number.isFinite(count) ? Math.max(1, count) : 1;

  const exposure = {
    ...item.exposureControl,
    usageCount: (item.exposureControl?.usageCount || 0) + delta,
  };

  const ceiling = exposure.maxUsageBeforeRetire || 0;
  const exhausted = ceiling > 0 && exposure.usageCount >= ceiling;

  const updated = {
    ...item,
    exposureControl: exposure,
    // Auto-retirement is what the ceiling is FOR. operational -> suspended
    // is a single legal transition, so this never trips the lifecycle
    // matrix the way a direct confirmed -> suspended rewrite would.
    status: exhausted ? "suspended" : item.status,
    updatedAt: new Date().toISOString(),
  };

  // Confirmation still requires a labeled correct option and a positive
  // activating score. This write is not a confirmation: the item is
  // already operational and delivery has already scored it. Re-applying
  // those content gates here rejected the increment, so usageCount stayed
  // 0. Scoring-model, lifecycle, and ceiling failures still refuse.
  const { valid, errors } = validateEntity("items", updated, db, {
    strict: true,
    exposureAccounting: true,
  });

  if (!valid) {
    return { ok: false, error: "Exposure update failed validation.", details: errors };
  }

  return {
    ok: true,
    item: updated,
    usageCount: exposure.usageCount,
    maxUsageBeforeRetire: ceiling,
    status: updated.status,
    autoSuspended: exhausted,
  };
}
