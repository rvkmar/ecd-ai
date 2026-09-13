// server/r/lsat7Fixture.js
// D64: published LSAT7 response matrix as an ADR 0002 calibration request.
// Source of truth is r-backend/app/tests/fixtures/lsat7-frequency-table.json
// (Bock & Lieberman 1970 / mirt::LSAT7 via expand.table).
//
// mirt::LSAT7 is LSAT *section* 7: 1000 examinees × 5 items. The 7 is not
// the item count. Enqueue with `{ fixture: "lsat7" }` and the job route
// fills request.model / responseMatrix / options.seed.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CALIBRATION_CONTRACT_VERSION } from "./calibrationContract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FREQUENCY_TABLE_PATH = path.resolve(
  here,
  "../../r-backend/app/tests/fixtures/lsat7-frequency-table.json"
);

const LSAT7_SEED = 20261120;

export const CALIBRATION_NAMED_FIXTURES = ["lsat7"];

let cachedTable = null;

function loadLsat7FrequencyTable() {
  if (!cachedTable) {
    cachedTable = JSON.parse(fs.readFileSync(FREQUENCY_TABLE_PATH, "utf8"));
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

function lsat7CalibrationRequest({ jobId = "job_lsat7", seed = LSAT7_SEED } = {}) {
  const table = loadLsat7FrequencyTable();
  const data = expandLsat7Responses();
  return {
    contractVersion: CALIBRATION_CONTRACT_VERSION,
    jobId,
    model: {
      family: "irt",
      subtype: "2PL",
      itemIds: [...table.itemIds],
    },
    responseMatrix: {
      personIds: lsat7PersonIds(data.length),
      itemIds: [...table.itemIds],
      data,
    },
    options: {
      maxIterations: 200,
      convergenceTolerance: 0.0001,
      seed,
    },
  };
}

export function applyNamedCalibrationFixture(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  if (body.fixture === undefined || body.fixture === null || body.fixture === "") {
    return body;
  }
  if (body.fixture !== "lsat7") {
    const err = new Error(
      `Unknown calibration fixture '${body.fixture}'. Declared: ${CALIBRATION_NAMED_FIXTURES.join(", ")}`
    );
    err.code = "UNKNOWN_CALIBRATION_FIXTURE";
    throw err;
  }
  const fromFix = lsat7CalibrationRequest({ jobId: body.request?.jobId });
  return {
    ...body,
    request: {
      ...fromFix,
      ...(body.request || {}),
      model: { ...fromFix.model, ...(body.request?.model || {}) },
      responseMatrix: body.request?.responseMatrix || fromFix.responseMatrix,
      options: { ...fromFix.options, ...(body.request?.options || {}) },
    },
  };
}
