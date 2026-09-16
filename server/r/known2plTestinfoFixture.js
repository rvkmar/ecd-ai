// server/r/known2plTestinfoFixture.js
// D78: synthetic known 2PL parameter set for test-information curves.
// Hand I(θ) at θ∈{−1,0,1} is committed in the JSON (≥6 dp). The small
// dichotomous matrix exists so KR-20 can run on the same artefact; it is
// not a published dataset and does not invent LSAT7 a/b.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CALIBRATION_CONTRACT_VERSION } from "./calibrationContract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const KNOWN_2PL_TESTINFO_PATH = path.resolve(
  here,
  "fixtures/known-2pl-testinfo.json"
);

let cached = null;

function loadKnown2plTestinfoFixture() {
  if (!cached) {
    cached = JSON.parse(fs.readFileSync(KNOWN_2PL_TESTINFO_PATH, "utf8"));
  }
  return cached;
}

export function known2plTestinfoCalibrationRequest({
  jobId = "job_known_2pl_testinfo",
  seed,
} = {}) {
  const fix = loadKnown2plTestinfoFixture();
  const resolvedSeed = seed ?? fix.seed ?? 20261121;
  const itemIds = [...fix.itemIds];
  const parameters = structuredClone(fix.parameters);
  return {
    contractVersion: CALIBRATION_CONTRACT_VERSION,
    jobId,
    model: {
      family: "test-information",
      itemIds,
      parameters,
    },
    responseMatrix: {
      personIds: [...fix.responseMatrix.personIds],
      itemIds: [...fix.responseMatrix.itemIds],
      data: fix.responseMatrix.data.map((row) => [...row]),
    },
    options: {
      maxIterations: 1,
      convergenceTolerance: 0.0001,
      seed: resolvedSeed,
      sourceParameters: parameters,
      thetaMin: -3,
      thetaMax: 3,
      thetaStep: 0.1,
    },
  };
}
