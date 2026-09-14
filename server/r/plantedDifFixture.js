// server/r/plantedDifFixture.js
// D69: seeded dichotomous matrix with one planted uniform DIF item.
//
// This is not a published coefficient table. The calendar exit check is
// a seeded fixture that flags the planted item and only that item in CI.
// Generation is documented so the matrix is reproducible without R:
//
//   seed            20261201 (mulberry32)
//   nRef / nFocal   400 / 400 (equal ability: theta ~ N(0,1) in both)
//   items           Item.1 … Item.8
//   Rasch b         [-1.4, -1.0, -0.6, -0.2, 0.2, 0.6, 1.0, 1.4]
//   planted         Item.5 (column 4): focal group answers against b+2.5
//                   (uniform DIF). Reference uses the listed b.
//   flag            ETS C (|deltaMH| >= 1.5), with delta from -2.35*log(alphaMH).
//                   Unadjusted MH p < 0.05 overflagged Item.1 and Item.4 on
//                   a66c475. 2d602bb used ETS C but read a missing deltaMH
//                   field, so every item looked unflagged.
//   P(u=1)          1 / (1 + exp(-(theta - b_used)))
//
// Groups travel on the ADR 0002 request as `groups` (focal/reference
// labels per person). DIF informs; it does not authorise a parameter set.

import { CALIBRATION_CONTRACT_VERSION } from "./calibrationContract.js";

const PLANTED_DIF_SEED = 20261201;
const PLANTED_DIF_ITEM_ID = "Item.5";
const PLANTED_DIF_N_REF = 400;
const PLANTED_DIF_N_FOCAL = 400;
const PLANTED_DIF_ITEM_IDS = [
  "Item.1",
  "Item.2",
  "Item.3",
  "Item.4",
  "Item.5",
  "Item.6",
  "Item.7",
  "Item.8",
];
const PLANTED_DIF_B = [-1.4, -1.0, -0.6, -0.2, 0.2, 0.6, 1.0, 1.4];
const PLANTED_DIF_FOCAL_SHIFT = 2.5;
const PLANTED_DIF_REFERENCE = "reference";
const PLANTED_DIF_FOCAL = "focal";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function boxMuller(rng) {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function invLogit(x) {
  return 1 / (1 + Math.exp(-x));
}

function personIds(prefix, n) {
  return Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(4, "0")}`);
}

function generatePlantedDifMatrix({ seed = PLANTED_DIF_SEED } = {}) {
  const rng = mulberry32(seed);
  const plantedIndex = PLANTED_DIF_ITEM_IDS.indexOf(PLANTED_DIF_ITEM_ID);
  const data = [];
  const labels = [];

  function drawRow(focal) {
    const theta = boxMuller(rng);
    const row = PLANTED_DIF_B.map((b, j) => {
      const used = focal && j === plantedIndex ? b + PLANTED_DIF_FOCAL_SHIFT : b;
      return rng() < invLogit(theta - used) ? 1 : 0;
    });
    data.push(row);
    labels.push(focal ? PLANTED_DIF_FOCAL : PLANTED_DIF_REFERENCE);
  }

  for (let i = 0; i < PLANTED_DIF_N_REF; i += 1) drawRow(false);
  for (let i = 0; i < PLANTED_DIF_N_FOCAL; i += 1) drawRow(true);

  const ids = [...personIds("r", PLANTED_DIF_N_REF), ...personIds("f", PLANTED_DIF_N_FOCAL)];
  return {
    personIds: ids,
    itemIds: [...PLANTED_DIF_ITEM_IDS],
    data,
    labels,
  };
}

export function plantedDifCalibrationRequest({
  jobId = "job_planted_dif",
  seed = PLANTED_DIF_SEED,
} = {}) {
  const matrix = generatePlantedDifMatrix({ seed });
  return {
    contractVersion: CALIBRATION_CONTRACT_VERSION,
    jobId,
    model: {
      family: "dif",
      itemIds: [...matrix.itemIds],
    },
    responseMatrix: {
      personIds: matrix.personIds,
      itemIds: matrix.itemIds,
      data: matrix.data,
    },
    groups: {
      personIds: matrix.personIds,
      labels: matrix.labels,
      reference: PLANTED_DIF_REFERENCE,
      focal: PLANTED_DIF_FOCAL,
    },
    options: {
      maxIterations: 1,
      convergenceTolerance: 0.05,
      seed,
      method: "Mantel-Haenszel",
      package: "difR",
    },
  };
}
