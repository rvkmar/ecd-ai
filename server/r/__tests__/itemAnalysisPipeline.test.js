// server/r/__tests__/itemAnalysisPipeline.test.js
// D77: LSAT7 item-analysis enqueue → process → (succeeded + converged) →
// analysisArtefact ingest.
//
// Two layers:
//   1. Always-run contract path — the published matrix is real; the R
//      response is a labeled contract stub. Proves the node pipeline
//      without inventing TAM estimates.
//   2. Live path when R_BACKEND_URL is set — worker posts the same
//      matrix to R /calibrate/item-analysis. Asserts TAM::tam.ctt2
//      remapped as { pValue, pointBiserial, n, distractors: null }.
//
// Existing CI `npm test` covers (1). The `lsat7-pipeline` job starts
// rvkmar/r-backend:latest (same image as compose) and covers (2).
//
// Authority: ctt-statistics → parameterSets may set activeParameterSetId;
// item-analysis → analysisArtefacts informs only. Same classical engine
// where p and rpb overlap (diagnostics.overlapWithCtt).

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
  "../../../samples/sample-calibration-job-item-analysis-lsat7.json"
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
    analysisArtefacts: [],
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

function itemAnalysisContractStub(jobId, itemIds, publishedMeans) {
  const parameters = {};
  for (const id of itemIds) {
    parameters[id] = {
      pValue: publishedMeans[id],
      pointBiserial: 0.4,
      n: 1000,
      distractors: null,
    };
  }
  return {
    contractVersion: CALIBRATION_CONTRACT_VERSION,
    jobId,
    converged: true,
    packageVersion: "contract-stub (not TAM)",
    sampleSize: 1000,
    calibratedAt: "2026-09-16T00:00:00Z",
    parameters,
    fitStatistics: {
      kr20: 0.5,
      meanScore: 3.707,
      sdScore: 1.0,
      nItems: 5,
      nPersons: 1000,
    },
    diagnostics: {
      note: "D77 contract-path stub. Not a psychometric result. Live R owns LSAT7 item-analysis estimates.",
      method: "TAM::tam.ctt2",
      overlapWithCtt:
        "On dichotomous data, artefact pValue equals CTT parameter-set difficulty and pointBiserial equals CTT discrimination; same TAM::tam.ctt2 engine.",
      authority:
        "Operational CTT readiness and activeParameterSetId come only from ctt-statistics → parameterSets. item-analysis writes analysisArtefacts and informs only.",
      distractorsNote:
        "Dichotomous 0/1 LSAT7 has no option-level distractors; distractors is null per item.",
      scoreForDiscrimination: "raw total (rowSums), not an IRT WLE",
    },
  };
}

beforeEach(() => {
  seedDb();
});

describe("lsat7-item-analysis fixture is the published LSAT7 matrix under family item-analysis", () => {
  it("is generated in Node from the published frequency table", () => {
    const loaderSrc = fs.readFileSync(path.resolve(here, "../lsat7Fixture.js"), "utf8");
    const dispatcherSrc = fs.readFileSync(path.resolve(here, "../calibrationFixtures.js"), "utf8");
    expect(loaderSrc).toMatch(/item-analysis/);
    expect(dispatcherSrc).toMatch(/lsat7-item-analysis/);
    expect(dispatcherSrc).not.toMatch(/path\.resolve\([^)]*r-backend/);
    expect(() => applyNamedCalibrationFixture({ fixture: "lsat7-item-analysis" })).not.toThrow();
  });

  it("is 1000 persons × 5 items with published item means", () => {
    const expanded = applyNamedCalibrationFixture({ fixture: "lsat7-item-analysis" });
    const body = expanded.request;
    const t = table();
    expect(body.responseMatrix.data).toHaveLength(1000);
    expect(t.itemIds).toEqual(["Item.1", "Item.2", "Item.3", "Item.4", "Item.5"]);
    expect(body.model.itemIds).toEqual(t.itemIds);
  });

  it("builds an ADR 0002 item-analysis request the contract accepts", () => {
    const body = applyNamedCalibrationFixture({ fixture: "lsat7-item-analysis" }).request;
    expect(validateCalibrationRequest(body)).toEqual([]);
    expect(body.model.family).toBe("item-analysis");
    expect(body.options.seed).toBe(20261120);
  });

  it("keeps the committed sample job body in lockstep with the fixture name", () => {
    const sample = JSON.parse(fs.readFileSync(SAMPLE_PATH, "utf8"));
    expect(sample.fixture).toBe("lsat7-item-analysis");
    expect(sample.kind).toBe("item-analysis");
  });

  it("refuses lsat7-item-analysis bound to a DINA statistical model", async () => {
    dbState.current.evidenceModels[0].statisticalModels.push({
      id: "sm-dina",
      type: "dina",
      active: true,
      parameterSets: [],
    });
    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "item-analysis",
        fixture: "lsat7-item-analysis",
        evidenceModelId: "em-ctt",
        statisticalModelId: "sm-dina",
      });
    expect(enqueue.status).toBe(400);
    expect(JSON.stringify(enqueue.body)).toMatch(/does not apply to statistical model type/);
  });
});

