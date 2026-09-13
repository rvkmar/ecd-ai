// server/r/lsat7Fixture.js
// D64: published LSAT7 response matrix as an ADR 0002 calibration request.
// Source of truth is r-backend/app/tests/fixtures/lsat7-frequency-table.json
// (Bock & Lieberman 1970 / mirt::LSAT7 via expand.table).
//
// mirt::LSAT7 is LSAT *section* 7: 1000 examinees × 5 items. The 7 is not
// the item count. This loader expands the 32-pattern frequency table into
// the 1000-row dichotomous matrix the job queue sends to R.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CALIBRATION_CONTRACT_VERSION } from "./calibrationContract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const LSAT7_FREQUENCY_TABLE_PATH = path.resolve(
  here,
  "../../r-backend/app/tests/fixtures/lsat7-frequency-table.json"
);

export const LSAT7_SEED = 20261120;

let cachedTable = null;

export function loadLsat7FrequencyTable() {
  if (!cachedTable) {
    cachedTable = JSON.parse(fs.readFileSync(LSAT7_FREQUENCY_TABLE_PATH, "utf8"));
  }
  return cachedTable;
}

export function expandLsat7Responses() {
  const table = loadLsat7FrequencyTable();
  const data = [];
  for (const pattern of table.patterns) {
    for (let i = 0; i < pattern.freq; i += 1) {
      data.push([...pattern.responses]);
    }
  }
  return data;
}

export function lsat7PersonIds(n) {
  return Array.from({ length: n }, (_, i) => `p${String(i + 1).padStart(4, "0")}`);
}

export function lsat7ItemCorrectCounts(data) {
  const table = loadLsat7FrequencyTable();
  const counts = {};
  table.itemIds.forEach((id, col) => {
    counts[id] = data.reduce((sum, row) => sum + Number(row[col] === 1), 0);
  });
  return counts;
}

export function lsat7CalibrationRequest({ jobId = "job_lsat7", seed = LSAT7_SEED } = {}) {
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

export function lsat7JobEnqueueBody({
  evidenceModelId = "REPLACE_WITH_EVIDENCE_MODEL_ID",
  statisticalModelId = "REPLACE_WITH_STATISTICAL_MODEL_ID",
  jobId = "job_lsat7",
} = {}) {
  return {
    kind: "irt-parameters",
    evidenceModelId,
    statisticalModelId,
    request: lsat7CalibrationRequest({ jobId }),
  };
}

// Contract-path stub only. Package version is deliberately not "mirt …"
// so a wiring test cannot be mistaken for a psychometric result.
export function lsat7ContractStubResponse(jobId, itemIds) {
  const parameters = {};
  for (const id of itemIds) {
    parameters[id] = { a: 1, b: 0, c: 0 };
  }
  return {
    contractVersion: CALIBRATION_CONTRACT_VERSION,
    jobId,
    converged: true,
    packageVersion: "contract-stub (not mirt)",
    sampleSize: 1000,
    calibratedAt: "2026-09-13T00:00:00Z",
    parameters,
    diagnostics: {
      note: "D64 contract-path stub. Not a psychometric result. Live R owns LSAT7 estimates.",
    },
  };
}
