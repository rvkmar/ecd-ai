// server/r/__tests__/sim10gdinaPipeline.test.js
// D66: sim10GDINA through enqueue → process → (succeeded + converged) → ingest.
//
// Two layers, on purpose:
//   1. Always-run contract path — the published matrix and Q are real; the
//      R response is a labeled contract stub. Proves the node pipeline
//      without inventing GDINA estimates.
//   2. Live path when R_BACKEND_URL is set — worker posts the same
//      matrix to R /calibrate/dina. Asserts a real GDINA run converged
//      and a parameter set was written with calibrationJobId.
//
// Existing CI `npm test` covers (1). The live job starts
// rvkmar/r-backend:latest (same image as compose) and covers (2).

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";
import { processJobById } from "../calibrationWorker.js";
import { postCalibration, getRHealth } from "../rClient.js";
import { applyNamedCalibrationFixture } from "../calibrationFixtures.js";
import { validateCalibrationRequest, CALIBRATION_CONTRACT_VERSION } from "../calibrationContract.js";

const tokenFor = (role) =>
  jwt.sign({ username: `${role}1`, role }, JWT_SECRET, { expiresIn: "1h" });

const here = path.dirname(fileURLToPath(import.meta.url));
const NODE_TABLE_PATH = path.resolve(here, "../fixtures/sim10gdina.json");
const R_TABLE_PATH = path.resolve(
  here,
  "../../../r-backend/app/tests/fixtures/sim10gdina.json"
);
const SAMPLE_PATH = path.resolve(
  here,
  "../../../samples/sample-calibration-job-gdina-sim10gdina.json"
);

const dbState = { current: {} };
vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: () => dbState.current,
  saveDB: (next) => {
    dbState.current = next;
  },
}));

async function jobsApp() {
  const { default: router } = await import("../../routes/calibrationJobsRoutes.js");
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/api/calibrationJobs", router);
  return app;
}

function seedDb() {
  dbState.current = {
    calibrationJobs: [],
    questions: [{ id: "q1", metadata: {} }],
    evidenceModels: [
      {
        id: "em-gdina",
        competencyId: "c1",
        statisticalModels: [
          { id: "sm-gdina", type: "gdina", active: true, parameterSets: [] },
          { id: "sm-dina", type: "dina", active: true, parameterSets: [] },
        ],
      },
    ],
    competencies: [{ id: "c1", modelId: "cm1", variableType: "binary" }],
  };
}

function table() {
  return JSON.parse(fs.readFileSync(NODE_TABLE_PATH, "utf8"));
}

function itemCorrectCounts(data, itemIds) {
  const counts = {};
  itemIds.forEach((id, col) => {
    counts[id] = data.reduce((sum, row) => sum + Number(row[col] === 1), 0);
  });
  return counts;
}

function requiredCounts(qMatrix) {
  return qMatrix.map((row) => row.reduce((sum, cell) => sum + Number(cell), 0));
}

function gdinaContractStub(jobId, itemIds, qMatrix) {
  const parameters = {};
  requiredCounts(qMatrix).forEach((k, i) => {
    const n = 2 ** k;
    const probabilities = Array.from({ length: n }, (_, p) => (p === 0 ? 0.1 : p === n - 1 ? 0.9 : 0.5));
    parameters[itemIds[i]] = { probabilities };
  });
  return {
    contractVersion: CALIBRATION_CONTRACT_VERSION,
    jobId,
    converged: true,
    packageVersion: "contract-stub (not GDINA)",
    sampleSize: 1000,
    calibratedAt: "2026-09-14T00:00:00Z",
    parameters,
    diagnostics: {
      note: "D66 contract-path stub. Not a psychometric result. Live R owns sim10GDINA estimates.",
    },
  };
}

function dinaContractStub(jobId, itemIds) {
  const parameters = {};
  for (const id of itemIds) {
    parameters[id] = { slip: 0.1, guess: 0.2 };
  }
  return {
    contractVersion: CALIBRATION_CONTRACT_VERSION,
    jobId,
    converged: true,
    packageVersion: "contract-stub (not GDINA)",
    sampleSize: 1000,
    calibratedAt: "2026-09-14T00:00:00Z",
    parameters,
    diagnostics: {
      note: "D66 contract-path stub. Not a psychometric result. Live R owns DINA estimates.",
    },
  };
}

