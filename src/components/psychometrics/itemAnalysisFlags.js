// D82 — advisory bounds for item-analysis artefacts.
// Flags are advisory only (artefacts never gate lifecycle). Every flag
// names its threshold and a next action (Part 5.2).

export const ITEM_ANALYSIS_BOUNDS = Object.freeze({
  tooHard: { field: "pValue", threshold: 0.2, op: "lt" },
  tooEasy: { field: "pValue", threshold: 0.9, op: "gt" },
  lowDiscrimination: { field: "pointBiserial", threshold: 0.2, op: "lt" },
  negativeDiscrimination: { field: "pointBiserial", threshold: 0, op: "lt" },
});

function formatNum(n, digits = 2) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

/**
 * @returns {{ code: string, threshold: number, message: string }[]}
 */
export function flagsForItemRow(row) {
  const flags = [];
  const p = row?.pValue;
  const rpb = row?.pointBiserial;

  if (typeof p === "number" && Number.isFinite(p)) {
    if (p < ITEM_ANALYSIS_BOUNDS.tooHard.threshold) {
      const t = ITEM_ANALYSIS_BOUNDS.tooHard.threshold;
      flags.push({
        code: "tooHard",
        threshold: t,
        message: `p-value ${formatNum(p)} is below the ${formatNum(t)} floor; most examinees miss this item — simplify the stem or check for a keying error.`,
      });
    }
    if (p > ITEM_ANALYSIS_BOUNDS.tooEasy.threshold) {
      const t = ITEM_ANALYSIS_BOUNDS.tooEasy.threshold;
      flags.push({
        code: "tooEasy",
        threshold: t,
        message: `p-value ${formatNum(p)} exceeds the ${formatNum(t)} ceiling; most examinees get this right — revise stem/options or retire it if it adds little information.`,
      });
    }
  }

  if (typeof rpb === "number" && Number.isFinite(rpb)) {
    if (rpb < ITEM_ANALYSIS_BOUNDS.negativeDiscrimination.threshold) {
      const t = ITEM_ANALYSIS_BOUNDS.negativeDiscrimination.threshold;
      flags.push({
        code: "negativeDiscrimination",
        threshold: t,
        message: `Point-biserial ${formatNum(rpb)} is negative (below ${formatNum(t)}); high scorers miss this item more often — check the key and distractors before keeping it.`,
      });
    } else if (rpb < ITEM_ANALYSIS_BOUNDS.lowDiscrimination.threshold) {
      const t = ITEM_ANALYSIS_BOUNDS.lowDiscrimination.threshold;
      flags.push({
        code: "lowDiscrimination",
        threshold: t,
        message: `Point-biserial ${formatNum(rpb)} is below the ${formatNum(t)} threshold; review the distractors or retire the item.`,
      });
    }
  }

  return flags;
}

/** Flatten artefact.payload.parameters into sortable rows. */
export function itemRowsFromArtefact(artefact) {
  const parameters = artefact?.payload?.parameters || artefact?.parameters || {};
  return Object.entries(parameters).map(([itemId, stats]) => {
    const row = {
      itemId,
      pValue: stats?.pValue ?? null,
      pointBiserial: stats?.pointBiserial ?? null,
      n: stats?.n ?? null,
      distractors: stats?.distractors ?? null,
    };
    row.flags = flagsForItemRow(row);
    return row;
  });
}
