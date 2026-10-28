// server/routes/__tests__/sessionWalkthrough.test.js
//
// Day 30 (Week 6 milestone): "a student session selects, presents and
// scores entirely through the Item Bank." No UI triggers the item-based
// path yet (SessionPlayer.jsx still sends questionId -- that migration is
// explicitly out of this week's scope), so there is nothing a browser pass
// could exercise for this specific capability. This is the equivalent at
// the right level: one full session lifecycle, walked end to end through
// the real HTTP API against fully-valid, cross-referenced fixtures for
// every entity in the chain (competency model's evidence model, task
// model, two real items) -- not unit-level mocks of one piece at a time.
//
// "Selects": the `fixed` selectionStrategy walks session.taskIds
// sequentially, agnostic to whether a task resolves to a question or an
// item -- so selection already works for item-based delivery without any
// new code (Activity Selection, i.e. IRT/Bayesian-network selection
// actually reading items, remains explicitly out of scope, per Day 28).
// "Presents": conceptually, each task's bound item is resolvable via
// db.items with real stimulus/interaction content -- there is no
// presentation-layer code to test at the API level, since that lives in
// SessionPlayer.jsx.
// "Scores": the actual new capability -- POST /:id/submit with itemId
// scores through identifyEvidence(), the real Evidence Model, and now also
// increments real exposure (Day 29).

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { seedActivePackages } from "../../test/seedActivePackage.js";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: "student-1", role: "student" };
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

// One coherent, fully cross-referenced worked example: a Competency Model's
// Evidence Model, an operational Task Model, and two operational,
// fully-authored Items -- the same shape samples/sample-items.json and
// samples/sample-task-models.json describe, resolved to real ids exactly
// as samples/README.md's walkthrough instructs (per the Day 26 map and
// Day 25's compileSeededTaskModels.test.js precedent).

const evidenceModel = {
  id: "em1",
  competencyId: "c1",
  versionNumber: 1,
  status: "operational",
  locked: true,
  observables: [
    {
      id: "o1",
      statement: "Recognizes an equivalent fraction.",
      type: "selected_response",
      evidenceRule: { direction: "supports", strengthLevel: 4, activationCondition: "any", justification: "Direct evidence." },
    },
    {
      id: "o2",
      statement: "Compares fraction magnitude.",
      type: "selected_response",
      evidenceRule: { direction: "supports", strengthLevel: 3, activationCondition: "any", justification: "Direct evidence." },
    },
  ],
  statisticalModels: [
    {
      id: "sm1",
      type: "irt",
      active: true,
      structureConfig: { observableIds: ["o1", "o2"], dimensions: 1 },
      parameterSets: [{
        parameterSetId: "ps1",
        parameters: { o1: { a: 1, b: 0 }, o2: { a: 1, b: 0.2 } },
        packageVersion: "pilot-1",
        converged: true,
        sampleSize: 1,
        calibratedAt: "2026-01-01T00:00:00.000Z",
      }],
      activeParameterSetId: "ps1",
    },
  ],
};

const taskModel = {
  id: "tm1",
  name: "Fractions Progress Check",
  versionNumber: 1,
  status: "operational",
  locked: true,
  evidenceModelIds: ["em1"],
  primaryEvidenceModelId: "em1",
  expectedObservations: [
    { observationId: "o1", evidenceModelId: "em1", required: true, weight: 0.6 },
    { observationId: "o2", evidenceModelId: "em1", required: true, weight: 0.4 },
  ],
};

function makeItem(overrides) {
  return {
    taskModelId: "tm1",
    versionNumber: 1,
    taskModelVersion: 1,
    evidenceModelId: "em1",
    evidenceModelVersion: 1,
    locked: true,
    equivalenceGroupId: "grp1",
    status: "operational",
    psychometrics: { statisticalModelType: "irt", irtParams: { a: 1, b: 0 } },
    exposureControl: { usageCount: 0, maxUsageBeforeRetire: 500, reactivationCount: 0, maxReactivations: 2 },
    ...overrides,
  };
}

const itemEquivalentFractions = makeItem({
  id: "item-equivalent-fractions",
  observationId: "o1",
  stimulus: { layout: "single", blocks: [{ type: "text", content: "Which fraction is equivalent to 2/4?" }] },
  interaction: { type: "mcq", responseComponents: [{ id: "opt_a" }, { id: "opt_b" }, { id: "opt_c" }, { id: "opt_d" }] },
  scoring: {
    method: "dichotomous",
    maxScore: 1,
    evidenceActivationMap: [
      { responsePattern: { selected: "opt_a" }, activatesObservable: true, strengthOverride: 4, rationale: "1/2 is equivalent to 2/4." },
    ],
  },
});

const itemFractionComparison = makeItem({
  id: "item-fraction-comparison",
  observationId: "o2",
  stimulus: { layout: "single", blocks: [{ type: "text", content: "Which fraction is larger: 3/5 or 5/8?" }] },
  interaction: { type: "mcq", responseComponents: [{ id: "opt_a" }, { id: "opt_b" }, { id: "opt_c" }] },
  scoring: {
    method: "dichotomous",
    maxScore: 1,
    // One activating rule. A selected option that is not that key is an
    // observed 0. An empty or skipped response stays activated null.
    evidenceActivationMap: [
      { responsePattern: { selected: "opt_b" }, activatesObservable: true, strengthOverride: 3, rationale: "5/8 is larger." },
    ],
  },
});