beforeEach(() => {
  seedDb();
});

describe("sim10GDINA fixture is the published GDINA::sim10GDINA matrix", () => {
  it("ships the table next to the Node module (no r-backend checkout)", () => {
    const loaderSrc = fs.readFileSync(path.resolve(here, "../sim10gdinaFixture.js"), "utf8");
    expect(loaderSrc).toMatch(
      /path\.resolve\(\s*here,\s*["']fixtures\/sim10gdina\.json["']\s*\)/
    );
    expect(loaderSrc).not.toMatch(/path\.resolve\([^)]*r-backend/);
    expect(fs.existsSync(NODE_TABLE_PATH)).toBe(true);
    expect(NODE_TABLE_PATH.replace(/\\/g, "/")).toMatch(
      /\/server\/r\/fixtures\/sim10gdina\.json$/
    );
    expect(() => applyNamedCalibrationFixture({ fixture: "sim10gdina" })).not.toThrow();
  });

  it.skipIf(!fs.existsSync(R_TABLE_PATH))(
    "does not drift from the R-side published table when both files exist",
    () => {
      const nodeTable = JSON.parse(fs.readFileSync(NODE_TABLE_PATH, "utf8"));
      const rTable = JSON.parse(fs.readFileSync(R_TABLE_PATH, "utf8"));
      expect(nodeTable).toEqual(rTable);
    }
  );

  it("expands to 1000 persons × 10 items with the published simQ and counts", () => {
    const t = table();
    const expanded = applyNamedCalibrationFixture({ fixture: "sim10gdina" });
    const data = expanded.request.responseMatrix.data;
    const freqSum = t.patterns.reduce((sum, p) => sum + p.freq, 0);

    expect(t.itemIds).toEqual([
      "Item.1",
      "Item.2",
      "Item.3",
      "Item.4",
      "Item.5",
      "Item.6",
      "Item.7",
      "Item.8",
      "Item.9",
      "Item.10",
    ]);
    expect(t.attributeIds).toEqual(["A1", "A2", "A3"]);
    expect(t.qMatrix).toEqual(t.source.publishedQ);
    expect(t.qMatrix).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 1],
      [0, 1, 1],
      [1, 1, 0],
      [1, 0, 1],
      [1, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
    ]);
    expect(freqSum).toBe(1000);
    expect(data).toHaveLength(1000);
    expect(data.every((row) => row.length === 10)).toBe(true);
    expect(itemCorrectCounts(data, t.itemIds)).toEqual(t.source.publishedItemCorrectCounts);
    expect(
      Object.values(t.source.publishedItemCorrectCounts).reduce((a, b) => a + b, 0) / 1000
    ).toBeCloseTo(t.source.publishedMeanTotalScore, 3);
    // Generating parameters are documented, not used as the calibration result.
    expect(t.source.publishedItemParameters["Item.1"]).toEqual([0.2, 0.9]);
    expect(t.source.publishedItemParameters["Item.10"]).toHaveLength(8);
  });

  it("builds an ADR 0002 G-DINA request the contract accepts", () => {
    const body = applyNamedCalibrationFixture({ fixture: "sim10gdina" }).request;
    expect(validateCalibrationRequest(body)).toEqual([]);
    expect(body.model.family).toBe("gdina");
    expect(body.responseMatrix.personIds).toHaveLength(1000);
    expect(body.qMatrix.attributeIds).toEqual(["A1", "A2", "A3"]);
    expect(body.options.seed).toBe(20261120);
  });

  it("refuses a diagnostic request that omits qMatrix", () => {
    const body = applyNamedCalibrationFixture({ fixture: "sim10gdina" }).request;
    delete body.qMatrix;
    expect(validateCalibrationRequest(body).join(" ")).toMatch(/qMatrix is required/);
  });

  it("keeps the committed sample job body as the named-fixture enqueue", () => {
    const sample = JSON.parse(fs.readFileSync(SAMPLE_PATH, "utf8"));
    expect(sample.kind).toBe("dina-parameters");
    expect(sample.fixture).toBe("sim10gdina");
    expect(sample.request).toBeUndefined();
  });
});

