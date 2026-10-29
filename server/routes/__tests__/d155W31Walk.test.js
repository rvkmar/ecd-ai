// server/routes/__tests__/d155W31Walk.test.js
//
// D155 / W31. Generate the D120 ten-spec family from a confirmed
// template, cite one spec on an authored item, confirm the item, bind a
// task, deliver a session, and score through the Evidence Model.
// AIG stays unmounted. Authored POST /api/taskSpecs stays 405.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { seedActivePackages } from "../../test/seedActivePackage.js";

let currentRole = "admin";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: "u1", role: currentRole };
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
const { default: templatesRouter } = await import("../templatesRoutes.js");
const { default: itemsRouter } = await import("../itemsRoutes.js");
const { default: tasksRouter } = await import("../tasksRoutes.js");
const { default: sessionsRouter } = await import("../sessionRoutes.js");
const { default: taskSpecsRouter } = await import("../taskSpecsRoutes.js");

const TEN_SPEC_SETTINGS = [
  {
    taskModelVariableId: "tmv-bloom",
    variation: "varying",
    required: true,
    allowedValues: ["remember", "understand", "apply", "analyze", "evaluate"],
  },
  {
    taskModelVariableId: "tmv-register",
    variation: "varying",
    required: true,
    allowedValues: ["formal", "informal"],
  },
  {
    taskModelVariableId: "tmv-stimulus",
    variation: "fixed",
    required: true,
    fixedValue: "static",
  },
];

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/templates", templatesRouter);
  app.use("/api/items", itemsRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/sessions", sessionsRouter);
  app.use("/api/taskSpecs", taskSpecsRouter);
  return app;
}

