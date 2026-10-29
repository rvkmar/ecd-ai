// R4: one work product can yield several observables.
//
// A second evaluation procedure that shares workProductId is baked onto
// the item's package entry when no other item already owns that
// observation. Identification returns today's primary object, plus
// identifications[] only when there is more than one. Submit stores one
// response row per observable. Accumulation scores distinct Q-matrix rows.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { buildCompositeLibrary, isCompositeLibraryStale } from "../../compositeLibrary/builder.js";
import { identifyEvidence } from "../evidenceIdentification.js";
import { accumulateAttributeMastery } from "../attributeAccumulation.js";
import { placeAttempts } from "../deliveryAdministration.js";
import { seedActivePackages } from "../../test/seedActivePackage.js";

const scoreResponse = (r) => {
  if (r.activated !== true && r.activated !== false) return { u: null, reason: "indeterminate" };
  if (r.direction === "supports") return { u: r.activated ? 1 : 0 };
  return { u: null, reason: "unknown-direction" };
};

const workProduct = { id: "wp-essay", name: "Essay", type: "constructed_text" };

const evidenceModel = {
  id: "em-r4",
  versionNumber: 1,
  competencyId: "c1",
  observables: [
    {
      id: "o-content",
      type: "constructed_response",
      evidenceRule: { direction: "supports", strengthLevel: 4, activationCondition: "any", justification: "Content." },
    },
    {
      id: "o-grammar",
      type: "constructed_response",
      evidenceRule: { direction: "supports", strengthLevel: 3, activationCondition: "any", justification: "Grammar." },
    },
  ],
  evaluationProcedures: [
    {
      id: "ep-content",
      observableId: "o-content",
      workProductId: "wp-essay",
      workProductType: "constructed_text",
      method: "key",
      description: "Content key.",
      artifact: { kind: "key", correctPatterns: [{ selected: "opt_a" }] },
    },
    {
      id: "ep-grammar",
      observableId: "o-grammar",
      workProductId: "wp-essay",
      workProductType: "constructed_text",
      method: "key",
      description: "Grammar key.",
      artifact: { kind: "key", correctPatterns: [{ selected: "opt_b" }] },
    },
  ],
};

const taskModel = {
  id: "tm-r4",
  versionNumber: 1,
  status: "operational",
  locked: true,
  evidenceModelIds: ["em-r4"],
  expectedObservations: [
    { observationId: "o-content", evidenceModelId: "em-r4", required: true, weight: 0.6 },
    { observationId: "o-grammar", evidenceModelId: "em-r4", required: true, weight: 0.4 },
  ],
};

const item = {
  id: "item-essay",
  taskModelId: "tm-r4",
  taskModelVersion: 1,
  status: "confirmed",
  observationId: "o-content",
  evidenceModelId: "em-r4",
  evidenceModelVersion: 1,
  interaction: { type: "constructed", workProductId: "wp-essay", responseComponents: [] },
  scoring: { method: "dichotomous", evidenceActivationMap: [] },
};

function fixtureDb(overrides = {}) {
  return seedActivePackages({
    workProducts: [workProduct],
    evidenceModels: [evidenceModel],
    taskModels: [taskModel],
    items: [item],
    compositeLibrary: [],
    ...overrides,
  });
}

describe("R4 — package bake", () => {
  it("bakes the sibling observation onto the one item that captures the work product", () => {
    const { record } = buildCompositeLibrary(taskModel, {
      items: [item],
      evidenceModels: [evidenceModel],
      workProducts: [workProduct],
    });
    const entry = record.items[0];
    expect(entry.observationId).toBe("o-content");
    expect(entry.additionalObservations.map((row) => row.observationId)).toEqual(["o-grammar"]);
  });

  it("marks the package stale when a sibling procedure changes", () => {
    const { record } = buildCompositeLibrary(taskModel, {
      items: [item],
      evidenceModels: [evidenceModel],
    });
    const revised = {
      ...evidenceModel,
      evaluationProcedures: evidenceModel.evaluationProcedures.map((proc) =>
        proc.id === "ep-grammar" ? { ...proc, description: "Grammar key, edited." } : proc
      ),
    };
    const { stale, reasons } = isCompositeLibraryStale(record, {
      taskModel,
      evidenceModels: [revised],
      items: [item],
    });
    expect(stale).toBe(true);
    expect(reasons.join(" ")).toMatch(/additional observations/);
  });
});

describe("R4 — identifyEvidence", () => {
  it("keeps a single-observable result unchanged (no identifications list)", () => {
    const solo = {
      ...evidenceModel,
      evaluationProcedures: [evidenceModel.evaluationProcedures[0]],
    };
    const db = fixtureDb({ evidenceModels: [solo] });
    const result = identifyEvidence({ selected: "opt_a" }, item, db, { taskModelId: "tm-r4" });
    expect(result.refused).toBeFalsy();
    expect(result.observationId).toBe("o-content");
    expect(result.activated).toBe(true);
    expect(result.identifications).toBeUndefined();
  });

  it("returns two identifications from one work product, each from its own procedure", () => {
    const db = fixtureDb();
    const result = identifyEvidence({ selected: "opt_a" }, item, db, { taskModelId: "tm-r4" });
    expect(result.refused).toBeFalsy();
    expect(result.observationId).toBe("o-content");
    expect(result.activated).toBe(true);
    expect(result.identifications).toHaveLength(2);
    expect(result.identifications.map((row) => row.observationId)).toEqual(["o-content", "o-grammar"]);
    expect(result.identifications[0].activated).toBe(true);
    expect(result.identifications[1].activated).toBe(false);
    expect(result.identifications[1].evaluationProcedureId).toBe("ep-grammar");
  });
});