describe("sim10GDINA contract-path pipeline (always runs)", () => {
  it("enqueues via fixture: sim10gdina, processes G-DINA, succeeds, and ingests calibrationJobId", async () => {
    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "dina-parameters",
        fixture: "sim10gdina",
        evidenceModelId: "em-gdina",
        statisticalModelId: "sm-gdina",
      });

    expect(enqueue.status).toBe(201);
    expect(enqueue.body.status).toBe("queued");
    expect(enqueue.body.kind).toBe("dina-parameters");
    expect(enqueue.body.request.model.family).toBe("gdina");
    expect(enqueue.body.request.responseMatrix.data).toHaveLength(1000);
    expect(enqueue.body.request.qMatrix.data).toHaveLength(10);

    const jobId = enqueue.body.id;
    const stub = gdinaContractStub(
      jobId,
      enqueue.body.request.model.itemIds,
      enqueue.body.request.qMatrix.data
    );
    const processed = await processJobById(jobId, {
      client: { postCalibration: async () => ({ ok: true, status: 200, json: stub, text: "" }) },
    });

    expect(processed.ok).toBe(true);
    expect(processed.job.status).toBe("succeeded");
    expect(processed.job.response.converged).toBe(true);
    expect(processed.job.response.packageVersion).toMatch(/contract-stub/);
    expect(processed.job.response.sampleSize).toBe(1000);

    const ingested = await request(app)
      .post(`/api/calibrationJobs/${jobId}/ingest`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);

    expect(ingested.status).toBe(200);
    const ps = ingested.body.parameterSet;
    expect(ps.calibrationJobId).toBe(jobId);
    expect(ps.converged).toBe(true);
    expect(ps.sampleSize).toBe(1000);
    expect(ps.calibrationKind).toBe("dina-parameters");
    expect(Object.keys(ps.parameters)).toEqual(enqueue.body.request.model.itemIds);
    expect(ps.parameters["Item.10"].probabilities).toHaveLength(8);

    const stored = dbState.current.evidenceModels[0].statisticalModels[0].parameterSets;
    expect(stored).toHaveLength(1);
    expect(stored[0].calibrationJobId).toBe(jobId);
    expect(dbState.current.calibrationJobs[0].ingestedParameterSetId).toBe(ps.parameterSetId);
    expect(dbState.current.questions[0].metadata).toEqual({});
  });

  it("binds a dina statistical model to family dina and ingests slip/guess", async () => {
    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "dina-parameters",
        fixture: "sim10gdina",
        evidenceModelId: "em-gdina",
        statisticalModelId: "sm-dina",
      });

    expect(enqueue.status).toBe(201);
    expect(enqueue.body.request.model.family).toBe("dina");
    expect(enqueue.body.request.qMatrix.data).toHaveLength(10);

    const jobId = enqueue.body.id;
    const stub = dinaContractStub(jobId, enqueue.body.request.model.itemIds);
    const processed = await processJobById(jobId, {
      client: { postCalibration: async () => ({ ok: true, status: 200, json: stub, text: "" }) },
    });
    expect(processed.ok).toBe(true);

    const ingested = await request(app)
      .post(`/api/calibrationJobs/${jobId}/ingest`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(ingested.status).toBe(200);
    expect(ingested.body.parameterSet.parameters["Item.1"]).toEqual({ slip: 0.1, guess: 0.2 });
    expect(dbState.current.evidenceModels[0].statisticalModels[1].parameterSets).toHaveLength(1);
  });
});

const live = Boolean(process.env.R_BACKEND_URL);

