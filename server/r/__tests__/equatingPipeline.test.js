// server/r/__tests__/equatingPipeline.test.js
// D70: known-equating enqueue → process → artefact ingest.
//
// Two layers:
//   1. Always-run contract path — the seeded matrix is real; the R
//      response is a labeled contract stub. Proves the node pipeline
//      without inventing Mean/Sigma constants.
//   2. Live path when R_BACKEND_URL is set — worker posts the same
//      matrix to R /calibrate/equating. Asserts mirt Rasch Mean/Sigma
//      recovers slope 1 and intercept -0.5 within stated tolerances.
//
// Existing CI `npm test` covers (1). The `lsat7-pipeline` job starts
// rvkmar/r-backend:latest (same image as compose) and covers (2).
//
// The fixture is generated (seed 20261202). It is not a published table.

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

const KNOWN_SLOPE = 1;
const KNOWN_INTERCEPT = -0.5;
const SLOPE_TOLERANCE = 0.2;
const INTERCEPT_TOLERANCE = 0.3;
const KNOWN_SEED = 20261202;

const tokenFor = (role) =>
  jwt.sign({ username: `${role}1`, role }, JWT_SECRET, { expiresIn: "1h" });

const here = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = path.resolve(here, "../../../samples/sample-calibration-job-equating.json");

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
        id: "em-irt",
        competencyId: "c1",
        statisticalModels: [{ id: "sm-irt", type: "irt", active: true, parameterSets: [] }],
      },
    ],
    competencies: [{ id: "c1", modelId: "cm1", variableType: "continuous" }],
  };
}

function equatingContractStub(jobId) {
  return {
    contractVersion: CALIBRATION_CONTRACT_VERSION,
    jobId,
    converged: true,
    packageVersion: "contract-stub (not mirt)",
    sampleSize: 800,
    calibratedAt: "2026-09-14T00:00:00Z",
    parameters: {
      slope: KNOWN_SLOPE,
      intercept: KNOWN_INTERCEPT,
      method: "Mean/Sigma",
      from: "Y",
      to: "X",
    },
    fitStatistics: {
      nItems: 14,
      nPersons: 800,
      nFormX: 400,
      nFormY: 400,
      nCommon: 6,
    },
    diagnostics: {
      note: "D70 contract-path stub. Not a psychometric result. Live R owns the Mean/Sigma constants.",
      method: "Mean/Sigma",
      commonItemIds: ["C.1", "C.2", "C.3", "C.4", "C.5", "C.6"],
    },
  };
}

beforeEach(() => {
  seedDb();
});

