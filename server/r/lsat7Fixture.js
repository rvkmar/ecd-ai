// server/r/lsat7Fixture.js
// D64: published LSAT7 response matrix as an ADR 0002 calibration request.
// Node ships its own copy at server/r/fixtures/lsat7-frequency-table.json so
// the compose node image (Dockerfile.node copies only server/ + src/utils)
// can enqueue `{ fixture: "lsat7" }` without r-backend/ on disk. The R-side
// twin is r-backend/app/tests/fixtures/lsat7-frequency-table.json (Bock &
// Lieberman 1970 / mirt::LSAT7 via expand.table). A drift test keeps the
// two files equal when both exist in the checkout.
//
// mirt::LSAT7 is LSAT *section* 7: 1000 examinees × 5 items. The 7 is not
// the item count. Enqueue with `{ fixture: "lsat7" }` (IRT 2PL) or
// `{ fixture: "lsat7-ctt" }` (CTT / TAM::tam.ctt) and the job route fills
// request.model / responseMatrix / options.seed via
// applyNamedCalibrationFixture in calibrationFixtures.js.
// There is no published KR-20 / point-biserial table for this matrix in
// this pipeline; CTT difficulty is the published item mean.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CALIBRATION_CONTRACT_VERSION } from "./calibrationContract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const LSAT7_FREQUENCY_TABLE_PATH = path.resolve(
  here,
  "fixtures/lsat7-frequency-table.json"
);

const LSAT7_SEED = 20261120;

let cachedTable = null;

function loadLsat7FrequencyTable() {
  if (!cachedTable) {
    cachedTable = JSON.parse(fs.readFileSync(LSAT7_FREQUENCY_TABLE_PATH, "utf8"));
  }
  return cachedTable;
}

function expandLsat7Responses() {
  const table = loadLsat7FrequencyTable();
  const data = [];
  for (const pattern of table.patterns) {
    for (let i = 0; i < pattern.freq; i += 1) {
      data.push([...pattern.responses]);
    }
  }
  return data;
}

function lsat7PersonIds(n) {
  return Array.from({ length: n }, (_, i) => `p${String(i + 1).padStart(4, "0")}`);
}

export function lsat7CalibrationRequest({
  jobId = "job_lsat7",
  seed = LSAT7_SEED,
  family = "irt",
} = {}) {
  const table = loadLsat7FrequencyTable();
  const data = expandLsat7Responses();
  const resolvedFamily = family === "ctt" ? "ctt" : "irt";
  const model =
    resolvedFamily === "ctt"
      ? { family: "ctt", itemIds: [...table.itemIds] }
      : { family: "irt", subtype: "2PL", itemIds: [...table.itemIds] };
  return {
    contractVersion: CALIBRATION_CONTRACT_VERSION,
    jobId,
    model,
    responseMatrix: {
      personIds: lsat7PersonIds(data.length),
      itemIds: [...table.itemIds],
      data,
    },
    options: {
      maxIterations: resolvedFamily === "ctt" ? 1 : 200,
      convergenceTolerance: 0.0001,
      seed,
    },
  };
}