describe("LSAT7 item-analysis contract-path pipeline (always runs)", () => {
  it("enqueues via fixture: lsat7-item-analysis, processes, succeeds, and ingests an analysis artefact", async () => {
    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "item-analysis",
        fixture: "lsat7-item-analysis",
        evidenceModelId: "em-ctt",
        statisticalModelId: "sm-ctt",
      });

    expect(enqueue.status).toBe(201);
    expect(enqueue.body.status).toBe("queued");
    expect(enqueue.body.kind).toBe("item-analysis");
    expect(enqueue.body.request.model.family).toBe("item-analysis");
    expect(enqueue.body.request.responseMatrix.data).toHaveLength(1000);

    const jobId = enqueue.body.id;
    const stub = itemAnalysisContractStub(
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

    const ingested = await request(app)
      .post(`/api/calibrationJobs/${jobId}/ingest`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);

    expect(ingested.status).toBe(200);
    expect(ingested.body.parameterSet).toBeNull();
    const artefact = ingested.body.analysisArtefact;
    expect(artefact.calibrationJobId).toBe(jobId);
    expect(artefact.kind).toBe("item-analysis");
    expect(artefact.parameters["Item.4"].pValue).toBe(0.606);
    expect(artefact.parameters["Item.5"].pValue).toBe(0.843);
    expect(artefact.parameters["Item.4"].distractors).toBeNull();
    expect(artefact.parameters["Item.5"].distractors).toBeNull();

    const diag = JSON.stringify(artefact.diagnostics || {});
    expect(diag).toMatch(/overlap/i);
    expect(diag).toMatch(/authority/i);
    expect(diag).toMatch(/distractor/i);

    expect(dbState.current.analysisArtefacts).toHaveLength(1);
    expect(dbState.current.calibrationJobs[0].ingestedAnalysisArtefactId).toBe(
      artefact.analysisArtefactId || artefact.id
    );
    expect(dbState.current.evidenceModels[0].analysisArtefacts || []).toHaveLength(0);
    expect(dbState.current.evidenceModels[0].statisticalModels[0].parameterSets).toHaveLength(0);
    expect(dbState.current.questions[0].metadata).toEqual({});
  });

  it("refuses artefact ingest when item-analysis converged is false", async () => {
    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "item-analysis",
        fixture: "lsat7-item-analysis",
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
        message: "Item-analysis statistics were not identified",
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
    expect(dbState.current.analysisArtefacts || []).toHaveLength(0);
    expect(dbState.current.evidenceModels[0].analysisArtefacts || []).toHaveLength(0);
  });
});

const live = Boolean(process.env.R_BACKEND_URL);

describe.skipIf(!live)("LSAT7 item-analysis live R pipeline", () => {
  it("health reports TAM, then enqueue → process → artefact ingest with published pValues", async () => {
    const health = await getRHealth({ timeoutMs: 15_000 });
    expect(health.ok, health.text || health.error?.message).toBe(true);
    expect(health.json?.status).toBe("healthy");
    expect(health.json?.packages?.TAM).toBeTruthy();

    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "item-analysis",
        fixture: "lsat7-item-analysis",
        evidenceModelId: "em-ctt",
        statisticalModelId: "sm-ctt",
      });
    expect(enqueue.status).toBe(201);

    const jobId = enqueue.body.id;
    const processed = await processJobById(jobId, {
      client: { postCalibration },
    });

    const parameters = processed.job?.response?.parameters || {};
    const publishedMeans = table().source.publishedItemMeans;
    const liveDump = JSON.stringify(
      {
        ok: processed.ok,
        status: processed.job?.status,
        error: processed.job?.error || processed.error,
        responseError: processed.job?.response?.error,
        converged: processed.job?.response?.converged,
        packageVersion: processed.job?.response?.packageVersion,
        sampleSize: processed.job?.response?.sampleSize,
        pValues: Object.fromEntries(
          Object.entries(parameters).map(([id, p]) => [id, p.pValue])
        ),
        pointBiserials: Object.fromEntries(
          Object.entries(parameters).map(([id, p]) => [id, p.pointBiserial])
        ),
        distractors: Object.fromEntries(
          Object.entries(parameters).map(([id, p]) => [id, p.distractors])
        ),
        fitStatistics: processed.job?.response?.fitStatistics,
        diagnostics: processed.job?.response?.diagnostics,
      },
      null,
      2
    );
    // eslint-disable-next-line no-console
    console.log("LSAT7 item-analysis live process", liveDump);

    expect(processed.ok, liveDump).toBe(true);
    const job = processed.job;
    expect(job.status, liveDump).toBe("succeeded");
    expect(job.response.converged, liveDump).toBe(true);
    expect(job.response.packageVersion).toMatch(/^TAM /);
    expect(job.response.sampleSize).toBe(1000);
    expect(job.response.jobId).toBe(jobId);

    for (const id of Object.keys(parameters)) {
      expect(parameters[id].pValue).toBeCloseTo(publishedMeans[id], 6);
      expect(parameters[id].pointBiserial).toBeGreaterThan(0);
      expect(parameters[id].pointBiserial).toBeLessThan(1);
      expect(parameters[id].distractors).toBeNull();
    }
    expect(job.response.parameters["Item.5"].pValue).toBeGreaterThan(
      job.response.parameters["Item.4"].pValue
    );

    const diag = job.response.diagnostics || {};
    expect(JSON.stringify(diag)).toMatch(/overlap/i);
    expect(JSON.stringify(diag)).toMatch(/authority/i);
    expect(JSON.stringify(diag)).toMatch(/distractor/i);
    expect(diag.scoreForDiscrimination).toMatch(/raw total/i);

    const ingested = await request(app)
      .post(`/api/calibrationJobs/${jobId}/ingest`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(ingested.status).toBe(200);
    expect(ingested.body.parameterSet).toBeNull();
    expect(ingested.body.analysisArtefact.calibrationJobId).toBe(jobId);
    expect(ingested.body.analysisArtefact.packageVersion).toMatch(/^TAM /);
    expect(dbState.current.analysisArtefacts).toHaveLength(1);
    expect(dbState.current.evidenceModels[0].analysisArtefacts || []).toHaveLength(0);
    expect(dbState.current.evidenceModels[0].statisticalModels[0].parameterSets).toHaveLength(0);
  }, 180_000);
});