describe("known-equating fixture is a seeded NEAT common-item design", () => {
  it("is generated in Node (no invented constants, no r-backend checkout)", () => {
    const loaderSrc = fs.readFileSync(path.resolve(here, "../knownEquatingFixture.js"), "utf8");
    const dispatcherSrc = fs.readFileSync(path.resolve(here, "../calibrationFixtures.js"), "utf8");
    expect(loaderSrc).toMatch(/KNOWN_EQUATING_SEED = 20261202/);
    expect(loaderSrc).toMatch(/KNOWN_EQUATING_SHIFT = 0\.5/);
    expect(dispatcherSrc).toMatch(/known-equating/);
    expect(dispatcherSrc).not.toMatch(/path\.resolve\([^)]*r-backend/);
    expect(() => applyNamedCalibrationFixture({ fixture: "known-equating" })).not.toThrow();
  });

  it("is 800 persons × 14 items with two forms, six common items, and Form Y missing X uniques", () => {
    const body = applyNamedCalibrationFixture({ fixture: "known-equating" }).request;
    expect(body.model.itemIds).toHaveLength(14);
    expect(body.responseMatrix.data).toHaveLength(800);
    expect(body.forms.labels.filter((g) => g === "X")).toHaveLength(400);
    expect(body.forms.labels.filter((g) => g === "Y")).toHaveLength(400);
    expect(body.forms.commonItemIds).toEqual(["C.1", "C.2", "C.3", "C.4", "C.5", "C.6"]);

    const xCol = body.model.itemIds.indexOf("X.1");
    const yCol = body.model.itemIds.indexOf("Y.1");
    const cCol = body.model.itemIds.indexOf("C.1");
    const xRows = body.responseMatrix.data.filter((_, i) => body.forms.labels[i] === "X");
    const yRows = body.responseMatrix.data.filter((_, i) => body.forms.labels[i] === "Y");
    expect(xRows.every((row) => row[yCol] === null)).toBe(true);
    expect(yRows.every((row) => row[xCol] === null)).toBe(true);
    expect(xRows.every((row) => row[cCol] === 0 || row[cCol] === 1)).toBe(true);
    expect(yRows.every((row) => row[cCol] === 0 || row[cCol] === 1)).toBe(true);
  });

  it("builds an ADR 0002 equating request the contract accepts", () => {
    const body = applyNamedCalibrationFixture({ fixture: "known-equating" }).request;
    expect(validateCalibrationRequest(body)).toEqual([]);
    expect(body.model.family).toBe("equating");
    expect(body.forms.formX).toBe("X");
    expect(body.forms.formY).toBe("Y");
    expect(body.options.seed).toBe(KNOWN_SEED);
  });

  it("keeps the committed sample job body in lockstep with the fixture name", () => {
    const sample = JSON.parse(fs.readFileSync(SAMPLE_PATH, "utf8"));
    expect(sample.fixture).toBe("known-equating");
    expect(sample.kind).toBe("equating");
  });

  it("refuses known-equating bound to a CTT statistical model", async () => {
    dbState.current.evidenceModels[0].statisticalModels.push({
      id: "sm-ctt",
      type: "ctt",
      active: true,
      parameterSets: [],
    });
    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "equating",
        fixture: "known-equating",
        evidenceModelId: "em-irt",
        statisticalModelId: "sm-ctt",
      });
    expect(enqueue.status).toBe(400);
    expect(JSON.stringify(enqueue.body)).toMatch(/does not apply to statistical model type/);
  });
});

describe("known equating contract-path pipeline (always runs)", () => {
  it("enqueues via fixture: known-equating, processes, succeeds, and ingests an analysis artefact", async () => {
    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "equating",
        fixture: "known-equating",
        evidenceModelId: "em-irt",
        statisticalModelId: "sm-irt",
      });

    expect(enqueue.status).toBe(201);
    expect(enqueue.body.status).toBe("queued");
    expect(enqueue.body.kind).toBe("equating");
    expect(enqueue.body.request.model.family).toBe("equating");
    expect(enqueue.body.request.responseMatrix.data).toHaveLength(800);

    const jobId = enqueue.body.id;
    const stub = equatingContractStub(jobId);
    const processed = await processJobById(jobId, {
      client: { postCalibration: async () => ({ ok: true, status: 200, json: stub, text: "" }) },
    });

    expect(processed.ok).toBe(true);
    expect(processed.job.status).toBe("succeeded");
    expect(processed.job.response.converged).toBe(true);
    expect(processed.job.response.packageVersion).toMatch(/contract-stub/);

    const ingested = await request(app)
      .post(`/api/calibrationJobs/${jobId}/ingest`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);

    expect(ingested.status).toBe(200);
    expect(ingested.body.parameterSet).toBeNull();
    const artefact = ingested.body.analysisArtefact;
    expect(artefact.calibrationJobId).toBe(jobId);
    expect(artefact.kind).toBe("equating");
    expect(artefact.parameters.slope).toBe(KNOWN_SLOPE);
    expect(artefact.parameters.intercept).toBe(KNOWN_INTERCEPT);
    expect(artefact.parameters.method).toBe("Mean/Sigma");

    expect(dbState.current.evidenceModels[0].analysisArtefacts).toHaveLength(1);
    expect(dbState.current.calibrationJobs[0].ingestedAnalysisArtefactId).toBe(
      artefact.analysisArtefactId
    );
    expect(dbState.current.evidenceModels[0].statisticalModels[0].parameterSets).toHaveLength(0);
  });

  it("refuses artefact ingest when equating converged is false", async () => {
    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "equating",
        fixture: "known-equating",
        evidenceModelId: "em-irt",
        statisticalModelId: "sm-irt",
      });
    expect(enqueue.status).toBe(201);

    const jobId = enqueue.body.id;
    const stub = {
      contractVersion: CALIBRATION_CONTRACT_VERSION,
      jobId,
      converged: false,
      error: {
        message: "mirt Rasch did not converge",
        rClass: "NotConverged",
        stderr: "",
      },
    };
    await processJobById(jobId, {
      client: { postCalibration: async () => ({ ok: true, status: 200, json: stub, text: "" }) },
    });

    const ingested = await request(app)
      .post(`/api/calibrationJobs/${jobId}/ingest`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(ingested.status).toBe(409);
    expect(ingested.body.error).toMatch(/converged: false/);
    expect(dbState.current.evidenceModels[0].analysisArtefacts || []).toHaveLength(0);
  });
});