describe.skipIf(!live)("sim10GDINA live R pipeline", () => {
  it("health reports GDINA, then enqueue → process → ingest a converged G-DINA run", async () => {
    const health = await getRHealth({ timeoutMs: 15_000 });
    expect(health.ok, health.text || health.error?.message).toBe(true);
    expect(health.json?.status).toBe("healthy");
    expect(health.json?.packages?.GDINA).toBeTruthy();

    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "dina-parameters",
        fixture: "sim10gdina",
        evidenceModelId: "em-gdina",
        statisticalModelId: "sm-gdina",
      });
    expect(enqueue.status).toBe(201);

    const jobId = enqueue.body.id;
    const processed = await processJobById(jobId, {
      client: { postCalibration },
    });

    const liveDump = JSON.stringify(
      {
        ok: processed.ok,
        status: processed.job?.status,
        error: processed.job?.error || processed.error,
        responseError: processed.job?.response?.error,
        converged: processed.job?.response?.converged,
        packageVersion: processed.job?.response?.packageVersion,
        sampleSize: processed.job?.response?.sampleSize,
        parameterKeys: Object.keys(processed.job?.response?.parameters || {}),
        diagnostics: processed.job?.response?.diagnostics,
      },
      null,
      2
    );
    // eslint-disable-next-line no-console
    console.log("sim10GDINA live G-DINA process", liveDump);

    expect(processed.ok, liveDump).toBe(true);
    const job = processed.job;
    expect(job.status, liveDump).toBe("succeeded");
    expect(job.response.converged, liveDump).toBe(true);
    expect(job.response.packageVersion).toMatch(/^GDINA /);
    expect(job.response.sampleSize).toBe(1000);
    expect(job.response.jobId).toBe(jobId);

    const itemIds = enqueue.body.request.model.itemIds;
    const qRows = enqueue.body.request.qMatrix.data;
    const ks = requiredCounts(qRows);
    for (let i = 0; i < itemIds.length; i += 1) {
      const id = itemIds[i];
      const par = job.response.parameters[id];
      expect(par, `missing parameters for ${id}`).toBeTruthy();
      expect(Array.isArray(par.probabilities), `${id} probabilities`).toBe(true);
      expect(par.probabilities).toHaveLength(2 ** ks[i]);
      expect(par.probabilities.every((p) => Number.isFinite(p) && p >= 0 && p <= 1)).toBe(true);
      // Generating simItempar has P(all mastered) > P(none) on every item.
      expect(par.probabilities[par.probabilities.length - 1]).toBeGreaterThan(par.probabilities[0]);
    }
    expect(ks).toEqual([1, 1, 1, 2, 2, 2, 2, 2, 2, 3]);

    const ingested = await request(app)
      .post(`/api/calibrationJobs/${jobId}/ingest`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(ingested.status).toBe(200);
    expect(ingested.body.parameterSet.calibrationJobId).toBe(jobId);
    expect(ingested.body.parameterSet.packageVersion).toMatch(/^GDINA /);
    expect(dbState.current.evidenceModels[0].statisticalModels[0].parameterSets).toHaveLength(1);
  }, 180_000);

  it("calibrates DINA on the same published matrix and ingests slip/guess", async () => {
    const health = await getRHealth({ timeoutMs: 15_000 });
    expect(health.ok, health.text || health.error?.message).toBe(true);

    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "dina-parameters",
        fixture: "sim10gdina",
        evidenceModelId: "em-gdina",
        statisticalModelId: "sm-dina",
      });
    expect(enqueue.status).toBe(201);
    expect(enqueue.body.request.model.family).toBe("dina");

    const jobId = enqueue.body.id;
    const processed = await processJobById(jobId, {
      client: { postCalibration },
    });
    const liveDump = JSON.stringify(
      {
        ok: processed.ok,
        status: processed.job?.status,
        error: processed.job?.error || processed.error,
        converged: processed.job?.response?.converged,
        packageVersion: processed.job?.response?.packageVersion,
        sampleSize: processed.job?.response?.sampleSize,
        parameterKeys: Object.keys(processed.job?.response?.parameters || {}),
      },
      null,
      2
    );
    // eslint-disable-next-line no-console
    console.log("sim10GDINA live DINA process", liveDump);

    expect(processed.ok, liveDump).toBe(true);
    const job = processed.job;
    expect(job.status, liveDump).toBe("succeeded");
    expect(job.response.converged, liveDump).toBe(true);
    expect(job.response.packageVersion).toMatch(/^GDINA /);
    expect(job.response.sampleSize).toBe(1000);

    for (const id of enqueue.body.request.model.itemIds) {
      const par = job.response.parameters[id];
      expect(par, `missing DINA parameters for ${id}`).toBeTruthy();
      expect(par.guess).toBeGreaterThanOrEqual(0);
      expect(par.guess).toBeLessThan(1);
      expect(par.slip).toBeGreaterThanOrEqual(0);
      expect(par.slip).toBeLessThan(1);
      expect(par.guess).toBeLessThan(1 - par.slip);
    }

    const ingested = await request(app)
      .post(`/api/calibrationJobs/${jobId}/ingest`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(ingested.status).toBe(200);
    expect(ingested.body.parameterSet.parameters["Item.1"].slip).toBeDefined();
    expect(dbState.current.evidenceModels[0].statisticalModels[1].parameterSets).toHaveLength(1);
  }, 180_000);
});
