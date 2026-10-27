// src/components/qMatrix/QMatrixValidity.js
// ------------------------------------------------------------
// D52 — Q-matrix validity rules (W11).
//
// Pure functions, no React/DOM/API dependency, so they're testable in
// isolation and reusable by both the editor (live feedback while
// authoring) and, if a future day wants it, a server-side re-check.
//
// Two severities, matching the D52 exit check exactly:
//   - errors     block confirmation (surfaced as red rows in the grid)
//   - advisories are shown but never block confirmation (amber columns)
//
// Severity is exactly as the D52 calendar spec states it (only rule 1 is
// blocking -- an earlier pass in this file had rule 2 blocking too, which
// contradicted the spec; corrected before this was recorded as done):
//   1. All-zero row    -- an item added to the matrix that requires no
//                          attribute contributes nothing to a DINA/G-DINA
//                          classification. BLOCKING.
//   2. Duplicate row    -- two items requiring the exact same attribute
//                          set carry no additional diagnostic information
//                          over one another. ADVISORY.
//   3. Identifiability  -- an attribute never required by an item ALONE
//                          (a "pure" item) is harder to separate from the
//                          attributes it always co-occurs with. This is a
//                          practical heuristic, not a full identifiability
//                          proof. ADVISORY.
//   4. Attribute-vs-item coverage -- an attribute required by very few
//                          items is a calibration risk (unstable slip/
//                          guess estimates). ADVISORY.
//
// KNOWN GAP (see claude/day51c-* handoff): this is the client-side half
// only. The D52 spec also calls for "the readiness mirror agrees with the
// strict validator, asserted by a test" -- this codebase's established
// pattern (see taskModelStructure.test.js's "operational readiness mirrors
// the activation gate") is a server-side strict check PLUS a client mirror
// proven not to drift from it. No server-side enforcement of rules 1-2
// exists yet (server/utils/lifecycleValidation.js's
// validateQMatrixModelLifecycle only checks entries.length > 0 at
// confirmation, not per-row validity), so nothing today stops an all-zero
// or duplicate row from being confirmed via a direct API call that
// bypasses this UI. Not fixed in this pass -- flagged honestly instead.
// ------------------------------------------------------------

export const MIN_ITEMS_PER_ATTRIBUTE = 3;

/**
 * @param {object} params
 * @param {string[]} params.attributeIds - declared Q-matrix attributes
 * @param {{id:string}[]} params.includedItems - items currently added as rows
 * @param {{itemId:string, attributeId:string}[]} params.entries - checked cells
 * @returns {{errors: object[], advisories: object[]}}
 */
export function computeQMatrixValidity({
  attributeIds = [],
  includedItems = [],
  entries = [],
}) {
  const errors = [];
  const advisories = [];

  const attrsByItem = new Map(includedItems.map((item) => [item.id, new Set()]));
  entries.forEach((entry) => {
    if (attrsByItem.has(entry.itemId)) {
      attrsByItem.get(entry.itemId).add(entry.attributeId);
    }
  });

  // Rule 1: all-zero rows.
  includedItems.forEach((item) => {
    const attrs = attrsByItem.get(item.id);
    if (!attrs || attrs.size === 0) {
      const name = item.label || item.id;
      const noun = item.rowKind === "observable" ? "Observable" : "Item";
      errors.push({
        code: "empty-row",
        itemId: item.id,
        message: `${noun} '${name}' requires no attributes. Every row in the Q-matrix must require at least one attribute.`,
      });
    }
  });

  // Rule 2: duplicate rows (only among items that passed rule 1).
  const fingerprints = new Map();
  includedItems.forEach((item) => {
    const attrs = attrsByItem.get(item.id);
    if (!attrs || attrs.size === 0) return;
    const key = attributeIds.filter((a) => attrs.has(a)).join("|");
    if (!fingerprints.has(key)) fingerprints.set(key, []);
    fingerprints.get(key).push(item.id);
  });
  fingerprints.forEach((itemIds) => {
    if (itemIds.length > 1) {
      advisories.push({
        code: "duplicate-row",
        itemIds,
        message: `Items ${itemIds.join(", ")} require the exact same attribute set. Duplicate rows carry no additional diagnostic information.`,
      });
    }
  });

  // Rule 3: identifiability -- each attribute needs at least one "pure" item.
  attributeIds.forEach((attrId) => {
    const hasPureItem = includedItems.some((item) => {
      const attrs = attrsByItem.get(item.id);
      return attrs && attrs.size === 1 && attrs.has(attrId);
    });
    if (!hasPureItem) {
      advisories.push({
        code: "identifiability",
        attributeId: attrId,
        message: `Attribute '${attrId}' is never required in isolation by a single item, which weakens statistical identifiability.`,
      });
    }
  });

  // Rule 4: attribute-vs-item coverage.
  attributeIds.forEach((attrId) => {
    const count = includedItems.filter((item) => attrsByItem.get(item.id)?.has(attrId)).length;
    if (count > 0 && count < MIN_ITEMS_PER_ATTRIBUTE) {
      advisories.push({
        code: "low-coverage",
        attributeId: attrId,
        message: `Only ${count} item(s) require attribute '${attrId}'; at least ${MIN_ITEMS_PER_ATTRIBUTE} is recommended for stable calibration.`,
      });
    }
  });

  return { errors, advisories };
}
