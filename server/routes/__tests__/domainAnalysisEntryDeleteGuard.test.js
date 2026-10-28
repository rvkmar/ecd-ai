import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: "u1", role: "admin", username: "admin1" };
    next();
  },
  authorizeRole: () => (_req, _res, next) => next(),
}));

vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: vi.fn(),
  saveDB: vi.fn(),
  readRawDB: vi.fn(),
}));

import { loadDB, saveDB } from "../../../src/utils/db-server.js";
import domainAnalysesRouter from "../domainAnalysesRoutes.js";
import designPatternsRouter from "../designPatternsRoutes.js";
import taskModelVariablesRouter from "../taskModelVariablesRoutes.js";

function app() {
  const server = express();
  server.use(express.json());
  server.use("/api/domainAnalyses", domainAnalysesRouter);
  server.use("/api/designPatterns", designPatternsRouter);
  server.use("/api/taskModelVariables", taskModelVariablesRouter);
  return server;
}

function store(extra = {}) {
  return {
    domainAnalyses: [
      {
        id: "da-plant",
        name: "Plant structure",
        status: "draft",
        valuedKnowledge: [{ id: "vk-plant", label: "Leaf, root, stem, and flower" }],
        taskFeatures: [{ id: "tf-plant", label: "A labelled diagram of a flowering plant" }],
      },
    ],
    designPatterns: [
      {
        id: "dp-plant",
        name: "Name a plant part",
        status: "draft",
        domainAnalysisId: "da-plant",
        focalKsas: [{ label: "Plant-part vocabulary", valuedKnowledgeId: "vk-plant" }],
        characteristicFeatures: [{ label: "One part is called out", taskFeatureId: "tf-plant" }],
      },
    ],
    taskModelVariables: [],
    competencyModels: [],
    competencies: [],
    evidenceModels: [],
    taskModels: [],
    ...extra,
  };
}

describe("domain analysis entry citations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assigns an id on create and keeps it when a later save sends the label only", async () => {
    const db = { domainAnalyses: [], designPatterns: [], taskModelVariables: [], taskModels: [], evidenceModels: [] };
    loadDB.mockImplementation(() => db);
    const created = await request(app())
      .post("/api/domainAnalyses")
      .send({
        name: "Plant structure",
        status: "draft",
        valuedKnowledge: [{ label: "Leaf, root, stem, and flower" }],
        taskFeatures: [{ label: "A labelled diagram" }],
      });
    expect(created.status).toBe(201);
    const knowledgeId = created.body.valuedKnowledge[0].id;
    const featureId = created.body.taskFeatures[0].id;
    expect(knowledgeId).toMatch(/^vk/);
    expect(featureId).toMatch(/^tf/);

    const saved = await request(app())
      .put(`/api/domainAnalyses/${created.body.id}`)
      .send({
        valuedKnowledge: [{ label: "Leaf, root, stem, and flower" }],
        taskFeatures: [{ label: "A labelled diagram" }],
      });
    expect(saved.status).toBe(200);
    expect(saved.body.valuedKnowledge[0].id).toBe(knowledgeId);
    expect(saved.body.taskFeatures[0].id).toBe(featureId);
  });

  it("returns 409 when a cited statement is removed or the analysis is deleted", async () => {
    const db = store();
    loadDB.mockImplementation(() => db);

    const droppedKnowledge = await request(app())
      .put("/api/domainAnalyses/da-plant")
      .send({ valuedKnowledge: [{ label: "A different statement" }] });
    expect(droppedKnowledge.status).toBe(409);
    expect(droppedKnowledge.body.error).toMatch(/valued knowledge/);
    expect(droppedKnowledge.body.error).toMatch(/design pattern/);
    expect(saveDB).not.toHaveBeenCalled();

    const droppedFeature = await request(app())
      .put("/api/domainAnalyses/da-plant")
      .send({ taskFeatures: [] });
    expect(droppedFeature.status).toBe(409);
    expect(droppedFeature.body.error).toMatch(/task feature/);

    const removed = await request(app()).delete("/api/domainAnalyses/da-plant");
    expect(removed.status).toBe(409);
    expect(removed.body.error).toMatch(/Cannot delete Domain Analysis/);
    expect(saveDB).not.toHaveBeenCalled();
  });

  it("returns 409 when a task model variable cites the task feature", async () => {
    loadDB.mockImplementation(() =>
      store({
        designPatterns: [],
        taskModelVariables: [
          { id: "tmv-diagram", name: "Plant diagram", taskFeatureId: "tf-plant", domainAnalysisId: "da-plant" },
        ],
      })
    );
    const removed = await request(app()).delete("/api/domainAnalyses/da-plant");
    expect(removed.status).toBe(409);
    expect(removed.body.error).toMatch(/task model variable/);
    expect(saveDB).not.toHaveBeenCalled();
  });

  it("deletes an analysis whose statements are not cited", async () => {
    loadDB.mockImplementation(() => store({ designPatterns: [] }));
    const removed = await request(app()).delete("/api/domainAnalyses/da-plant");
    expect(removed.status).toBe(200);
    expect(saveDB).toHaveBeenCalled();
  });

  it("returns a readable error when a design pattern cites a missing statement", async () => {
    loadDB.mockImplementation(() => store({ designPatterns: [] }));
    const refused = await request(app())
      .post("/api/designPatterns")
      .send({
        name: "Name a plant part",
        status: "draft",
        domainAnalysisId: "da-plant",
        focalKsas: [{ label: "Plant-part vocabulary", valuedKnowledgeId: "vk-missing" }],
      });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/valuedKnowledgeId 'vk-missing'/);
    expect(saveDB).not.toHaveBeenCalled();
  });

  it("returns a readable error when a task model variable cites a feature on another analysis", async () => {
    loadDB.mockImplementation(() => store());
    const refused = await request(app())
      .post("/api/taskModelVariables")
      .send({
        name: "Plant diagram",
        type: "categorical",
        possibleValues: [
          { value: "leaf", label: "Leaf" },
          { value: "root", label: "Root" },
        ],
        domainAnalysisId: "da-plant",
        taskFeatureId: "tf-other",
      });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/not on domain analysis 'da-plant'/);
  });
});
