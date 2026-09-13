// server/r/__tests__/lsat7Pipeline.test.js
// D64: LSAT7 through enqueue → process → (succeeded + converged) → ingest.
//
// Two layers, on purpose:
//   1. Always-run contract path — the published matrix is real; the R
//      response is a labeled contract stub. Proves the node pipeline
//      without inventing mirt estimates.
//   2. Live path when R_BACKEND_URL is set — worker posts the same
//      matrix to R /calibrate/irt. Asserts a real mirt run converged
//      and a parameter set was written with calibrationJobId.
//
// Existing CI `npm test` covers (1). The `lsat7-pipeline` job starts
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
import {
  loadLsat7FrequencyTable,
  expandLsat7Responses,
  lsat7CalibrationRequest,
  lsat7JobEnqueueBody,
  lsat7ItemCorrectCounts,
  lsat7ContractStubResponse,
  LSAT7_SEED,
} from "../lsat7Fixture.js";
import { validateCalibrationRequest } from "../calibrationContract.js";

const tokenFor = (role) =>
  jwt.sign({ username: `${role}1`, role }, JWT_SECRET, { expiresIn: "1h" });

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
        id: "em1",
        competencyId: "c1",
        statisticalModels: [
          { id: "sm1", type: "irt", active: true, parameterSets: [] },
        ],
      },
    ],
    competencies: [{ id: "c1", modelId: "cm1", variableType: "continuous" }],
  };
}

beforeEach(() => {
  seedDb();
});

describe("LSAT7 fixture is the published matrix", () => {
  it("expands to 1000 persons × 5 items with Bock & Lieberman counts", () => {
    const table = loadLsat7FrequencyTable();
    const data = expandLsat7Responses();
    const freqSum = table.patterns.reduce((sum, p) => sum + p.freq, 0);

    expect(table.itemIds).toEqual(["Item.1", "Item.2", "Item.3", "Item.4", "Item.5"]);
    expect(freqSum).toBe(1000);
    expect(data).toHaveLength(1000);
    expect(data.every((row) => row.length === 5)).toBe(true);

    const counts = lsat7ItemCorrectCounts(data);
    expect(counts).toEqual(table.source.publishedItemCorrectCounts);
    expect(Object.values(counts).reduce((a, b) => a + b, 0) / 1000).toBeCloseTo(
      table.source.publishedMeanTotalScore,
      3
    );
  });

  it("builds an ADR 0002 IRT request the contract accepts", () => {
    const body = lsat7CalibrationRequest();
    expect(validateCalibrationRequest(body)).toEqual([]);
    expect(body.model.subtype).toBe("2PL");
    expect(body.responseMatrix.personIds).toHaveLength(1000);
    expect(body.options.seed).toBe(LSAT7_SEED);
  });

  it("keeps the committed sample job body in lockstep with the fixture", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const samplePath = path.resolve(here, "../../../samples/sample-calibration-job-irt-lsat7.json");
    const sample = JSON.parse(fs.readFileSync(samplePath, "utf8"));
    const expected = lsat7JobEnqueueBody();
    expect(sample.kind).toBe("irt-parameters");
    expect(sample.request.responseMatrix.data).toEqual(expected.request.responseMatrix.data);
    expect(sample.request.model.itemIds).toEqual(expected.request.model.itemIds);
    expect(sample.request.options.seed).toBe(LSAT7_SEED);
  });
});

describe("LSAT7 contract-path pipeline (always runs)", () => {
  it("enqueues, processes, succeeds with converged: true, and ingests calibrationJobId", async () => {
    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send(lsat7JobEnqueueBody({ evidenceModelId: "em1", statisticalModelId: "sm1" }));

    expect(enqueue.status).toBe(201);
    expect(enqueue.body.status).toBe("queued");
    expect(enqueue.body.request.responseMatrix.data).toHaveLength(1000);
    expect(enqueue.body.request.model.itemIds).toEqual([
      "Item.1",
      "Item.2",
      "Item.3",
      "Item.4",
      "Item.5",
    ]);

    const jobId = enqueue.body.id;
    const stub = lsat7ContractStubResponse(jobId, enqueue.body.request.model.itemIds);
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
    expect(Object.keys(ps.parameters)).toEqual([
      "Item.1",
      "Item.2",
      "Item.3",
      "Item.4",
      "Item.5",
    ]);

    const stored = dbState.current.evidenceModels[0].statisticalModels[0].parameterSets;
    expect(stored).toHaveLength(1);
    expect(stored[0].calibrationJobId).toBe(jobId);
    expect(dbState.current.calibrationJobs[0].ingestedParameterSetId).toBe(ps.parameterSetId);
    expect(dbState.current.questions[0].metadata).toEqual({});
  });
});

const live = Boolean(process.env.R_BACKEND_URL);

describe.skipIf(!live)("LSAT7 live R pipeline", () => {
  it("health reports a running mirt, then enqueue → process → ingest a converged run", async () => {
    const health = await getRHealth({ timeoutMs: 15_000 });
    expect(health.ok, health.text || health.error?.message).toBe(true);
    expect(health.json?.status).toBe("healthy");
    expect(health.json?.packages?.mirt).toBeTruthy();

    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send(lsat7JobEnqueueBody({ evidenceModelId: "em1", statisticalModelId: "sm1" }));
    expect(enqueue.status).toBe(201);

    const jobId = enqueue.body.id;
    const processed = await processJobById(jobId, {
      client: { postCalibration },
    });

    expect(processed.ok, processed.job?.error?.message || processed.error).toBe(true);
    const job = processed.job;
    expect(job.status).toBe("succeeded");
    expect(job.response.converged).toBe(true);
    expect(job.response.packageVersion).toMatch(/^mirt /);
    expect(job.response.sampleSize).toBe(1000);
    expect(job.response.jobId).toBe(jobId);

    const itemIds = enqueue.body.request.model.itemIds;
    for (const id of itemIds) {
      const par = job.response.parameters[id];
      expect(par, `missing parameters for ${id}`).toBeTruthy();
      expect(par.a).toBeGreaterThan(0);
      expect(Number.isFinite(par.b)).toBe(true);
    }

    // Item.4 is the hardest (p = 0.606); Item.5 is the easiest (p = 0.843).
    expect(job.response.parameters["Item.5"].b).toBeLessThan(
      job.response.parameters["Item.4"].b
    );

    const ingested = await request(app)
      .post(`/api/calibrationJobs/${jobId}/ingest`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(ingested.status).toBe(200);
    expect(ingested.body.parameterSet.calibrationJobId).toBe(jobId);
    expect(ingested.body.parameterSet.packageVersion).toMatch(/^mirt /);
    expect(dbState.current.evidenceModels[0].statisticalModels[0].parameterSets).toHaveLength(1);
  }, 180_000);
});
