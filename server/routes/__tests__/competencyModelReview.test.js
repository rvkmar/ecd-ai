import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: "u1", username: "admin1", role: "admin" };
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
}));

import { loadDB, saveDB } from "../../../src/utils/db-server.js";
import competencyModelsRouter from "../competencyModels.js";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/competencies", competencyModelsRouter);
  return app;
}

function binaryCompetency(states) {
  return {
    id: "c1",
    modelId: "cm1",
    name: "Explains a diagram",
    description: "Names the parts of a labelled diagram.",
    variableType: "binary",
    states,
    domain: "Science",
    strand: "Diagrams",
    facet: "Labels",
  };
}

function draftModel() {
  return {
    id: "cm1",
    name: "Diagram explanation",
    description: "Student can explain a labelled scientific diagram.",
    measurementIntent: "unidimensional",
    psychologicalPerspective: "trait",
    constructFramework: {
      ungroundedWaiver: true,
      ungroundedReason: "No curricular policy is loaded in this store.",
    },
    status: "draft",
    locked: false,
    versionNumber: 1,
  };
}

describe("competency model review gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses review when a binary competency has no states", async () => {
    loadDB.mockReturnValue({
      competencyModels: [draftModel()],
      competencies: [binaryCompetency([])],
      auditLog: [],
    });

    const res = await request(makeApp())
      .patch("/api/competencies/models/cm1/lifecycle")
      .send({ nextStatus: "reviewed" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Structural audit failed/);
    expect(res.body.checks.some((c) => /structurally valid/.test(c.label))).toBe(true);
    expect(saveDB).not.toHaveBeenCalled();
  });

  it("accepts review once the binary competency has two states", async () => {
    const model = draftModel();
    loadDB.mockReturnValue({
      competencyModels: [model],
      competencies: [
        binaryCompetency([
          { value: "0", label: "No" },
          { value: "1", label: "Yes" },
        ]),
      ],
      auditLog: [],
    });

    const res = await request(makeApp())
      .patch("/api/competencies/models/cm1/lifecycle")
      .send({ nextStatus: "reviewed" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("reviewed");
    expect(res.body.smVariables[0].scale.states).toEqual(["0", "1"]);
    expect(saveDB).toHaveBeenCalled();
  });

  it("returns the audit-log submitter on GET without storing it", async () => {
    const model = { ...draftModel(), status: "reviewed" };
    const db = {
      competencyModels: [model],
      competencies: [],
      auditLog: [
        {
          action: "lifecycle.transition",
          entity: { collection: "competencyModels", id: "cm1" },
          detail: { to: "reviewed" },
          actor: { userId: "admin1", role: "admin" },
          at: "2026-10-16T00:00:00.000Z",
        },
      ],
    };
    loadDB.mockReturnValue(db);

    const res = await request(makeApp()).get("/api/competencies/models/cm1");

    expect(res.status).toBe(200);
    expect(res.body.reviewSubmitter).toBe("admin1");
    expect(model.reviewSubmitter).toBeUndefined();
    expect(saveDB).not.toHaveBeenCalled();
  });
});