describe("R4 — accumulation against distinct Q-matrix rows", () => {
  it("scores both observables from one item against their own Q-rows", () => {
    const warnings = [];
    const posteriors = accumulateAttributeMastery({
      evidenceModelId: "em-r4",
      parameterSetId: "ps1",
      family: "dina",
      evidenceModel: { id: "em-r4", competencyId: "c1" },
      statisticalModel: { id: "sm1", type: "dina", structureConfig: { qMatrixId: "qm-r4" } },
      parameterSet: { parameterSetId: "ps1", parameters: { "item-essay": { slip: 0.1, guess: 0.2 } } },
      group: [
        { itemId: "item-essay", observableId: "o-content", evidenceModelId: "em-r4", activated: true, direction: "supports" },
        { itemId: "item-essay", observableId: "o-grammar", evidenceModelId: "em-r4", activated: false, direction: "supports" },
      ],
      db: {
        qMatrixModels: [{
          id: "qm-r4",
          competencyModelId: "cm1",
          attributeIds: ["attr-content", "attr-grammar"],
          entries: [
            { observableId: "o-content", evidenceModelId: "em-r4", itemId: "item-essay", attributeId: "attr-content" },
            { observableId: "o-grammar", evidenceModelId: "em-r4", itemId: "item-essay", attributeId: "attr-grammar" },
          ],
        }],
        competencyModels: [{
          id: "cm1",
          smVariables: [
            { id: "attr-content", type: "binary", priorDistribution: { family: "bernoulli", params: { p: 0.5 } } },
            { id: "attr-grammar", type: "binary", priorDistribution: { family: "bernoulli", params: { p: 0.5 } } },
          ],
        }],
      },
      warnings,
      scoreResponse,
    });

    expect(posteriors).toHaveLength(2);
    expect(posteriors.every((p) => p.supported)).toBe(true);
    const content = posteriors.find((p) => p.smvId === "attr-content");
    const grammar = posteriors.find((p) => p.smvId === "attr-grammar");
    expect(content.responsesUsed).toBe(1);
    expect(grammar.responsesUsed).toBe(1);
    expect(content.estimate).toBeGreaterThan(0.5);
    expect(grammar.estimate).toBeLessThan(0.5);
  });
});

describe("R4 — placeAttempts", () => {
  it("replaces every response row for the task, not only the first", () => {
    const session = {
      responses: [
        { taskId: "t1", observationId: "o-content", attempt: 1 },
        { taskId: "t1", observationId: "o-grammar", attempt: 1 },
        { taskId: "t2", observationId: "o-other", attempt: 1 },
      ],
    };
    const placed = placeAttempts(
      session,
      "t1",
      [
        { taskId: "t1", observationId: "o-content", activated: false },
        { taskId: "t1", observationId: "o-grammar", activated: true },
      ],
      { action: "replace", nextAttempt: 2 }
    );
    expect(placed).toBe("replace");
    expect(session.responses).toHaveLength(3);
    expect(session.responses.filter((row) => row.taskId === "t1").map((row) => row.attempt)).toEqual([2, 2]);
    expect(session.responses.find((row) => row.taskId === "t2").observationId).toBe("o-other");
  });
});

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
const { default: sessionRouter } = await import("../../routes/sessionRoutes.js");

describe("R4 — submit stores one row per observable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes two responses, one attempt, and one exposure increment", async () => {
    const db = fixtureDb({
      sessions: [{
        id: "s-r4",
        studentId: "student-1",
        taskIds: ["t-essay"],
        currentTaskIndex: 0,
        responses: [],
        studentModel: {},
        selectionStrategy: "fixed",
        status: "in_progress",
        isCompleted: false,
      }],
      tasks: [{ id: "t-essay", taskModelId: "tm-r4", generatedObservationIds: [], generatedEvidenceIds: [] }],
      items: [{
        ...item,
        status: "operational",
        locked: true,
        versionNumber: 1,
        psychometrics: { statisticalModelType: "irt", irtParams: { a: 1, b: 0 } },
        exposureControl: { usageCount: 0, maxUsageBeforeRetire: 500, reactivationCount: 0, maxReactivations: 2 },
      }],
      evidenceModels: [{
        ...evidenceModel,
        status: "operational",
        locked: true,
        statisticalModels: [{
          id: "sm-irt",
          type: "irt",
          active: true,
          structureConfig: { observableIds: ["o-content", "o-grammar"], dimensions: 1 },
          parameterSets: [{
            parameterSetId: "ps-r4",
            parameters: {
              "o-content": { a: 1, b: 0 },
              "o-grammar": { a: 1, b: 0.2 },
            },
            packageVersion: "pilot-1",
            converged: true,
            sampleSize: 1,
            calibratedAt: "2026-01-01T00:00:00.000Z",
          }],
          activeParameterSetId: "ps-r4",
        }],
      }],
      competencyModels: [{
        id: "c1",
        smVariables: [
          { id: "theta", type: "continuous", priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } } },
        ],
      }],
    });

    loadDB.mockReturnValue(db);
    saveDB.mockImplementation(() => {});
    const app = express();
    app.use(express.json());
    app.use("/api/sessions", sessionRouter);

    const submit = await request(app)
      .post("/api/sessions/s-r4/submit")
      .send({ taskId: "t-essay", itemId: "item-essay", rawAnswer: "opt_a" });

    expect(submit.status).toBe(200);
    const rows = submit.body.responses;
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.observationId)).toEqual(["o-content", "o-grammar"]);
    expect(rows.map((row) => row.activated)).toEqual([true, false]);
    expect(rows.every((row) => row.attempt === 1 || row.attempt == null)).toBe(true);
    expect(db.tasks[0].generatedObservationIds).toEqual(["o-content", "o-grammar"]);
    expect(db.sessions[0].currentTaskIndex).toBe(1);
  });
});