function seedDb(overrides = {}) {
  const db = {
    competencyModels: [{ id: "cm1", name: "CM", status: "confirmed", locked: true }],
    competencies: [{ id: "c1", name: "Attr", modelId: "cm1" }],
    evidenceModels: [
      {
        id: "em1",
        name: "EM",
        competencyId: "c1",
        status: "operational",
        locked: true,
        versionNumber: 1,
        observables: [
          {
            id: "o1",
            statement: "Selects the keyed option",
            type: "selected_response",
            evidenceRule: {
              direction: "supports",
              strengthLevel: 4,
              activationCondition: "any",
              justification: "x",
            },
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
      },
    ],
    taskModelVariables: [
      {
        id: "tmv-bloom",
        name: "Cognitive demand",
        type: "categorical",
        valueSet: "bloomLevel",
      },
      {
        id: "tmv-register",
        name: "Scenario register",
        type: "categorical",
        possibleValues: [
          { value: "formal", label: "Formal" },
          { value: "informal", label: "Informal" },
        ],
      },
      {
        id: "tmv-stimulus",
        name: "Stimulus policy",
        type: "categorical",
        valueSet: "stimulusPolicy",
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
        expectedObservations: [
          { observationId: "o1", evidenceModelId: "em1", required: true, weight: 1 },
        ],
        taskModelVariableSettings: TEN_SPEC_SETTINGS,
        itemMappings: [],
        selectedItemIds: [],
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
        accessibility: { profile: "default" },
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
    taskSpecs: [],
    items: [],
    tasks: [],
    sessions: [],
    policies: [{ id: "p-fixed", type: "fixed", name: "Fixed order" }],
    students: [{ id: "u1", name: "Walk student" }],
    ...overrides,
  };
  return db;
}

beforeEach(() => {
  currentRole = "admin";
  vi.clearAllMocks();
});

describe("D155 W31 walk", () => {
  it("generates ten specs, cites one on an item, delivers, and scores", async () => {
    const db = seedDb();
    loadDB.mockReturnValue(db);
    saveDB.mockImplementation(() => {});
    const app = makeApp();

    const generated = await request(app)
      .post("/api/templates/tpl1/generate-task-specs")
      .send({});
    expect(generated.status).toBe(201);
    expect(generated.body.count).toBe(10);
    expect(generated.body.specs).toHaveLength(10);

    const keys = new Set();
    for (const spec of generated.body.specs) {
      expect(spec.templateId).toBe("tpl1");
      const bloom = spec.tmvAssignment.find((a) => a.taskModelVariableId === "tmv-bloom");
      const register = spec.tmvAssignment.find(
        (a) => a.taskModelVariableId === "tmv-register"
      );
      const stimulus = spec.tmvAssignment.find(
        (a) => a.taskModelVariableId === "tmv-stimulus"
      );
      expect(stimulus.value).toBe("static");
      keys.add(`${bloom.value}|${register.value}`);
    }
    expect(keys.size).toBe(10);

    const authored = await request(app)
      .post("/api/taskSpecs/")
      .send({ templateId: "tpl1", tmvAssignment: [] });
    expect(authored.status).toBe(405);

    const specId = generated.body.specs[0].id;
    const created = await request(app)
      .post("/api/items")
      .send({
        name: "W31 remember · formal",
        taskModelId: "tm1",
        observationId: "o1",
        taskSpecId: specId,
        equivalenceGroupId: "grp-w31",
        stimulus: { layout: "single", blocks: [{ type: "text", content: "2/4 = ?" }] },
        interaction: {
          type: "mcq",
          responseComponents: [
            { id: "opt_a", label: "1/2", value: "opt_a", isCorrect: true },
            { id: "opt_b", label: "2/8", value: "opt_b" },
          ],
          config: {},
        },
        scoring: {
          method: "dichotomous",
          maxScore: 1,
          evidenceActivationMap: [
            {
              responsePattern: { selected: "opt_a" },
              activatesObservable: true,
              score: 1,
              strengthOverride: 4,
              rationale: "Keyed option.",
            },
          ],
        },
        learningDomain: "cognitive",
        metadata: { subject: "Maths" },
        psychometrics: {
          statisticalModelType: "irt",
          calibrationStatus: "pilot",
          irtParams: { a: 1, b: 0 },
        },
      });
    expect(created.status).toBe(201);
    expect(created.body.taskSpecId).toBe(specId);
    expect(created.body.evidenceModelId).toBe("em1");
    const itemId = created.body.id;

    const unknown = await request(app)
      .post("/api/items")
      .send({ taskModelId: "tm1", observationId: "o1", taskSpecId: "tspec-missing" });
    expect(unknown.status).toBe(400);
    expect(JSON.stringify(unknown.body)).toMatch(/does not match a generated task spec/);

    db.templates.push({
      id: "tpl-other",
      name: "Other",
      status: "confirmed",
      competencyModelId: "cm1",
      evidenceModelId: "em1",
      taskModelId: "tm-other",
      presentationModelId: "pm1",
    });
    db.taskSpecs.push({
      id: "tspec-other",
      templateId: "tpl-other",
      tmvAssignment: [{ taskModelVariableId: "tmv-bloom", value: "remember" }],
      stale: false,
    });
    const mismatched = await request(app)
      .post("/api/items")
      .send({ taskModelId: "tm1", observationId: "o1", taskSpecId: "tspec-other" });
    expect(mismatched.status).toBe(400);
    expect(JSON.stringify(mismatched.body)).toMatch(/not this item's/);

    const reviewed = await request(app)
      .patch(`/api/items/${itemId}/lifecycle`)
      .send({ nextStatus: "reviewed" });
    expect(reviewed.status).toBe(200);
    const confirmed = await request(app)
      .patch(`/api/items/${itemId}/lifecycle`)
      .send({ nextStatus: "confirmed" });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.locked).toBe(true);
    expect(confirmed.body.taskSpecId).toBe(specId);

    seedActivePackages(db);

    const task = await request(app)
      .post("/api/tasks")
      .send({ taskModelId: "tm1", itemId });
    expect(task.status).toBe(201);
    const taskId = task.body.id;

    db.sessions.push({
      id: "s-w31",
      studentId: "u1",
      studentIds: ["u1"],
      taskIds: [taskId],
      currentTaskIndex: 0,
      responses: [],
      studentModel: {},
      selectionStrategy: "fixed",
      nextTaskPolicy: { policyId: "p-fixed" },
      status: "in_progress",
      isCompleted: false,
    });

    const scored = await request(app)
      .post("/api/sessions/s-w31/submit")
      .send({ taskId, itemId, rawAnswer: "opt_a" });
    expect(scored.status).toBe(200);
    const response = scored.body.responses[0];
    expect(response).toMatchObject({
      taskId,
      itemId,
      evidenceModelId: "em1",
      observationId: "o1",
      activated: true,
    });
    expect(response).not.toHaveProperty("scoredValue");
  });
});
