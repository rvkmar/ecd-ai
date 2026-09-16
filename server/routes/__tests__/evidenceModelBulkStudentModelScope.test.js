// server/routes/__tests__/evidenceModelBulkStudentModelScope.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: "u1", role: "admin" };
    next();
  },
  authorizeRole: () => (_req, _res, next) => next(),
}));

vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: vi.fn(),
  saveDB: vi.fn(),
}));

import { loadDB, saveDB } from "../../../src/utils/db-server.js";
import evidenceModelsRoutes from "../evidenceModels.js";

function makeApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/api/evidenceModels", evidenceModelsRoutes);
  return app;
}

function emRow(name) {
  return {
    name: `${name} EM`,
    competencyName: name,
    claimStatement:
      "The student can demonstrate the competency across varied stems with reasoning sufficient to support the claim at mastery level.",
    warrants: [
      {
        id: "w1",
        reasoningStatement: "A warrant that is long enough to pass draft authoring checks for this fixture.",
        cognitiveAttribute: "Attr",
        performanceCondition: "Given a stem.",
        limitationClause: "Limited scope.",
      },
    ],
    observables: [
      {
        id: "o1",
        statement: "The learner selects the keyed response.",
        type: "selected_response",
        warrantId: "w1",
        boundaryNote: "Boundary.",
      },
    ],
    evidenceRules: [
      {
        id: "er1",
        observableId: "o1",
        direction: "supports",
        strengthLevel: 3,
        activationCondition: "Keyed.",
        justification: "Supports the warrant.",
      },
    ],
    statisticalModels: [
      {
        id: "sm1",
        type: "irt",
        subtype: "1pl",
        active: true,
        structureConfig: { observableIds: ["o1"], dimensions: 1 },
        parameterSets: [],
        activeParameterSetId: null,
      },
    ],
  };
}

let db;

beforeEach(() => {
  db = {
    competencyModels: [
      { id: "cm_a", name: "Model A", status: "draft", locked: false, versionNumber: 1 },
      { id: "cm_b", name: "Model B", status: "draft", locked: false, versionNumber: 1 },
    ],
    competencies: [
      { id: "c_a", modelId: "cm_a", name: "Force Concept Mastery", variableType: "binary" },
      { id: "c_b", modelId: "cm_b", name: "Force Concept Mastery", variableType: "binary" },
    ],
    evidenceModels: [],
    qMatrixModels: [],
  };
  loadDB.mockReturnValue(db);
  saveDB.mockClear();
});

describe("POST /api/evidenceModels/bulk with Student Model scope", () => {
  it("scopes competencyName to the given competencyModelId", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/evidenceModels/bulk")
      .send({
        competencyModelId: "cm_b",
        evidenceModels: [emRow("Force Concept Mastery")],
      });

    expect(res.status).toBe(207);
    expect(res.body.created).toBe(1);
    expect(res.body.failed).toBe(0);
    expect(db.evidenceModels[0].competencyId).toBe("c_b");
  });

  it("fails ambiguous competencyName without a Student Model id", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/evidenceModels/bulk")
      .send([emRow("Force Concept Mastery")]);

    expect(res.body.created).toBe(0);
    expect(res.body.failed).toBe(1);
    expect(res.body.results[0].error).toMatch(/matches 2 competencies/i);
  });

  it("rejects an unknown Student Model id", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/evidenceModels/bulk")
      .send({
        competencyModelId: "cm_missing",
        evidenceModels: [emRow("Force Concept Mastery")],
      });

    expect(res.body.created).toBe(0);
    expect(res.body.results[0].error).toMatch(/was not found/i);
  });
});
