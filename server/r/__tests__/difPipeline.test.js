// server/r/__tests__/difPipeline.test.js
// D69: planted-DIF enqueue → process → (succeeded + converged) → artefact ingest.
//
// Two layers:
//   1. Always-run contract path — the seeded matrix is real; the R
//      response is a labeled contract stub. Proves the node pipeline
//      without inventing difR flags.
//   2. Live path when R_BACKEND_URL is set — worker posts the same
//      matrix to R /calibrate/dif. Asserts difR::difMH flags Item.5
//      and only Item.5.
//
// Existing CI `npm test` covers (1). The `lsat7-pipeline` job starts
// rvkmar/r-backend:latest (same image as compose) and covers (2).
//
// The fixture is generated (seed 20261201, documented in
// plantedDifFixture.js). It is not a published DIF table.

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
const SAMPLE_PATH = path.resolve(here, "../../../samples/sample-calibration-job-dif-planted.json");

const PLANTED_ITEM = "Item.5";
const PLANTED_SEED = 20261201;

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

function difContractStub(jobId, itemIds) {
  const parameters = {};
  for (const id of itemIds) {
    const planted = id === PLANTED_ITEM;
    parameters[id] = {
      statistic: planted ? 0.0001 : 0.4,
      pValue: planted ? 0.0001 : 0.4,
      alphaMH: planted ? 3 : 1,
      deltaMH: planted ? -2.4 : 0,
      etsClass: planted ? "C" : "A",
      flag: planted,
      method: "Mantel-Haenszel",
      pair: "focal vs reference",
    };
  }
  return {
    contractVersion: CALIBRATION_CONTRACT_VERSION,
    jobId,
    converged: true,
    packageVersion: "contract-stub (not difR)",
    sampleSize: 800,
    calibratedAt: "2026-09-14T00:00:00Z",
    parameters,
    fitStatistics: {
      nItems: itemIds.length,
      nPersons: 800,
      nReference: 400,
      nFocal: 400,
      nFlagged: 1,
      alpha: 0.05,
    },
    diagnostics: {
      note: "D69 contract-path stub. Not a psychometric result. Live R owns the Mantel-Haenszel flags.",
      flaggedItemIds: [PLANTED_ITEM],
      method: "difR::difMH",
    },
  };
}

beforeEach(() => {
  seedDb();
});

describe("planted-dif fixture is a seeded matrix with one planted item", () => {
  it("is generated in Node (no invented flags, no r-backend checkout)", () => {
    const loaderSrc = fs.readFileSync(path.resolve(here, "../plantedDifFixture.js"), "utf8");
    const dispatcherSrc = fs.readFileSync(path.resolve(here, "../calibrationFixtures.js"), "utf8");
    expect(loaderSrc).toMatch(/PLANTED_DIF_SEED = 20261201/);
    expect(loaderSrc).toMatch(/Item\.5/);
    expect(dispatcherSrc).toMatch(/planted-dif/);
    expect(dispatcherSrc).not.toMatch(/path\.resolve\([^)]*r-backend/);
    expect(() => applyNamedCalibrationFixture({ fixture: "planted-dif" })).not.toThrow();
  });

  it("is 800 persons × 8 items with equal groups and a harder Item.5 for the focal group", () => {
    const body = applyNamedCalibrationFixture({ fixture: "planted-dif" }).request;
    expect(body.model.itemIds).toHaveLength(8);
    expect(body.responseMatrix.data).toHaveLength(800);
    expect(body.groups.labels.filter((g) => g === "reference")).toHaveLength(400);
    expect(body.groups.labels.filter((g) => g === "focal")).toHaveLength(400);

    const plantedCol = body.model.itemIds.indexOf(PLANTED_ITEM);
    const mean = (rows) => rows.reduce((sum, row) => sum + row[plantedCol], 0) / rows.length;
    const refRows = body.responseMatrix.data.filter((_, i) => body.groups.labels[i] === "reference");
    const focRows = body.responseMatrix.data.filter((_, i) => body.groups.labels[i] === "focal");
    expect(mean(focRows)).toBeLessThan(mean(refRows));
  });

  it("builds an ADR 0002 DIF request the contract accepts", () => {
    const body = applyNamedCalibrationFixture({ fixture: "planted-dif" }).request;
    expect(validateCalibrationRequest(body)).toEqual([]);
    expect(body.model.family).toBe("dif");
    expect(body.groups.focal).toBe("focal");
    expect(body.groups.reference).toBe("reference");
    expect(body.groups.labels).toHaveLength(800);
    expect(body.options.seed).toBe(PLANTED_SEED);
  });

  it("keeps the committed sample job body in lockstep with the fixture name", () => {
    const sample = JSON.parse(fs.readFileSync(SAMPLE_PATH, "utf8"));
    expect(sample.fixture).toBe("planted-dif");
    expect(sample.kind).toBe("dif-analysis");
  });

  it("refuses planted-dif bound to a CTT statistical model", async () => {
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
        kind: "dif-analysis",
        fixture: "planted-dif",
        evidenceModelId: "em-irt",
        statisticalModelId: "sm-ctt",
      });
    expect(enqueue.status).toBe(400);
    expect(JSON.stringify(enqueue.body)).toMatch(/does not apply to statistical model type/);
  });
});

