// server/routes/__tests__/d49cIdentificationLibrary.test.js
//
// D49c submit-path exit checks that Identification's library contract
// actually reaches the student: a missing/stale package is a 409, a live
// structural edit without rebuild does not change the score, and a
// parameter flip without rebuild does — for a *new* session. D68 froze
// in-flight sessions to their opening parameter set, so the same-session
// next item must NOT pick up the new active set.

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

const evidenceModel = {
  id: "em1",
  versionNumber: 1,
  observables: [
    {
      id: "o1",
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
      parameterSets: [
        {
          parameterSetId: "ps1",
          parameters: { o1: { a: 1, b: 0 } },
          packageVersion: "pilot-1",
          converged: true,
          sampleSize: 1,
          calibratedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          parameterSetId: "ps2",
          parameters: { o1: { a: 1.8, b: -0.4 } },
          packageVersion: "pilot-2",
          converged: true,
          sampleSize: 900,
          calibratedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
      activeParameterSetId: "ps1",
    },
  ],
};

const item = {
  id: "item1",
  taskModelId: "tm1",
  versionNumber: 1,
  taskModelVersion: 1,
  observationId: "o1",
  evidenceModelId: "em1",
  evidenceModelVersion: 1,
  status: "confirmed",
  scoring: {
    method: "dichotomous",
    maxScore: 1,
    evidenceActivationMap: [
      { responsePattern: { selected: "opt_a" }, activatesObservable: true, strengthOverride: 4, rationale: "Correct." },
    ],
  },
  psychometrics: { statisticalModelType: "irt", irtParams: { a: 1, b: 0 } },
};

function makeDb(overrides = {}) {
  const { compositeLibrary, ...rest } = overrides;
  const db = {
    sessions: [{
      id: "s1",
      studentId: "u1",
      taskIds: ["t1", "t2"],
      currentTaskIndex: 0,
      responses: [],
      studentModel: {},
      selectionStrategy: "fixed",
      status: "in_progress",
      isCompleted: false,
    }],
    tasks: [
      { id: "t1", taskModelId: "tm1", generatedObservationIds: [], generatedEvidenceIds: [] },
      { id: "t2", taskModelId: "tm1", generatedObservationIds: [], generatedEvidenceIds: [] },
    ],
    taskModels: [{
      id: "tm1",
      versionNumber: 1,
      status: "operational",
      locked: true,
      evidenceModelIds: ["em1"],
      expectedObservations: [{ observationId: "o1", evidenceModelId: "em1", required: true, weight: 1 }],
    }],
    evidenceModels: [structuredClone(evidenceModel)],
    items: [structuredClone(item)],
    ...rest,
  };
  if (compositeLibrary !== undefined) {
    db.compositeLibrary = compositeLibrary;
  } else {
    seedActivePackages(db);
  }
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

describe("D49c submit path — library is the structural source", () => {
  it("happy path: package matching the authoring graph scores the activating response", async () => {
    const db = makeDb();
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(200);
    expect(res.body.responses[0]).toMatchObject({
      activated: true,
      direction: "supports",
      strength: 4,
      parameterSetId: "ps1",
      parameterSource: "calibrated",
    });
  });

  it("a live activation-map edit without rebuild does not change the score", async () => {
    const db = makeDb();
    db.items[0].scoring.evidenceActivationMap = [
      { responsePattern: { selected: "opt_a" }, activatesObservable: false, rationale: "Live edit." },
    ];
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(200);
    expect(res.body.responses[0].activated).toBe(true);
    expect(res.body.responses[0].rationale).toBe("Correct.");
  });

  it("a missing package is a 409, not a recorded live-graph score", async () => {
    const db = makeDb({ compositeLibrary: [] });
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/No active composite library package/);
    expect(db.sessions[0].responses).toHaveLength(0);
  });

  it("an inactive package is a 409", async () => {
    const db = makeDb();
    db.compositeLibrary[0].active = false;
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/No active composite library package/);
    expect(db.sessions[0].responses).toHaveLength(0);
  });

  it("a version-stale package is a 409 naming the rebuild endpoint", async () => {
    const db = makeDb();
    db.evidenceModels[0].versionNumber = 2;
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/stale/);
    expect(res.body.error).toMatch(/Rebuild via POST \/api\/compositeLibrary\/rebuild\/tm1/);
    expect(db.sessions[0].responses).toHaveLength(0);
  });

  it("flipping activeParameterSetId without a rebuild takes effect on a new session, not mid-flight (D68)", async () => {
    const db = makeDb({
      sessions: [
        {
          id: "s1",
          studentId: "u1",
          taskIds: ["t1", "t2"],
          currentTaskIndex: 0,
          responses: [],
          studentModel: {},
          selectionStrategy: "fixed",
          status: "in_progress",
          isCompleted: false,
        },
        {
          id: "s2",
          studentId: "u1",
          taskIds: ["t1"],
          currentTaskIndex: 0,
          responses: [],
          studentModel: {},
          selectionStrategy: "fixed",
          status: "in_progress",
          isCompleted: false,
        },
      ],
    });
    const app = buildApp(db);
    const packageBefore = JSON.stringify(db.compositeLibrary);

    const first = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });
    expect(first.status).toBe(200);
    expect(first.body.responses[0].parameterSetId).toBe("ps1");
    expect(first.body.responses[0].parameterSource).toBe("calibrated");

    db.evidenceModels[0].statisticalModels[0].activeParameterSetId = "ps2";

    const second = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t2", itemId: "item1", rawAnswer: "opt_a" });

    expect(second.status).toBe(200);
    expect(second.body.responses[1].parameterSetId).toBe("ps1");
    expect(second.body.responses[1].parameterSource).toBe("calibrated");
    expect(second.body.responses[1].activated).toBe(true);

    const fresh = await request(app)
      .post("/api/sessions/s2/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });
    expect(fresh.status).toBe(200);
    expect(fresh.body.responses[0].parameterSetId).toBe("ps2");
    expect(fresh.body.responses[0].parameterSource).toBe("calibrated");
    expect(JSON.stringify(db.compositeLibrary)).toBe(packageBefore);
  });
});
