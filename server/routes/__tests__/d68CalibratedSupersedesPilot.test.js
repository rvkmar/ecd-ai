// D68: calibrated supersedes pilot on NEW sessions; in-flight sessions
// freeze to their opening source / parameter set so mixed-source groups
// never silently kill the posterior.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { seedActivePackages } from "../../test/seedActivePackage.js";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: "u1", role: "student" };
    next();
  },
  authorizeRole: (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.sendStatus(403);
    next();
  },
}));

vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: vi.fn(),
  saveDB: vi.fn(),
  finishSession: vi.fn(),
}));

const { loadDB, saveDB } = await import("../../../src/utils/db-server.js");
const { default: router } = await import("../sessionRoutes.js");
const { accumulateEvidence } = await import("../../delivery/evidenceAccumulation.js");

function scoring(observationId = "o1") {
  return {
    method: "dichotomous",
    maxScore: 1,
    evidenceActivationMap: [
      { responsePattern: { selected: "opt_a" }, activatesObservable: true, strengthOverride: 4, rationale: "Correct." },
    ],
  };
}

function makeItem(id, observationId, irtParams) {
  return {
    id,
    taskModelId: "tm1",
    versionNumber: 1,
    taskModelVersion: 1,
    observationId,
    evidenceModelId: "em1",
    evidenceModelVersion: 1,
    locked: true,
    equivalenceGroupId: "grp1",
    stimulus: { layout: "single", blocks: [{ type: "text", content: id }] },
    interaction: { type: "mcq", responseComponents: [{ id: "opt_a" }, { id: "opt_b" }] },
    scoring: scoring(observationId),
    psychometrics: { statisticalModelType: "irt", irtParams },
  };
}

function makeEm({ parameterSets = [], activeParameterSetId = null } = {}) {
  return {
    id: "em1",
    versionNumber: 1,
    competencyId: "c1",
    competencyModelVersion: 1,
    observables: [
      {
        id: "o1",
        type: "selected_response",
        evidenceRule: { direction: "supports", strengthLevel: 4, activationCondition: "any", justification: "x" },
      },
      {
        id: "o2",
        type: "selected_response",
        evidenceRule: { direction: "supports", strengthLevel: 4, activationCondition: "any", justification: "x" },
      },
    ],
    statisticalModels: [
      {
        id: "sm1",
        type: "irt",
        active: true,
        structureConfig: {},
        parameterSets,
        activeParameterSetId,
      },
    ],
  };
}

function makeDb({ items, em, taskIds = ["t1", "t2"] }) {
  const db = {
    competencyModels: [{
      id: "cm1",
      versionNumber: 1,
      smVariables: [{
        id: "smv-theta",
        type: "continuous",
        scale: { min: -4, max: 4 },
        priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } },
      }],
    }],
    competencies: [{ id: "c1", modelId: "cm1" }],
    sessions: [{
      id: "s1",
      studentId: "u1",
      taskIds,
      currentTaskIndex: 0,
      responses: [],
      studentModel: {},
      selectionStrategy: "fixed",
      status: "in_progress",
      isCompleted: false,
    }],
    tasks: taskIds.map((id, i) => ({
      id,
      taskModelId: "tm1",
      itemId: items[i].id,
      generatedObservationIds: [],
      generatedEvidenceIds: [],
    })),
    taskModels: [{
      id: "tm1",
      versionNumber: 1,
      status: "operational",
      locked: true,
      evidenceModelIds: ["em1"],
      expectedObservations: items.map((it) => ({
        observationId: it.observationId,
        evidenceModelId: "em1",
        required: true,
        weight: 1,
      })),
    }],
    evidenceModels: [em],
    items,
  };
  seedActivePackages(db);
  return db;
}

