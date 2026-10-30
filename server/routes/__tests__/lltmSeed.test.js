import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";
import { insertGeneratedTaskSpec } from "../../services/insertGeneratedTaskSpec.js";

vi.mock("../../r/lltmClient.js", () => ({
  postLltm: vi.fn(),
}));

const tokenFor = (role) =>
  jwt.sign({ username: `${role}1`, role }, JWT_SECRET, { expiresIn: "1h" });

const dbState = { current: {} };
vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: () => dbState.current,
  readRawDB: () => dbState.current,
  saveDB: (next) => {
    dbState.current = next;
  },
}));

async function app() {
  const { default: templates } = await import("../templatesRoutes.js");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api/templates", templates);
  return expressApp;
}

function seedDb() {
  const db = {
    competencyModels: [{ id: "cm1", name: "CM", status: "confirmed", locked: true }],
    competencies: [{ id: "c1", name: "Attr", modelId: "cm1" }],
    evidenceModels: [
      {
        id: "em1",
        name: "EM",
        competencyId: "c1",
        status: "confirmed",
        locked: true,
        statisticalModels: [
          {
            id: "sm1",
            type: "irt",
            parameterSets: [{ parameterSetId: "ps-real", converged: true }],
            activeParameterSetId: "ps-real",
          },
        ],
      },
    ],
    taskModels: [
      {
        id: "tm1",
        name: "TM",
        evidenceModelIds: ["em1"],
        primaryEvidenceModelId: "em1",
        status: "confirmed",
        locked: true,
        versionNumber: 1,
      },
    ],
    presentationModels: [
      {
        id: "pm1",
        name: "PM",
        taskModelId: "tm1",
        taskModelVersion: 1,
        status: "confirmed",
        locked: true,
      },
    ],
    templates: [
      {
        id: "tpl1",
        name: "Blueprint",
        status: "confirmed",
        competencyModelId: "cm1",
        evidenceModelId: "em1",
        taskModelId: "tm1",
        presentationModelId: "pm1",
      },
    ],
    taskModelVariables: [
      {
        id: "tmv-bloom",
        name: "Cognitive demand",
        type: "categorical",
        possibleValues: [
          { value: "remember", label: "Remember" },
          { value: "apply", label: "Apply" },
        ],
      },
      {
        id: "tmv-register",
        name: "Register",
        type: "categorical",
        possibleValues: [
          { value: "formal", label: "Formal" },
          { value: "informal", label: "Informal" },
        ],
      },
    ],
    taskSpecs: [],
    items: [],
    calibrationJobs: [],
    analysisArtefacts: [],
    sessions: [],
  };
  insertGeneratedTaskSpec(db, {
    id: "spec-ref",
    templateId: "tpl1",
    tmvAssignment: [
      { taskModelVariableId: "tmv-bloom", value: "remember" },
      { taskModelVariableId: "tmv-register", value: "formal" },
    ],
  });
  insertGeneratedTaskSpec(db, {
    id: "spec-apply",
    templateId: "tpl1",
    tmvAssignment: [
      { taskModelVariableId: "tmv-bloom", value: "apply" },
      { taskModelVariableId: "tmv-register", value: "formal" },
    ],
  });
  insertGeneratedTaskSpec(db, {
    id: "spec-informal",
    templateId: "tpl1",
    tmvAssignment: [
      { taskModelVariableId: "tmv-bloom", value: "remember" },
      { taskModelVariableId: "tmv-register", value: "informal" },
    ],
  });
  insertGeneratedTaskSpec(db, {
    id: "spec-both",
    templateId: "tpl1",
    tmvAssignment: [
      { taskModelVariableId: "tmv-bloom", value: "apply" },
      { taskModelVariableId: "tmv-register", value: "informal" },
    ],
  });
  db.items = [
    { id: "item-ref", taskSpecId: "spec-ref", taskModelId: "tm1" },
    { id: "item-apply", taskSpecId: "spec-apply", taskModelId: "tm1" },
    { id: "item-informal", taskSpecId: "spec-informal", taskModelId: "tm1" },
  ];
  return db;
}

beforeEach(() => {
  dbState.current = seedDb();
  vi.clearAllMocks();
});

