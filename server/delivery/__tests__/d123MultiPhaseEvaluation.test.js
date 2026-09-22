// server/delivery/__tests__/d123MultiPhaseEvaluation.test.js
//
// D123 exit check: a two-phase procedure runs its automated phase, holds,
// and completes on human input; a session with a pending human phase
// reports its state honestly rather than showing a provisional score as final.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { identifyEvidence } from "../evidenceIdentification.js";
import { seedActivePackages } from "../../test/seedActivePackage.js";
import { buildCompositeLibrary } from "../../compositeLibrary/builder.js";
import { accumulateEvidence } from "../evidenceAccumulation.js";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = req.headers["x-test-role"]
      ? { id: "staff1", role: req.headers["x-test-role"] }
      : { id: "u1", role: "student" };
    next();
  },
  authorizeRole: (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.sendStatus(403);
    next();
  },
}));

vi.mock("../../../src/utils/db-server.js", () => {
  const loadDB = vi.fn();
  return {
    loadDB,
    saveDB: vi.fn(),
    finishSession: vi.fn(),
    readRawDB: (...args) => loadDB(...args),
  };
});

const { loadDB, saveDB } = await import("../../../src/utils/db-server.js");
const { default: router } = await import("../../routes/sessionRoutes.js");

const evidenceModel = {
  id: "em1",
  versionNumber: 1,
  observables: [
    {
      id: "o1",
      type: "selected_response",
      evidenceRule: {
        direction: "supports",
        strengthLevel: 4,
        activationCondition: "any",
        justification: "Two-phase key then human.",
      },
    },
  ],
  evaluationProcedures: [
    {
      id: "ep1",
      observableId: "o1",
      workProductType: "selected_response",
      method: "key",
      description: "Automated key then human confirmation of the Observable.",
      artifact: {
        kind: "key",
        correctPatterns: [{ selected: "opt_a" }],
      },
      phases: [
        { order: 1, kind: "automated" },
        { order: 2, kind: "human", adjudicationRule: "human_wins" },
      ],
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
      ],
      activeParameterSetId: "ps1",
    },
  ],
};

const taskModel = {
  id: "tm1",
  versionNumber: 1,
  status: "operational",
  locked: true,
  evidenceModelIds: ["em1"],
  expectedObservations: [
    { observationId: "o1", evidenceModelId: "em1", required: true, weight: 1 },
  ],
};

const item = {
  id: "item1",
  taskModelId: "tm1",
  versionNumber: 1,
  taskModelVersion: 1,
  status: "confirmed",
  observationId: "o1",
  evidenceModelId: "em1",
  evidenceModelVersion: 1,
  interaction: {
    type: "mcq",
    responseComponents: [{ id: "opt_a" }, { id: "opt_b" }],
  },
  // Empty map → Identification uses the baked evaluationProcedure artifact.
  scoring: { method: "dichotomous", evidenceActivationMap: [] },
};

function makeDb() {
  return seedActivePackages({
    sessions: [
      {
        id: "s1",
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
    tasks: [
      {
        id: "t1",
        taskModelId: "tm1",
        generatedObservationIds: [],
        generatedEvidenceIds: [],
      },
    ],
    taskModels: [taskModel],
    evidenceModels: [evidenceModel],
    items: [item],
    compositeLibrary: [],
  });
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

describe("D123 exit check — multi-phase evaluation", () => {
  it("bakes phases onto the composite library evaluationProcedure", () => {
    const db = {
      evidenceModels: [evidenceModel],
      taskModels: [taskModel],
      items: [item],
      compositeLibrary: [],
    };
    const { record } = buildCompositeLibrary(taskModel, db);
    const proc = record.items[0].evaluationProcedure;
    expect(proc.phases).toEqual([
      { order: 1, kind: "automated" },
      { order: 2, kind: "human", adjudicationRule: "human_wins" },
    ]);
  });

  it("Identification holds after automated phase (activated null, not provisional as final)", () => {
    const db = makeDb();
    const result = identifyEvidence({ selected: "opt_a" }, item, db, {
      taskModelId: "tm1",
    });
    expect(result.refused).not.toBe(true);
    expect(result.evaluationStatus).toBe("pending_human");
    expect(result.activated).toBeNull();
    expect(result.provisionalActivated).toBe(true);
    expect(result.pendingPhase.kind).toBe("human");
  });

  it("Accumulation skips pending_human responses (no provisional score as posterior)", () => {
    const db = makeDb();
    const id = identifyEvidence({ selected: "opt_a" }, item, db, {
      taskModelId: "tm1",
    });
    const session = {
      ...db.sessions[0],
      responses: [
        {
          taskId: "t1",
          itemId: "item1",
          observationId: id.observationId,
          observableId: id.observableId,
          activated: id.activated,
          direction: id.direction,
          strength: id.strength,
          evaluationStatus: id.evaluationStatus,
          provisionalActivated: id.provisionalActivated,
          evidenceModelId: "em1",
          parameterSetId: "ps1",
          parameterSource: "calibrated",
        },
      ],
    };
    const acc = accumulateEvidence(session, db);
    // No boolean activated → indeterminate; provisional never enters estimate.
    const posts = Array.isArray(acc.posteriors)
      ? acc.posteriors
      : Object.values(acc.posteriors || {});
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((p) => (p.responsesUsed ?? 0) === 0)).toBe(true);
  });

  it("submit → pending_human on GET; human-rating completes and reports honestly", async () => {
    const db = makeDb();
    const app = buildApp(db);

    const submit = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });
    expect(submit.status).toBe(200);
    const scored = submit.body.responses[0];
    expect(scored.evaluationStatus).toBe("pending_human");
    expect(scored.activated).toBeNull();
    expect(scored.provisionalActivated).toBe(true);
    expect(submit.body.pendingHumanRatings).toHaveLength(1);
    expect(submit.body.pendingHumanRatings[0].activated).toBeNull();

    const get = await request(app).get("/api/sessions/s1");
    expect(get.status).toBe(200);
    expect(get.body.responses[0].activated).toBeNull();
    expect(get.body.pendingHumanRatings[0].evaluationStatus).toBe("pending_human");
    // Honest: activated stays null; provisional is not on the pending row (D124 blinding).
    expect(get.body.pendingHumanRatings[0].activated).toBeNull();
    expect(get.body.pendingHumanRatings[0].provisionalActivated).toBeUndefined();

    const studentBlocked = await request(app)
      .post("/api/sessions/s1/human-rating")
      .send({ responseIndex: 0, activated: false });
    expect(studentBlocked.status).toBe(403);

    const rated = await request(app)
      .post("/api/sessions/s1/human-rating")
      .set("x-test-role", "teacher")
      .send({
        responseIndex: 0,
        activated: false,
        rationale: "Human disagrees with automated key.",
      });
    expect(rated.status).toBe(200);
    expect(rated.body.evaluationStatus).toBe("complete");
    expect(rated.body.activated).toBe(false);
    expect(rated.body.pendingHumanRatings).toEqual([]);
    expect(db.sessions[0].responses[0].evaluationStatus).toBe("complete");
    expect(db.sessions[0].responses[0].activated).toBe(false);
  });
});