function buildApp(db) {
  loadDB.mockReturnValue(db);
  saveDB.mockImplementation(() => {});
  const app = express();
  app.use(express.json());
  app.use("/api/sessions", router);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("D68 — calibrated supersedes pilot; in-flight sessions freeze", () => {
  it("keeps a pilot-opened session on pilot after a calibrated set is ingested, and the posterior stays supported", async () => {
    const items = [
      makeItem("item1", "o1", { a: 1, b: -0.4 }),
      makeItem("item2", "o2", { a: 1, b: 0.4 }),
    ];
    const db = makeDb({ items, em: makeEm() });
    const app = buildApp(db);

    const first = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });
    expect(first.status).toBe(200);
    expect(first.body.responses[0].parameterSource).toBe("pilot");
    expect(first.body.responses[0].pilotParams).toEqual({ a: 1, b: -0.4 });
    const estimateAfterPilot = first.body.studentModel?.smvPosteriors?.["smv-theta"]?.estimate;
    expect(Number.isFinite(estimateAfterPilot)).toBe(true);

    const sm = db.evidenceModels[0].statisticalModels[0];
    sm.parameterSets.push({
      parameterSetId: "ps-new",
      parameters: { o1: { a: 3, b: -2.5 } },
      packageVersion: "mirt-test",
      converged: true,
      sampleSize: 400,
      calibratedAt: "2026-09-14T00:00:00.000Z",
    });
    sm.activeParameterSetId = "ps-new";

    const second = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t2", itemId: "item2", rawAnswer: "opt_a" });
    expect(second.status).toBe(200);
    expect(second.body.responses.map((r) => r.parameterSource)).toEqual(["pilot", "pilot"]);
    expect(second.body.responses[1].parameterSetId).toBeFalsy();
    expect(second.body.responses[1].pilotParams).toEqual({ a: 1, b: 0.4 });

    const recomputed = accumulateEvidence(db.sessions[0], db).posteriors[0];
    expect(recomputed.supported).toBe(true);
    expect(recomputed.parameterSource).toBe("pilot");
    expect(recomputed.estimate).toBe(second.body.studentModel.smvPosteriors["smv-theta"].estimate);
  });

  it("does not silently rescore a pilot session onto the new calibrated numbers", async () => {
    const items = [
      makeItem("item1", "o1", { a: 1, b: 0 }),
      makeItem("item2", "o2", { a: 1, b: 0 }),
    ];
    const db = makeDb({ items, em: makeEm() });
    const app = buildApp(db);

    await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    const sm = db.evidenceModels[0].statisticalModels[0];
    sm.parameterSets.push({
      parameterSetId: "ps-new",
      parameters: { o1: { a: 3, b: -2.5 } },
      packageVersion: "mirt-test",
      converged: true,
      sampleSize: 400,
      calibratedAt: "2026-09-14T00:00:00.000Z",
    });
    sm.activeParameterSetId = "ps-new";

    await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t2", itemId: "item2", rawAnswer: "opt_a" });

    const live = accumulateEvidence(db.sessions[0], db).posteriors[0].estimate;

    const wouldHaveBeenCalibrated = accumulateEvidence(
      {
        ...db.sessions[0],
        responses: db.sessions[0].responses.map((r) => ({
          ...r,
          parameterSource: "calibrated",
          parameterSetId: "ps-new",
          pilotParams: undefined,
        })),
      },
      db
    ).posteriors[0].estimate;

    expect(live).not.toBe(wouldHaveBeenCalibrated);
  });

  it("keeps a calibrated-opened session on its opening parameter set after a later active-set flip", async () => {
    const items = [
      makeItem("item1", "o1", { a: 1, b: 0 }),
      makeItem("item2", "o2", { a: 1, b: 0 }),
    ];
    const em = makeEm({
      parameterSets: [
        {
          parameterSetId: "ps1",
          parameters: { o1: { a: 1, b: 0 }, o2: { a: 1, b: 0 } },
          packageVersion: "mirt-1",
          converged: true,
          sampleSize: 200,
          calibratedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activeParameterSetId: "ps1",
    });
    const db = makeDb({ items, em });
    const app = buildApp(db);

    const first = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });
    expect(first.body.responses[0].parameterSource).toBe("calibrated");
    expect(first.body.responses[0].parameterSetId).toBe("ps1");
    const estimatePs1 = first.body.studentModel.smvPosteriors["smv-theta"].estimate;

    const sm = db.evidenceModels[0].statisticalModels[0];
    sm.parameterSets.push({
      parameterSetId: "ps2",
      parameters: { o1: { a: 3, b: -2.5 }, o2: { a: 3, b: -2.5 } },
      packageVersion: "mirt-2",
      converged: true,
      sampleSize: 900,
      calibratedAt: "2026-06-01T00:00:00.000Z",
    });
    sm.activeParameterSetId = "ps2";

    const second = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t2", itemId: "item2", rawAnswer: "opt_a" });
    expect(second.status).toBe(200);
    expect(second.body.responses.map((r) => r.parameterSetId)).toEqual(["ps1", "ps1"]);
    expect(second.body.responses.every((r) => r.parameterSource === "calibrated")).toBe(true);

    const recomputed = accumulateEvidence(db.sessions[0], db).posteriors[0];
    expect(recomputed.supported).toBe(true);
    expect(recomputed.parameterSetId).toBe("ps1");
    expect(recomputed.estimate).toBe(second.body.studentModel.smvPosteriors["smv-theta"].estimate);
    expect(recomputed.estimate).not.toBe(estimatePs1);

    const mixedWouldDie = accumulateEvidence(
      {
        ...db.sessions[0],
        responses: [
          db.sessions[0].responses[0],
          { ...db.sessions[0].responses[1], parameterSetId: "ps2" },
        ],
      },
      db
    ).posteriors[0];
    expect(mixedWouldDie.supported).toBe(false);
    expect(mixedWouldDie.reason).toMatch(/different parameter sets/);
  });

  it("a new session after ingest scores calibrated, not leftover Step 7 pilots", async () => {
    const items = [makeItem("item1", "o1", { a: 1, b: 2 })];
    const em = makeEm({
      parameterSets: [
        {
          parameterSetId: "ps1",
          parameters: { o1: { a: 1.1, b: -0.5 } },
          packageVersion: "mirt-1",
          converged: true,
          sampleSize: 200,
          calibratedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activeParameterSetId: "ps1",
    });
    const db = makeDb({ items, em, taskIds: ["t1"] });
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });
    expect(res.status).toBe(200);
    expect(res.body.responses[0].parameterSource).toBe("calibrated");
    expect(res.body.responses[0].parameterSetId).toBe("ps1");
    expect(res.body.responses[0].pilotParams).toBeUndefined();
  });
});