describe("planted DIF contract-path pipeline (always runs)", () => {
  it("enqueues via fixture: planted-dif, processes, succeeds, and ingests an analysis artefact", async () => {
    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "dif-analysis",
        fixture: "planted-dif",
        evidenceModelId: "em-irt",
        statisticalModelId: "sm-irt",
      });

    expect(enqueue.status).toBe(201);
    expect(enqueue.body.status).toBe("queued");
    expect(enqueue.body.kind).toBe("dif-analysis");
    expect(enqueue.body.request.model.family).toBe("dif");
    expect(enqueue.body.request.responseMatrix.data).toHaveLength(800);

    const jobId = enqueue.body.id;
    const stub = difContractStub(jobId, enqueue.body.request.model.itemIds);
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
    expect(artefact.kind).toBe("dif-analysis");
    expect(artefact.parameters[PLANTED_ITEM].flag).toBe(true);
    expect(
      Object.entries(artefact.parameters)
        .filter(([, p]) => p.flag)
        .map(([id]) => id)
    ).toEqual([PLANTED_ITEM]);

    expect(dbState.current.evidenceModels[0].analysisArtefacts).toHaveLength(1);
    expect(dbState.current.calibrationJobs[0].ingestedAnalysisArtefactId).toBe(
      artefact.analysisArtefactId
    );
    expect(dbState.current.evidenceModels[0].statisticalModels[0].parameterSets).toHaveLength(0);
    expect(dbState.current.questions[0].metadata).toEqual({});
  });

  it("refuses artefact ingest when DIF converged is false", async () => {
    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "dif-analysis",
        fixture: "planted-dif",
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
        message: "DIF statistics were not identified",
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

describe.skipIf(!live)("planted DIF live R pipeline", () => {
  it("health reports difR, then enqueue → process flags Item.5 only, then artefact ingest", async () => {
    const health = await getRHealth({ timeoutMs: 15_000 });
    expect(health.ok, health.text || health.error?.message).toBe(true);
    expect(health.json?.status).toBe("healthy");
    expect(health.json?.packages?.difR).toBeTruthy();

    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "dif-analysis",
        fixture: "planted-dif",
        evidenceModelId: "em-irt",
        statisticalModelId: "sm-irt",
      });
    expect(enqueue.status).toBe(201);

    const jobId = enqueue.body.id;
    const processed = await processJobById(jobId, {
      client: { postCalibration },
    });

    const parameters = processed.job?.response?.parameters || {};
    const flags = Object.fromEntries(
      Object.entries(parameters).map(([id, p]) => [id, p.flag])
    );
    const liveDump = JSON.stringify(
      {
        ok: processed.ok,
        status: processed.job?.status,
        error: processed.job?.error || processed.error,
        responseError: processed.job?.response?.error,
        converged: processed.job?.response?.converged,
        packageVersion: processed.job?.response?.packageVersion,
        sampleSize: processed.job?.response?.sampleSize,
        flags,
        etsClass: Object.fromEntries(
          Object.entries(parameters).map(([id, p]) => [id, p.etsClass])
        ),
        deltaMH: Object.fromEntries(
          Object.entries(parameters).map(([id, p]) => [id, p.deltaMH])
        ),
        alphaMH: Object.fromEntries(
          Object.entries(parameters).map(([id, p]) => [id, p.alphaMH])
        ),
        fitStatistics: processed.job?.response?.fitStatistics,
        diagnostics: processed.job?.response?.diagnostics,
      },
      null,
      2
    );
    // eslint-disable-next-line no-console
    console.log("planted DIF live process", liveDump);

    expect(processed.ok, liveDump).toBe(true);
    const job = processed.job;
    expect(job.status, liveDump).toBe("succeeded");
    expect(job.response.converged, liveDump).toBe(true);
    expect(job.response.packageVersion).toMatch(/^difR /);
    expect(job.response.sampleSize).toBe(800);
    expect(job.response.jobId).toBe(jobId);

    const flagged = Object.entries(job.response.parameters)
      .filter(([, p]) => p.flag === true)
      .map(([id]) => id);
    expect(flagged, liveDump).toEqual([PLANTED_ITEM]);
    expect(job.response.parameters[PLANTED_ITEM].etsClass).toBe("C");
    expect(Math.abs(job.response.parameters[PLANTED_ITEM].deltaMH)).toBeGreaterThanOrEqual(1.5);
    expect(job.response.parameters[PLANTED_ITEM].method).toBe("Mantel-Haenszel");
    for (const id of Object.keys(job.response.parameters).filter((x) => x !== PLANTED_ITEM)) {
      expect(job.response.parameters[id].flag, `${id} should not be flagged`).toBe(false);
      expect(job.response.parameters[id].etsClass, `${id} should not be ETS C`).not.toBe("C");
      expect(Math.abs(job.response.parameters[id].deltaMH)).toBeLessThan(1.5);
    }

    const ingested = await request(app)
      .post(`/api/calibrationJobs/${jobId}/ingest`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(ingested.status).toBe(200);
    expect(ingested.body.parameterSet).toBeNull();
    expect(ingested.body.analysisArtefact.calibrationJobId).toBe(jobId);
    expect(ingested.body.analysisArtefact.packageVersion).toMatch(/^difR /);
    expect(dbState.current.evidenceModels[0].analysisArtefacts).toHaveLength(1);
    expect(dbState.current.evidenceModels[0].statisticalModels[0].parameterSets).toHaveLength(0);
  }, 180_000);
});