const live = Boolean(process.env.R_BACKEND_URL);

describe.skipIf(!live)("known equating live R pipeline", () => {
  it("health reports mirt, then enqueue → process recovers the known shift, then artefact ingest", async () => {
    const health = await getRHealth({ timeoutMs: 15_000 });
    expect(health.ok, health.text || health.error?.message).toBe(true);
    expect(health.json?.status).toBe("healthy");
    expect(health.json?.packages?.mirt).toBeTruthy();

    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "equating",
        fixture: "known-equating",
        evidenceModelId: "em-irt",
        statisticalModelId: "sm-irt",
      });
    expect(enqueue.status).toBe(201);

    const jobId = enqueue.body.id;
    const processed = await processJobById(jobId, {
      client: { postCalibration },
    });

    const p = processed.job?.response?.parameters || {};
    const liveDump = JSON.stringify(
      {
        ok: processed.ok,
        status: processed.job?.status,
        error: processed.job?.error || processed.error,
        responseError: processed.job?.response?.error,
        converged: processed.job?.response?.converged,
        packageVersion: processed.job?.response?.packageVersion,
        sampleSize: processed.job?.response?.sampleSize,
        parameters: p,
        fitStatistics: processed.job?.response?.fitStatistics,
        diagnostics: processed.job?.response?.diagnostics,
      },
      null,
      2
    );
    // eslint-disable-next-line no-console
    console.log("known equating live process", liveDump);

    expect(processed.ok, liveDump).toBe(true);
    const job = processed.job;
    expect(job.status, liveDump).toBe("succeeded");
    expect(job.response.converged, liveDump).toBe(true);
    expect(job.response.packageVersion).toMatch(/^mirt /);
    expect(job.response.sampleSize).toBe(800);
    expect(job.response.jobId).toBe(jobId);
    expect(job.response.parameters.method).toBe("Mean/Sigma");
    expect(job.response.parameters.from).toBe("Y");
    expect(job.response.parameters.to).toBe("X");
    expect(Math.abs(job.response.parameters.slope - KNOWN_SLOPE)).toBeLessThan(
      SLOPE_TOLERANCE
    );
    expect(Math.abs(job.response.parameters.intercept - KNOWN_INTERCEPT)).toBeLessThan(
      INTERCEPT_TOLERANCE
    );

    const ingested = await request(app)
      .post(`/api/calibrationJobs/${jobId}/ingest`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(ingested.status).toBe(200);
    expect(ingested.body.parameterSet).toBeNull();
    expect(ingested.body.analysisArtefact.calibrationJobId).toBe(jobId);
    expect(ingested.body.analysisArtefact.packageVersion).toMatch(/^mirt /);
    expect(dbState.current.evidenceModels[0].analysisArtefacts).toHaveLength(1);
    expect(dbState.current.evidenceModels[0].statisticalModels[0].parameterSets).toHaveLength(0);
  }, 180_000);
});