describe("POST /api/templates/:id/lltm", () => {
  it("seeds predicted difficulties and does not activate a parameter set", async () => {
    const { postLltm } = await import("../../r/lltmClient.js");
    postLltm.mockResolvedValue({
      ok: true,
      result: {
        converged: true,
        parameterStatus: "predicted",
        sourceModel: "eRm::LLTM",
        packageVersion: "eRm 1.0.4",
        normalization: "The reference pattern is fixed at difficulty 0.",
        sampleSize: 40,
        seMethod: "eRm conditional maximum likelihood",
        logLik: -12.5,
        intercept: null,
        effects: [
          { name: "tmv-bloom=apply", estimate: 0.7, se: 0.05 },
          { name: "tmv-register=informal", estimate: -0.4, se: 0.06 },
        ],
        vcov: [
          [0.0025, 0],
          [0, 0.0036],
        ],
      },
    });

    const expressApp = await app();
    const before = JSON.stringify(dbState.current.evidenceModels);
    const res = await request(expressApp)
      .post("/api/templates/tpl1/lltm")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        responseMatrix: {
          personIds: ["p1", "p2"],
          itemIds: ["item-ref", "item-apply", "item-informal"],
          data: [
            [1, 0, 1],
            [1, 1, 0],
          ],
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.parameterStatus).toBe("predicted");
    expect(res.body.sourceModel).toBe("eRm::LLTM");
    expect(JSON.stringify(dbState.current.evidenceModels)).toBe(before);
    expect(dbState.current.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBe("ps-real");
    expect(dbState.current.evidenceModels[0].statisticalModels[0].parameterSets).toHaveLength(1);

    const reference = dbState.current.taskSpecs.find((spec) => spec.id === "spec-ref");
    const apply = dbState.current.taskSpecs.find((spec) => spec.id === "spec-apply");
    const both = dbState.current.taskSpecs.find((spec) => spec.id === "spec-both");
    expect(reference.predictedParameters.parameterStatus).toBe("predicted");
    expect(reference.predictedParameters.origin).toBe("predicted");
    expect(reference.predictedParameters.b).toBe(0);
    expect(apply.predictedParameters.b).toBeCloseTo(0.7, 6);
    expect(both.predictedParameters.b).toBeCloseTo(0.3, 6);
    expect(both.predictedParameters.model).toBe("Rasch");
    expect(both.predictedParameters.a).toBe(1);
    expect(both.predictedParameters.effects.map((effect) => effect.name)).toEqual([
      "tmv-bloom=apply",
      "tmv-register=informal",
    ]);
    const slim = JSON.stringify(both.predictedParameters);
    expect(slim).not.toMatch(/vcov/);
    expect(slim).not.toMatch(/responseMatrix/);
    expect(slim).not.toMatch(/personIds/);

    const artefact = dbState.current.analysisArtefacts[0];
    expect(artefact.kind).toBe("lltm");
    expect(artefact.payload.vcov).toEqual([
      [0.0025, 0],
      [0, 0.0036],
    ]);
    expect(artefact.payload.responseMatrix.personIds).toEqual(["p1", "p2"]);
    expect(artefact.payload.parameterStatus).toBe("predicted");

    const job = dbState.current.calibrationJobs[0];
    expect(job.kind).toBe("lltm");
    expect(job.status).toBe("succeeded");
    expect(job.ingestedParameterSetId).toBeNull();
    expect(job.ingestedAnalysisArtefactId).toBe(artefact.id);
    expect(job.response.parameters).toBeUndefined();
    expect(job.response.parameterStatus).toBe("predicted");
  });

  it("builds the matrix from closed sessions when the body has none", async () => {
    const { postLltm } = await import("../../r/lltmClient.js");
    postLltm.mockResolvedValue({
      ok: true,
      result: {
        converged: true,
        parameterStatus: "predicted",
        sourceModel: "eRm::LLTM",
        packageVersion: "eRm 1.0.4",
        normalization: "The reference pattern is fixed at difficulty 0.",
        sampleSize: 2,
        effects: [
          { name: "tmv-bloom=apply", estimate: 0.7, se: 0.05 },
          { name: "tmv-register=informal", estimate: -0.4, se: 0.06 },
        ],
        vcov: [
          [0.0025, 0],
          [0, 0.0036],
        ],
      },
    });
    dbState.current.sessions = [
      {
        id: "s1",
        status: "completed",
        studentId: "p1",
        responses: [
          { itemId: "item-ref", activated: true },
          { itemId: "item-apply", activated: false },
          { itemId: "item-informal", activated: true },
        ],
      },
      {
        id: "s2",
        status: "completed",
        studentId: "p2",
        responses: [
          { itemId: "item-ref", activated: true },
          { itemId: "item-apply", activated: true },
          { itemId: "item-informal", activated: false },
        ],
      },
      {
        id: "s-open",
        status: "in_progress",
        studentId: "p3",
        responses: [{ itemId: "item-ref", activated: false }],
      },
    ];

    const expressApp = await app();
    const res = await request(expressApp)
      .post("/api/templates/tpl1/lltm")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({});

    expect(res.status).toBe(201);
    const posted = postLltm.mock.calls[0][0];
    expect(posted.responseMatrix.personIds).toEqual(["p1", "p2"]);
    expect(posted.responseMatrix.itemIds).toEqual(["item-ref", "item-apply", "item-informal"]);
    expect(posted.responseMatrix.data).toEqual([
      [1, 0, 1],
      [1, 1, 0],
    ]);
    expect(dbState.current.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBe("ps-real");
  });

  it("does not write specs when the fit does not converge", async () => {
    const { postLltm } = await import("../../r/lltmClient.js");
    postLltm.mockResolvedValue({
      ok: true,
      result: { converged: false, error: { message: "LLTM did not converge." } },
    });
    const expressApp = await app();
    const res = await request(expressApp)
      .post("/api/templates/tpl1/lltm")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        responseMatrix: {
          personIds: ["p1", "p2"],
          itemIds: ["item-ref", "item-apply", "item-informal"],
          data: [
            [1, 0, 1],
            [0, 1, 0],
          ],
        },
      });
    expect(res.status).toBe(400);
    expect(dbState.current.taskSpecs.every((spec) => spec.predictedParameters == null)).toBe(true);
    expect(dbState.current.analysisArtefacts).toEqual([]);
    expect(dbState.current.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBe("ps-real");
  });
});
