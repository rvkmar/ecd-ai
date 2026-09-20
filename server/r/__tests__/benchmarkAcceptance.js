// server/r/benchmarkAcceptance.js
// D88: stated acceptance predicates for the five live CI benchmarks.
//
// Live pipeline tests assert `ok === true` on real R responses.
// Perturbation tests assert `ok === false` when values are deliberately
// wrong — that is the drift-detection half of the calendar exit check.
//
// Reasons are written into failure strings (not invented coefficient
// tables). D64/D67 restatements stand: no published a/b or KR-20 pin.

export const LSAT7_ITEM_IDS = ["Item.1", "Item.2", "Item.3", "Item.4", "Item.5"];
export const PLANTED_DIF_ITEM = "Item.5";
export const KNOWN_EQUATING_SLOPE = 1;
export const KNOWN_EQUATING_INTERCEPT = -0.5;
export const EQUATING_SLOPE_TOLERANCE = 0.2;
export const EQUATING_INTERCEPT_TOLERANCE = 0.3;
/** Required attribute-count pattern from published sim10GDINA simQ (10×3). */
export const SIM10_REQUIRED_COUNTS = [1, 1, 1, 2, 2, 2, 2, 2, 2, 3];

function fail(failures, msg) {
  failures.push(msg);
}

/**
 * LSAT7 2PL (D64): converged mirt run on the published 1000×5 matrix.
 * Item.5 b < Item.4 b because published p(Item.5)=0.843 > p(Item.4)=0.606.
 */
export function checkLsat7IrtAcceptance(response, { itemIds = LSAT7_ITEM_IDS } = {}) {
  const failures = [];
  if (response?.converged !== true) fail(failures, "converged must be true");
  if (!/^mirt /.test(String(response?.packageVersion || ""))) {
    fail(failures, "packageVersion must match /^mirt /");
  }
  if (response?.sampleSize !== 1000) fail(failures, "sampleSize must be 1000");

  const parameters = response?.parameters || {};
  for (const id of itemIds) {
    const par = parameters[id];
    if (!par) {
      fail(failures, `missing parameters for ${id}`);
      continue;
    }
    if (!(par.a > 0)) fail(failures, `${id}.a must be > 0`);
    if (!Number.isFinite(par.b)) fail(failures, `${id}.b must be finite`);
  }

  const b5 = parameters["Item.5"]?.b;
  const b4 = parameters["Item.4"]?.b;
  if (!(Number.isFinite(b5) && Number.isFinite(b4) && b5 < b4)) {
    fail(
      failures,
      "Item.5.b must be < Item.4.b (easier item: published p 0.843 vs 0.606)"
    );
  }

  return { ok: failures.length === 0, failures };
}

/**
 * sim10GDINA G-DINA (D66): 2^k table lengths from simQ; values in [0,1];
 * P(all mastered) > P(none) on every item. Not a recovered-vs-simItempar pin.
 */
export function checkSim10GdinaAcceptance(
  response,
  { itemIds, requiredCounts = SIM10_REQUIRED_COUNTS } = {}
) {
  const failures = [];
  if (response?.converged !== true) fail(failures, "converged must be true");
  if (!/^GDINA /.test(String(response?.packageVersion || ""))) {
    fail(failures, "packageVersion must match /^GDINA /");
  }
  if (response?.sampleSize !== 1000) fail(failures, "sampleSize must be 1000");

  if (!Array.isArray(itemIds) || itemIds.length !== requiredCounts.length) {
    fail(failures, "itemIds length must match requiredCounts (simQ rows)");
    return { ok: false, failures };
  }

  const parameters = response?.parameters || {};
  for (let i = 0; i < itemIds.length; i += 1) {
    const id = itemIds[i];
    const par = parameters[id];
    const k = requiredCounts[i];
    if (!par) {
      fail(failures, `missing parameters for ${id}`);
      continue;
    }
    if (!Array.isArray(par.probabilities)) {
      fail(failures, `${id}.probabilities must be an array`);
      continue;
    }
    if (par.probabilities.length !== 2 ** k) {
      fail(failures, `${id}.probabilities length must be 2^${k}=${2 ** k}`);
    }
    if (
      !par.probabilities.every((p) => Number.isFinite(p) && p >= 0 && p <= 1)
    ) {
      fail(failures, `${id}.probabilities must all lie in [0,1]`);
    }
    const pNone = par.probabilities[0];
    const pAll = par.probabilities[par.probabilities.length - 1];
    if (!(pAll > pNone)) {
      fail(failures, `${id}: P(all mastered) must be > P(none)`);
    }
  }

  return { ok: failures.length === 0, failures };
}

/**
 * LSAT7 CTT (D67): difficulty equals published item means (definitional);
 * Item.5 p > Item.4 p; rpb in (0,1); KR-20 in (0,1). No published KR-20 pin.
 */
