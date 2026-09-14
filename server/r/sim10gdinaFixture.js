// server/r/sim10gdinaFixture.js
// D66: published GDINA::sim10GDINA as an ADR 0002 diagnostic request.
// Node ships its own copy at server/r/fixtures/sim10gdina.json so the
// compose node image (Dockerfile.node copies only server/ + src/utils)
// can enqueue `{ fixture: "sim10gdina" }` without r-backend/ on disk.
// The R-side twin is r-backend/app/tests/fixtures/sim10gdina.json.
// Extracted from GDINA 2.9.12 data/sim10GDINA.rda (simdat, simQ,
// simItempar). Do not substitute the vignette Q-matrix — it is not simQ.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CALIBRATION_CONTRACT_VERSION } from "./calibrationContract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SIM10GDINA_TABLE_PATH = path.resolve(here, "fixtures/sim10gdina.json");

const SIM10GDINA_SEED = 20261120;

let cachedTable = null;

function loadSim10GdinaTable() {
  if (!cachedTable) {
    cachedTable = JSON.parse(fs.readFileSync(SIM10GDINA_TABLE_PATH, "utf8"));
  }
  return cachedTable;
}

function expandSim10GdinaResponses() {
  const table = loadSim10GdinaTable();
  const data = [];
  for (const pattern of table.patterns) {
    for (let i = 0; i < pattern.freq; i += 1) {
      data.push([...pattern.responses]);
    }
  }
  return data;
}

function sim10PersonIds(n) {
  return Array.from({ length: n }, (_, i) => `p${String(i + 1).padStart(4, "0")}`);
}

export function sim10gdinaCalibrationRequest({
  jobId = "job_sim10gdina",
  seed = SIM10GDINA_SEED,
  family = "gdina",
} = {}) {
  const table = loadSim10GdinaTable();
  const data = expandSim10GdinaResponses();
  const resolvedFamily = family === "dina" ? "dina" : "gdina";
  return {
    contractVersion: CALIBRATION_CONTRACT_VERSION,
    jobId,
    model: {
      family: resolvedFamily,
      itemIds: [...table.itemIds],
    },
    responseMatrix: {
      personIds: sim10PersonIds(data.length),
      itemIds: [...table.itemIds],
      data,
    },
    qMatrix: {
      attributeIds: [...table.attributeIds],
      itemIds: [...table.itemIds],
      data: table.qMatrix.map((row) => [...row]),
    },
    options: {
      maxIterations: 2000,
      convergenceTolerance: 0.0001,
      seed,
    },
  };
}
