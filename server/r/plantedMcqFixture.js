// Constructed MCQ matrix for Iteman-class distractor analysis.
// Not a published table. Keys, option counts, and planted failures are
// definitional on this seed. LSAT7 stays dichotomous and is not used here.

import { CALIBRATION_CONTRACT_VERSION } from "./calibrationContract.js";

const PLANTED_MCQ_SEED = 20261027;
const PLANTED_MCQ_ITEM_IDS = [
  "Item.easy",
  "Item.attractive",
  "Item.unused",
  "Item.ok",
];
const PLANTED_MCQ_OPTIONS = ["A", "B", "C", "D"];
const PLANTED_MCQ_N_PERSONS = 20;
const PLANTED_MCQ_CUT_SCORE = 2;

const KEYS = {
  "Item.easy": "A",
  "Item.attractive": "A",
  "Item.unused": "A",
  "Item.ok": "A",
};

function optionFor(personIndex, itemId) {
  // personIndex 0 = lowest ability, 19 = highest.
  if (itemId === "Item.easy") {
    return personIndex >= 4 ? "A" : "B";
  }
  if (itemId === "Item.attractive") {
    if (personIndex >= 15) return "C";
    if (personIndex >= 8) return "A";
    return "B";
  }
  if (itemId === "Item.unused") {
    if (personIndex >= 10) return "A";
    if (personIndex >= 5) return "B";
    return "C";
  }
  if (personIndex >= 12) return "A";
  if (personIndex >= 6) return "B";
  return "C";
}

function itemKey(itemId) {
  return {
    keyedOptionId: KEYS[itemId],
    options: PLANTED_MCQ_OPTIONS.map((id) => ({
      id,
      label: id,
      text: `${itemId} option ${id}`,
    })),
  };
}

export function plantedMcqCalibrationRequest({ jobId } = {}) {
  const personIds = Array.from(
    { length: PLANTED_MCQ_N_PERSONS },
    (_, i) => `P${String(i + 1).padStart(2, "0")}`
  );
  const optionData = personIds.map((_, i) =>
    PLANTED_MCQ_ITEM_IDS.map((itemId) => optionFor(i, itemId))
  );
  const data = optionData.map((row, i) =>
    PLANTED_MCQ_ITEM_IDS.map((itemId, j) => (row[j] === KEYS[itemId] ? 1 : 0))
  );
  const itemKeys = Object.fromEntries(PLANTED_MCQ_ITEM_IDS.map((id) => [id, itemKey(id)]));

  return {
    contractVersion: CALIBRATION_CONTRACT_VERSION,
    jobId: jobId || "planted-mcq",
    model: {
      family: "item-analysis",
      itemIds: [...PLANTED_MCQ_ITEM_IDS],
    },
    responseMatrix: {
      personIds,
      itemIds: [...PLANTED_MCQ_ITEM_IDS],
      data,
    },
    optionMatrix: {
      personIds,
      itemIds: [...PLANTED_MCQ_ITEM_IDS],
      data: optionData,
    },
    itemKeys,
    domains: [
      { id: "algebra", itemIds: ["Item.easy", "Item.attractive"] },
      { id: "geometry", itemIds: ["Item.unused", "Item.ok"] },
    ],
    cutScore: PLANTED_MCQ_CUT_SCORE,
    options: {
      seed: PLANTED_MCQ_SEED,
      maxIterations: 1,
      nQuantiles: 5,
    },
  };
}
