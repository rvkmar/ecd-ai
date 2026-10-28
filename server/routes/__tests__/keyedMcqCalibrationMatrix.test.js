// A keyed dichotomous MCQ with a supports evidence rule scores 1 on the
// key and 0 on any other declared option. The live calibration matrix
// must contain those 0s. An empty or skipped response stays null.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { seedActivePackages } from "../../test/seedActivePackage.js";
import { assessLiveResponseMatrix } from "../../r/liveResponseMatrix.js";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: "admin-1", role: "admin" };
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
const { default: router } = await import("../sessionRoutes.js");

function keyedItem(id, observationId) {
  return {
    id,
    taskModelId: "tm1",
    versionNumber: 1,
    taskModelVersion: 1,
    evidenceModelId: "em1",
    evidenceModelVersion: 1,
    observationId,
    locked: true,
    status: "confirmed",
    stimulus: { layout: "single", blocks: [{ type: "text", content: `Stem ${id}` }] },
    interaction: {
      type: "mcq",
      responseComponents: [
        { id: "opt_a", label: "Key", isCorrect: true },
        { id: "opt_b", label: "Distractor", isCorrect: false },
        { id: "opt_c", label: "Other", isCorrect: false },
      ],
    },
    scoring: {
      method: "dichotomous",
      maxScore: 1,
      evidenceActivationMap: [
        {
          responsePattern: { selected: "opt_a" },
          activatesObservable: true,
          score: 1,
          rationale: "The keyed option activates the observable.",
        },
      ],
    },
  };
}

function makeDb() {
  return seedActivePackages({
    sessions: [
      {
        id: "s1",
        studentId: "stud-1",
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
        studentId: "stud-2",
        taskIds: ["t1", "t2"],
        currentTaskIndex: 0,
        responses: [],
        studentModel: {},
        selectionStrategy: "fixed",
        status: "in_progress",
        isCompleted: false,
      },
    ],
    tasks: [
      { id: "t1", taskModelId: "tm1", generatedObservationIds: [], generatedEvidenceIds: [] },
      { id: "t2", taskModelId: "tm1", generatedObservationIds: [], generatedEvidenceIds: [] },
    ],
    taskModels: [{
      id: "tm1",
      name: "Plant parts",
      versionNumber: 1,
      status: "operational",
      locked: true,
      evidenceModelIds: ["em1"],
      primaryEvidenceModelId: "em1",
      expectedObservations: [
        { observationId: "o1", evidenceModelId: "em1", required: true, weight: 1 },
        { observationId: "o2", evidenceModelId: "em1", required: true, weight: 1 },
      ],
    }],
    evidenceModels: [{
      id: "em1",
      versionNumber: 1,
      status: "confirmed",
      locked: true,
      observables: [
        {
          id: "o1",
          type: "selected_response",
          evidenceRule: {
            direction: "supports",
            strengthLevel: 4,
            activationCondition: "Keyed option selected.",
            justification: "Naming the part supports the claim.",
          },
        },
        {
          id: "o2",
          type: "selected_response",
          evidenceRule: {
            direction: "supports",
            strengthLevel: 3,
            activationCondition: "Keyed option selected.",
            justification: "Naming the function supports the claim.",
          },
        },
      ],
      statisticalModels: [{
        id: "sm1",
        type: "ctt",
        active: true,
        structureConfig: { observableIds: ["o1", "o2"] },
        parameterSets: [],
      }],
    }],
    items: [keyedItem("item-a", "o1"), keyedItem("item-b", "o2")],
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

describe("keyed MCQ wrong answers in the live response matrix", () => {
  it("stores 0 for a wrong option and null for a skip, then builds both into the matrix", async () => {
    const db = makeDb();
    const app = buildApp(db);

    const right = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item-a", rawAnswer: "opt_a" });
    expect(right.status).toBe(200);
    expect(right.body.responses[0].activated).toBe(true);

    const wrong = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t2", itemId: "item-b", rawAnswer: "opt_c" });
    expect(wrong.status).toBe(200);
    expect(wrong.body.responses[1].activated).toBe(false);
    expect(wrong.body.responses[1].warning).toBeUndefined();
    expect(wrong.body.responses[1].exposureNote).toMatch(/does not increment usageCount/);
    expect(db.items.find((item) => item.id === "item-b").exposureControl?.usageCount || 0).toBe(0);

    const alsoWrong = await request(app)
      .post("/api/sessions/s2/submit")
      .send({ taskId: "t1", itemId: "item-a", rawAnswer: "opt_b" });
    expect(alsoWrong.status).toBe(200);
    expect(alsoWrong.body.responses[0].activated).toBe(false);

    const skipped = await request(app)
      .post("/api/sessions/s2/submit")
      .send({ taskId: "t2", itemId: "item-b", rawAnswer: null });
    expect(skipped.status).toBe(200);
    expect(skipped.body.responses[1].activated).toBeNull();

    expect((await request(app).post("/api/sessions/s1/finish")).status).toBe(200);
    expect((await request(app).post("/api/sessions/s2/finish")).status).toBe(200);

    const assessed = assessLiveResponseMatrix(db, {
      evidenceModelId: "em1",
      statisticalModelId: "sm1",
      kind: "ctt-statistics",
    });
    expect(assessed.ok).toBe(true);
    expect(assessed.request.responseMatrix.itemIds).toEqual(["item-a", "item-b"]);
    expect(assessed.request.responseMatrix.personIds).toEqual(["stud-1", "stud-2"]);
    expect(assessed.request.responseMatrix.data).toEqual([
      [1, 0],
      [0, null],
    ]);
  });
});