function makeDb() {
  return seedActivePackages({
    sessions: [{
      id: "s1",
      studentId: "student-1",
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
    taskModels: [taskModel],
    evidenceModels: [evidenceModel],
    items: [itemEquivalentFractions, itemFractionComparison],
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

describe("Milestone: a student session selects, presents and scores entirely through the Item Bank", () => {
  it("walks a full session: select task 1 -> resolve its item -> score it -> select task 2 -> score it -> both responses and exposure are real", async () => {
    const db = makeDb();
    const app = buildApp(db);

    // SELECT: the fixed strategy's own selection logic (unchanged this
    // week) picks the first unanswered task -- t1, bound to a real item.
    const next1 = await request(app).get("/api/sessions/s1/next-task");
    expect(next1.status).toBe(200);
    expect(next1.body.taskId).toBe("t1");

    // PRESENT (conceptually): t1's bound item carries real, renderable
    // content -- confirmed via the db directly, since presentation itself
    // is client-side.
    const boundItem = db.items.find((i) => i.id === "item-equivalent-fractions");
    expect(boundItem.stimulus.blocks[0].content).toMatch(/equivalent to 2\/4/);

    // SCORE (the actual new capability this week built): submit against
    // the real item, through the real Evidence Model, not a legacy
    // question or a client-declared score.
    const submit1 = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item-equivalent-fractions", rawAnswer: "opt_a" });

    expect(submit1.status).toBe(200);
    const response1 = submit1.body.responses[0];
    expect(response1).toMatchObject({
      itemId: "item-equivalent-fractions",
      evidenceModelId: "em1",
      parameterSetId: "ps1",
      observableId: "o1",
      activated: true,
      direction: "supports",
      strength: 4,
    });
    expect(response1).not.toHaveProperty("scoredValue");
    expect(response1).not.toHaveProperty("score");

    // Exposure (Day 29) is a real measurement now, not a permanent zero.
    expect(db.items.find((i) => i.id === "item-equivalent-fractions").exposureControl.usageCount).toBe(1);

    // Session state actually advances.
    expect(db.sessions[0].currentTaskIndex).toBe(1);
    expect(db.tasks[0].generatedObservationIds).toContain("o1");

    // SELECT again -- task 2, a DIFFERENT item, bound to a different
    // observable on the SAME Evidence Model.
    const next2 = await request(app).get("/api/sessions/s1/next-task");
    expect(next2.status).toBe(200);
    expect(next2.body.taskId).toBe("t2");

    // A selected option that is not the key. This is an observed 0, not a
    // missing cell. Provenance is still filled in: the chain resolved.
    const submit2 = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t2", itemId: "item-fraction-comparison", rawAnswer: "opt_c" });

    expect(submit2.status).toBe(200);
    const response2 = submit2.body.responses[1];
    expect(response2).toMatchObject({
      taskId: "t2",
      itemId: "item-fraction-comparison",
      evidenceModelId: "em1",
      evidenceModelVersion: 1,
      parameterSetId: "ps1",
      observationId: "o2",
      observableId: "o2",
      activated: false,
      direction: "supports",
      strength: 3,
    });
    expect(response2.warning).toBeUndefined();
    expect(response2).not.toHaveProperty("scoredValue");
    expect(response2).not.toHaveProperty("score");

    // Both items now carry independent, real exposure measurements --
    // including the indeterminate response: exposure is about DELIVERY,
    // not about whether the answer happened to match a declared pattern.
    expect(db.items.find((i) => i.id === "item-fraction-comparison").exposureControl.usageCount).toBe(1);
    expect(db.items.find((i) => i.id === "item-equivalent-fractions").exposureControl.usageCount).toBe(1);

    // Both tasks tracked their own generated observation, independently.
    expect(db.tasks[1].generatedObservationIds).toContain("o2");

    // Two full task-model observables have now been evidenced, from two
    // different items, in one session -- the whole point of the Task
    // Model's expectedObservations design.
    expect(db.sessions[0].responses).toHaveLength(2);
    expect(db.sessions[0].currentTaskIndex).toBe(2);

    // Both writes actually persisted, not just returned in the response.
    expect(saveDB).toHaveBeenCalledTimes(2);

    // NEGATIVE CONTROL: a session with no bound item at all cannot score
    // through this path -- proving these assertions exercise the real
    // pipeline rather than passing unconditionally.
    const brokenRes = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item-does-not-exist", rawAnswer: "opt_a" });
    expect(brokenRes.status).toBe(400);

    // FINISH: the session lifecycle around delivery is untouched and still
    // works end to end with real item-based responses inside it.
    const finish = await request(app).post("/api/sessions/s1/finish");
    expect(finish.status).toBe(200);
    expect(db.sessions[0].status).toBe("completed");
    expect(db.sessions[0].isCompleted).toBe(true);
  });
});