export function checkLsat7CttAcceptance(
  response,
  { itemIds = LSAT7_ITEM_IDS, publishedMeans } = {}
) {
  const failures = [];
  if (response?.converged !== true) fail(failures, "converged must be true");
  if (!/^TAM /.test(String(response?.packageVersion || ""))) {
    fail(failures, "packageVersion must match /^TAM /");
  }
  if (response?.sampleSize !== 1000) fail(failures, "sampleSize must be 1000");

  const parameters = response?.parameters || {};
  for (const id of itemIds) {
    const par = parameters[id];
    if (!par) {
      fail(failures, `missing CTT parameters for ${id}`);
      continue;
    }
    if (par.n !== 1000) fail(failures, `${id}.n must be 1000`);
    if (publishedMeans && Number.isFinite(publishedMeans[id])) {
      if (Math.abs(par.difficulty - publishedMeans[id]) > 1e-6) {
        fail(
          failures,
          `${id}.difficulty must equal published mean ${publishedMeans[id]}`
        );
      }
    }
    if (
      !(
        Number.isFinite(par.discrimination) &&
        par.discrimination > 0 &&
        par.discrimination < 1
      )
    ) {
      fail(failures, `${id}.discrimination (rpb) must be in (0,1)`);
    }
  }

  const d5 = parameters["Item.5"]?.difficulty;
  const d4 = parameters["Item.4"]?.difficulty;
  if (!(Number.isFinite(d5) && Number.isFinite(d4) && d5 > d4)) {
    fail(
      failures,
      "Item.5.difficulty must be > Item.4.difficulty (published p 0.843 vs 0.606)"
    );
  }

  const kr20 = response?.fitStatistics?.kr20;
  if (!(Number.isFinite(kr20) && kr20 > 0 && kr20 < 1)) {
    fail(failures, "fitStatistics.kr20 must be in (0,1)");
  }

  return { ok: failures.length === 0, failures };
}

/**
 * Planted DIF (D69): unique ETS C on Item.5 from |deltaMH| >= 1.5;
 * no other item flagged C.
 */
export function checkPlantedDifAcceptance(
  response,
  { plantedItem = PLANTED_DIF_ITEM } = {}
) {
  const failures = [];
  if (response?.converged !== true) fail(failures, "converged must be true");
  if (!/^difR /.test(String(response?.packageVersion || ""))) {
    fail(failures, "packageVersion must match /^difR /");
  }
  if (response?.sampleSize !== 800) fail(failures, "sampleSize must be 800");

  const parameters = response?.parameters || {};
  const flagged = Object.entries(parameters)
    .filter(([, p]) => p?.flag === true)
    .map(([id]) => id);

  if (!(flagged.length === 1 && flagged[0] === plantedItem)) {
    fail(failures, `exactly one flagged item must be ${plantedItem}`);
  }

  const planted = parameters[plantedItem];
  if (!planted) {
    fail(failures, `missing parameters for planted ${plantedItem}`);
  } else {
    if (planted.etsClass !== "C") fail(failures, `${plantedItem} etsClass must be C`);
    if (!(Math.abs(planted.deltaMH) >= 1.5)) {
      fail(failures, `${plantedItem} |deltaMH| must be >= 1.5 (ETS C band)`);
    }
  }

  for (const [id, p] of Object.entries(parameters)) {
    if (id === plantedItem) continue;
    if (p?.flag === true) fail(failures, `${id} must not be flagged`);
    if (p?.etsClass === "C") fail(failures, `${id} must not be ETS C`);
    if (!(Math.abs(p?.deltaMH) < 1.5)) {
      fail(failures, `${id} |deltaMH| must be < 1.5`);
    }
  }

  return { ok: failures.length === 0, failures };
}

/**
 * Known equating (D70): plink Mean/Sigma recovers slope≈1, intercept≈−0.5.
 */
export function checkKnownEquatingAcceptance(response) {
  const failures = [];
  if (response?.converged !== true) fail(failures, "converged must be true");
  if (!/^plink /.test(String(response?.packageVersion || ""))) {
    fail(failures, "packageVersion must match /^plink /");
  }
  if (response?.sampleSize !== 800) fail(failures, "sampleSize must be 800");

  const p = response?.parameters || {};
  if (p.method !== "Mean/Sigma") fail(failures, "method must be Mean/Sigma");
  if (p.from !== "Y") fail(failures, "from must be Y");
  if (p.to !== "X") fail(failures, "to must be X");

  if (!(Math.abs(p.slope - KNOWN_EQUATING_SLOPE) < EQUATING_SLOPE_TOLERANCE)) {
    fail(
      failures,
      `slope must be within ${EQUATING_SLOPE_TOLERANCE} of ${KNOWN_EQUATING_SLOPE}`
    );
  }
  if (
    !(
      Math.abs(p.intercept - KNOWN_EQUATING_INTERCEPT) <
      EQUATING_INTERCEPT_TOLERANCE
    )
  ) {
    fail(
      failures,
      `intercept must be within ${EQUATING_INTERCEPT_TOLERANCE} of ${KNOWN_EQUATING_INTERCEPT}`
    );
  }

  return { ok: failures.length === 0, failures };
}

/**
 * Hub / live R image must expose the packages the five benchmarks need.
 * Fails loudly when `rvkmar/r-backend:latest` regresses (D70 Hub gap).
 */
export function checkRBackendBenchmarkPackages(healthJson) {
  const failures = [];
  if (healthJson?.status !== "healthy") {
    fail(failures, "health status must be healthy");
  }
  const packages = healthJson?.packages || {};
  const required = ["mirt", "GDINA", "TAM", "difR", "plink"];
  for (const name of required) {
    if (!packages[name]) {
      fail(
        failures,
        `packages.${name} missing — Hub image must include it for live CI`
      );
    }
  }
  return { ok: failures.length === 0, failures };
}
