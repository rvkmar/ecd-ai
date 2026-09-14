// server/r/__tests__/cttPipeline.test.js
// D67: LSAT7 through CTT enqueue → process → (succeeded + converged) → ingest.
//
// Two layers, on purpose:
//   1. Always-run contract path — the published matrix is real; the R
//      response is a labeled contract stub. Proves the node pipeline
//      without inventing TAM estimates.
//   2. Live path when R_BACKEND_URL is set — worker posts the same
//      matrix to R /calibrate/ctt. Asserts a real TAM::tam.ctt run
//      identified the statistics and a parameter set was written with
//      calibrationJobId.
//
// Existing CI `npm test` covers (1). The `lsat7-pipeline` job starts
// rvkmar/r-backend:latest (same image as compose) and covers (2).
//
// Fixture is the published Bock & Lieberman (1970) LSAT section-7
// matrix already shipped for D64 IRT. CTT difficulty is that published
// item mean. There is no published KR-20 / point-biserial table for
// this matrix in this pipeline — those live checks are structural, not
// coefficient pins (same honesty as D64/D66).

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
const NODE_TABLE_PATH = path.resolve(here, "../fixtures/lsat7-frequency-table.json");
const SAMPLE_PATH = path.resolve(
  here,
  "../../../samples/sample-calibration-job-ctt-lsat7.json"
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
        id: "em-ctt",
        competencyId: "c1",
        statisticalModels: [{ id: "sm-ctt", type: "ctt", active: true, parameterSets: [] }],
      },
    ],
    competencies: [{ id: "c1", modelId: "cm1", variableType: "continuous" }],
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

function cttContractStub(jobId, itemIds, publishedMeans) {
  const parameters = {};
  for (const id of itemIds) {
    parameters[id] = {
      difficulty: publishedMeans[id],
      discrimination: 0.4,
      n: 1000,
    };
  }
  return {
    contractVersion: CALIBRATION_CONTRACT_VERSION,
    jobId,
    converged: true,
    packageVersion: "contract-stub (not TAM)",
    sampleSize: 1000,
    calibratedAt: "2026-09-14T00:00:00Z",
    parameters,
    fitStatistics: {
      kr20: 0.5,
      meanScore: 3.707,
      sdScore: 1.0,
      nItems: 5,
      nPersons: 1000,
    },
    diagnostics: {
      note: "D67 contract-path stub. Not a psychometric result. Live R owns LSAT7 CTT estimates.",
    },
  };
}

beforeEach(() => {
  seedDb();
});

