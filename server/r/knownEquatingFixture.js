// server/r/knownEquatingFixture.js
// D70: two Rasch forms, common-item NEAT design, known uniform shift.
//
// This is not a published coefficient table. The calendar exit check is
// a constructed fixture that recovers a known transformation in CI.
// Generation is documented so the matrix is reproducible without R:
//
//   seed            20261202 (mulberry32)
//   nX / nY         400 / 400 (independent samples, theta ~ N(0,1))
//   common          C.1 … C.6  b = [-1.25, -0.75, -0.25, 0.25, 0.75, 1.25]
//   form X unique   X.1 … X.4  b = [-1.0, -0.3, 0.4, 1.1]
//   form Y unique   Y.1 … Y.4  b = [-0.9, -0.2, 0.5, 1.2]
//   plant           every Form Y item (common + unique) is generated at
//                   b + 0.5. Form X uses the listed b.
//   missing         Form X persons have null on Y.* ; Form Y persons have
//                   null on X.* (not administered, never 0).
//   linking         Mean/Sigma on common-item Rasch b, putting Y on X:
//                   b_X ≈ A * b_Y + B. True A = 1, true B = -0.5.
//   runtime         mirt Rasch on each form (equate / plink are not on
//                   rvkmar/r-backend:latest).
//   P(u=1)          1 / (1 + exp(-(theta - b_used)))
//
// Forms travel on the ADR 0002 envelope as `forms`. Equating informs;
// it does not authorise a parameter set.

import { CALIBRATION_CONTRACT_VERSION } from "./calibrationContract.js";

const KNOWN_EQUATING_SEED = 20261202;
const KNOWN_EQUATING_SHIFT = 0.5;

const N_X = 400;
const N_Y = 400;
const FORM_X = "X";
const FORM_Y = "Y";

const COMMON_IDS = ["C.1", "C.2", "C.3", "C.4", "C.5", "C.6"];
const COMMON_B = [-1.25, -0.75, -0.25, 0.25, 0.75, 1.25];
const UNIQUE_X_IDS = ["X.1", "X.2", "X.3", "X.4"];
const UNIQUE_X_B = [-1.0, -0.3, 0.4, 1.1];
const UNIQUE_Y_IDS = ["Y.1", "Y.2", "Y.3", "Y.4"];
const UNIQUE_Y_B = [-0.9, -0.2, 0.5, 1.2];

const KNOWN_EQUATING_ITEM_IDS = [...UNIQUE_X_IDS, ...COMMON_IDS, ...UNIQUE_Y_IDS];

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

function generateKnownEquatingMatrix({ seed = KNOWN_EQUATING_SEED } = {}) {
  const rng = mulberry32(seed);
  const data = [];
  const labels = [];

  function drawRow(formY) {
    const theta = boxMuller(rng);
    const row = [];
    for (let j = 0; j < UNIQUE_X_IDS.length; j += 1) {
      row.push(formY ? null : rng() < invLogit(theta - UNIQUE_X_B[j]) ? 1 : 0);
    }
    for (let j = 0; j < COMMON_IDS.length; j += 1) {
      const b = formY ? COMMON_B[j] + KNOWN_EQUATING_SHIFT : COMMON_B[j];
      row.push(rng() < invLogit(theta - b) ? 1 : 0);
    }
    for (let j = 0; j < UNIQUE_Y_IDS.length; j += 1) {
      const b = UNIQUE_Y_B[j] + KNOWN_EQUATING_SHIFT;
      row.push(formY ? (rng() < invLogit(theta - b) ? 1 : 0) : null);
    }
    data.push(row);
    labels.push(formY ? FORM_Y : FORM_X);
  }

  for (let i = 0; i < N_X; i += 1) drawRow(false);
  for (let i = 0; i < N_Y; i += 1) drawRow(true);

  return {
    personIds: [...personIds("x", N_X), ...personIds("y", N_Y)],
    itemIds: [...KNOWN_EQUATING_ITEM_IDS],
    data,
    labels,
  };
}

export function knownEquatingCalibrationRequest({
  jobId = "job_known_equating",
  seed = KNOWN_EQUATING_SEED,
} = {}) {
  const matrix = generateKnownEquatingMatrix({ seed });
  return {
    contractVersion: CALIBRATION_CONTRACT_VERSION,
    jobId,
    model: {
      family: "equating",
      subtype: "Rasch",
      itemIds: [...matrix.itemIds],
    },
    responseMatrix: {
      personIds: matrix.personIds,
      itemIds: matrix.itemIds,
      data: matrix.data,
    },
    forms: {
      personIds: matrix.personIds,
      labels: matrix.labels,
      formX: FORM_X,
      formY: FORM_Y,
      commonItemIds: [...COMMON_IDS],
    },
    options: {
      maxIterations: 500,
      convergenceTolerance: 1e-4,
      seed,
      method: "Mean/Sigma",
      package: "mirt",
    },
  };
}
