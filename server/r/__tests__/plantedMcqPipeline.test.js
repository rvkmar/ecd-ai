// Constructed MCQ item-analysis fixture: option counts are definitional.
// Live R (when R_BACKEND_URL is set) asserts distractors and flags.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";
import { postCalibration, getRHealth } from "../rClient.js";
import { applyNamedCalibrationFixture } from "../calibrationFixtures.js";
import { validateCalibrationRequest, CALIBRATION_CONTRACT_VERSION } from "../calibrationContract.js";
import { plantedMcqCalibrationRequest } from "../plantedMcqFixture.js";

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

beforeEach(() => {
  seedDb();
});

describe("planted MCQ fixture (always-run)", () => {
  it("has a unique unused option D and a planted attractive C on Item.attractive", () => {
    const body = plantedMcqCalibrationRequest();
    const unusedIdx = body.optionMatrix.itemIds.indexOf("Item.unused");
    const attractiveIdx = body.optionMatrix.itemIds.indexOf("Item.attractive");
    const count = (itemIdx, optionId) =>
      body.optionMatrix.data.filter((row) => row[itemIdx] === optionId).length;
    expect(count(unusedIdx, "D")).toBe(0);
    expect(count(attractiveIdx, "C")).toBe(5);
    expect(validateCalibrationRequest(body)).toEqual([]);
    expect(body.optionMatrix.data).toHaveLength(20);
    expect(body.domains).toHaveLength(2);
  });

  it("expands from the named fixture dispatcher", () => {
    const expanded = applyNamedCalibrationFixture({ fixture: "planted-mcq-item-analysis" });
    expect(expanded.request.model.family).toBe("item-analysis");
    expect(expanded.request.itemKeys["Item.easy"].keyedOptionId).toBe("A");
  });

  it("enqueues through the jobs route", async () => {
    const app = await jobsApp();
    const res = await request(app)
      .post("/api/calibrationJobs")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        evidenceModelId: "em-ctt",
        statisticalModelId: "sm-ctt",
        kind: "item-analysis",
        fixture: "planted-mcq-item-analysis",
      });
    expect(res.status).toBe(201);
    expect(res.body.request.optionMatrix.data).toHaveLength(20);
  });
});

const live = Boolean(process.env.R_BACKEND_URL);

describe.skipIf(!live)("planted MCQ live R", () => {
  it("returns option distractors, unused D, and an attractive-distractor flag", async () => {
    const health = await getRHealth();
    expect(health.ok).toBe(true);
    const body = plantedMcqCalibrationRequest({ jobId: "live-planted-mcq" });
    const posted = await postCalibration("item-analysis", body);
    expect(posted.ok).toBe(true);
    const response = posted.json;
    expect(response.converged).toBe(true);
    expect(response.contractVersion).toBe(CALIBRATION_CONTRACT_VERSION);
    const unused = response.parameters["Item.unused"];
    expect(unused.distractors).not.toBeNull();
    expect(unused.distractors.D.n).toBe(0);
    const attractive = response.parameters["Item.attractive"];
    const flagCodes = (attractive.flags || []).map((f) => f.code);
    expect(flagCodes).toContain("attractiveDistractor");
    expect(response.fitStatistics.cronbachAlpha).toBeGreaterThan(0);
    expect(typeof response.reportHtml).toBe("string");
    expect(response.reportHtml).toMatch(/Classical item analysis/);
    expect(response.diagnostics.testLevel.domains.algebra).toBeTruthy();
  });
});