describe("lsat7-ctt fixture is the published LSAT7 matrix under family ctt", () => {
  it("reuses the Node LSAT7 frequency table (no invented matrix, no r-backend checkout)", () => {
    const loaderSrc = fs.readFileSync(path.resolve(here, "../lsat7Fixture.js"), "utf8");
    const dispatcherSrc = fs.readFileSync(
      path.resolve(here, "../calibrationFixtures.js"),
      "utf8"
    );
    expect(loaderSrc).toMatch(
      /path\.resolve\(\s*here,\s*["']fixtures\/lsat7-frequency-table\.json["']\s*\)/
    );
    expect(loaderSrc).not.toMatch(/path\.resolve\([^)]*r-backend/);
    expect(dispatcherSrc).toMatch(/lsat7-ctt/);
    expect(dispatcherSrc).not.toMatch(/path\.resolve\([^)]*r-backend/);
    expect(fs.existsSync(NODE_TABLE_PATH)).toBe(true);
    expect(() => applyNamedCalibrationFixture({ fixture: "lsat7-ctt" })).not.toThrow();
  });

  it("expands to 1000 persons × 5 items with Bock & Lieberman counts", () => {
    const t = table();
    const expanded = applyNamedCalibrationFixture({ fixture: "lsat7-ctt" });
    const data = expanded.request.responseMatrix.data;
    const freqSum = t.patterns.reduce((sum, p) => sum + p.freq, 0);

    expect(t.itemIds).toEqual(["Item.1", "Item.2", "Item.3", "Item.4", "Item.5"]);
    expect(freqSum).toBe(1000);
    expect(data).toHaveLength(1000);
    expect(data.every((row) => row.length === 5)).toBe(true);
    expect(itemCorrectCounts(data, t.itemIds)).toEqual(t.source.publishedItemCorrectCounts);
    expect(
      Object.values(t.source.publishedItemCorrectCounts).reduce((a, b) => a + b, 0) / 1000
    ).toBeCloseTo(t.source.publishedMeanTotalScore, 3);
  });

  it("builds an ADR 0002 CTT request the contract accepts", () => {
    const body = applyNamedCalibrationFixture({ fixture: "lsat7-ctt" }).request;
    expect(validateCalibrationRequest(body)).toEqual([]);
    expect(body.model.family).toBe("ctt");
    expect(body.model.subtype).toBeUndefined();
    expect(body.responseMatrix.personIds).toHaveLength(1000);
    expect(body.qMatrix).toBeUndefined();
    expect(body.options.seed).toBe(20261120);
  });

  it("does not change the IRT lsat7 fixture family", () => {
    const irt = applyNamedCalibrationFixture({ fixture: "lsat7" }).request;
    expect(irt.model.family).toBe("irt");
    expect(irt.model.subtype).toBe("2PL");
  });

  it("refuses lsat7-ctt bound to an IRT statistical model", async () => {
    dbState.current.evidenceModels[0].statisticalModels.push({
      id: "sm-irt",
      type: "irt",
      active: true,
      parameterSets: [],
    });
    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "ctt-statistics",
        fixture: "lsat7-ctt",
        evidenceModelId: "em-ctt",
        statisticalModelId: "sm-irt",
      });
    expect(enqueue.status).toBe(400);
    expect(JSON.stringify(enqueue.body)).toMatch(/does not apply to statistical model type/);
  });
});

describe("LSAT7 CTT contract-path pipeline (always runs)", () => {
  it("enqueues via fixture: lsat7-ctt, processes, succeeds, and ingests calibrationJobId", async () => {
    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "ctt-statistics",
        fixture: "lsat7-ctt",
        evidenceModelId: "em-ctt",
        statisticalModelId: "sm-ctt",
      });

    expect(enqueue.status).toBe(201);
    expect(enqueue.body.status).toBe("queued");
    expect(enqueue.body.kind).toBe("ctt-statistics");
    expect(enqueue.body.request.model.family).toBe("ctt");
    expect(enqueue.body.request.responseMatrix.data).toHaveLength(1000);

    const jobId = enqueue.body.id;
    const stub = cttContractStub(
      jobId,
      enqueue.body.request.model.itemIds,
      table().source.publishedItemMeans
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
    expect(ps.calibrationKind).toBe("ctt-statistics");
    expect(Object.keys(ps.parameters)).toEqual(enqueue.body.request.model.itemIds);
    expect(ps.parameters["Item.4"].difficulty).toBe(0.606);
    expect(ps.parameters["Item.5"].difficulty).toBe(0.843);
    expect(ps.fitStatistics.kr20).toBe(0.5);

    const stored = dbState.current.evidenceModels[0].statisticalModels[0].parameterSets;
    expect(stored).toHaveLength(1);
    expect(stored[0].calibrationJobId).toBe(jobId);
    expect(dbState.current.calibrationJobs[0].ingestedParameterSetId).toBe(ps.parameterSetId);
    expect(dbState.current.questions[0].metadata).toEqual({});
  });

  it("refuses ingest when CTT converged is false", async () => {
    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "ctt-statistics",
        fixture: "lsat7-ctt",
        evidenceModelId: "em-ctt",
        statisticalModelId: "sm-ctt",
      });
    expect(enqueue.status).toBe(201);

    const jobId = enqueue.body.id;
    const stub = {
      contractVersion: CALIBRATION_CONTRACT_VERSION,
      jobId,
      converged: false,
      error: {
        message: "CTT statistics were not identified",
        rClass: "NotConverged",
        stderr: "",
      },
    };
    const processed = await processJobById(jobId, {
      client: { postCalibration: async () => ({ ok: true, status: 200, json: stub, text: "" }) },
    });
    expect(processed.ok).toBe(true);
    expect(processed.job.status).toBe("succeeded");
    expect(processed.job.response.converged).toBe(false);

    const ingested = await request(app)
      .post(`/api/calibrationJobs/${jobId}/ingest`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(ingested.status).toBe(409);
    expect(ingested.body.error).toMatch(/converged: false/);
    expect(dbState.current.evidenceModels[0].statisticalModels[0].parameterSets).toHaveLength(0);
  });
});

const live = Boolean(process.env.R_BACKEND_URL);

describe.skipIf(!live)("LSAT7 CTT live R pipeline", () => {
  it("health reports TAM, then enqueue → process → ingest identified CTT statistics", async () => {
    const health = await getRHealth({ timeoutMs: 15_000 });
    expect(health.ok, health.text || health.error?.message).toBe(true);
    expect(health.json?.status).toBe("healthy");
    expect(health.json?.packages?.TAM).toBeTruthy();

    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "ctt-statistics",
        fixture: "lsat7-ctt",
        evidenceModelId: "em-ctt",
        statisticalModelId: "sm-ctt",
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
        fitStatistics: processed.job?.response?.fitStatistics,
        diagnostics: processed.job?.response?.diagnostics,
      },
      null,
      2
    );
    // eslint-disable-next-line no-console
    console.log("LSAT7 CTT live process", liveDump);

    expect(processed.ok, liveDump).toBe(true);
    const job = processed.job;
    expect(job.status, liveDump).toBe("succeeded");
    expect(job.response.converged, liveDump).toBe(true);
    expect(job.response.packageVersion).toMatch(/^TAM /);
    expect(job.response.sampleSize).toBe(1000);
    expect(job.response.jobId).toBe(jobId);

    const publishedMeans = table().source.publishedItemMeans;
    const itemIds = enqueue.body.request.model.itemIds;
    for (const id of itemIds) {
      const par = job.response.parameters[id];
      expect(par, `missing CTT parameters for ${id}`).toBeTruthy();
      expect(par.n).toBe(1000);
      // CTT difficulty for a complete dichotomous item IS the published
      // proportion correct. That identity is not an invented coefficient pin.
      expect(par.difficulty).toBeCloseTo(publishedMeans[id], 6);
      expect(Number.isFinite(par.discrimination)).toBe(true);
      expect(par.discrimination).toBeGreaterThan(-1);
      expect(par.discrimination).toBeLessThan(1);
      // LSAT section 7 is an aptitude test: item-total rpb of the keyed
      // category is positive. Not a published table.
      expect(par.discrimination).toBeGreaterThan(0);
    }
    // Same ordering D64 uses for IRT b: Item.5 easiest (p=0.843), Item.4
    // hardest (p=0.606). CTT difficulty is p, so Item.5 > Item.4.
    expect(job.response.parameters["Item.5"].difficulty).toBeGreaterThan(
      job.response.parameters["Item.4"].difficulty
    );

    const fit = job.response.fitStatistics;
    expect(fit).toBeTruthy();
    expect(Number.isFinite(fit.kr20)).toBe(true);
    expect(fit.kr20).toBeGreaterThan(0);
    expect(fit.kr20).toBeLessThan(1);
    expect(fit.nPersons).toBe(1000);
    expect(fit.nItems).toBe(5);
    expect(fit.meanScore).toBeCloseTo(table().source.publishedMeanTotalScore, 3);
    // No published KR-20 table for LSAT7 is in this pipeline. Do not pin one.

    const ingested = await request(app)
      .post(`/api/calibrationJobs/${jobId}/ingest`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(ingested.status).toBe(200);
    expect(ingested.body.parameterSet.calibrationJobId).toBe(jobId);
    expect(ingested.body.parameterSet.packageVersion).toMatch(/^TAM /);
    expect(ingested.body.parameterSet.calibrationKind).toBe("ctt-statistics");
    expect(dbState.current.evidenceModels[0].statisticalModels[0].parameterSets).toHaveLength(1);
  }, 180_000);
});
