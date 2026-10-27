import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: "u1", role: "admin", username: "admin1" };
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
  readRawDB: vi.fn(),
}));

import { loadDB, saveDB } from "../../../src/utils/db-server.js";
import competencyModelsRouter from "../competencyModels.js";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/competencies", competencyModelsRouter);
  return app;
}

function dbWith(patternRows) {
  return {
    competencyModels: [
      {
        id: "cm-plant",
        name: "Plant part naming",
        status: "draft",
        locked: false,
        smVariables: [{ id: "smv-names-part", label: "Names the part", type: "binary" }],
      },
    ],
    competencies: [{ id: "c-plant", name: "Names the part", modelId: "cm-plant" }],
    evidenceModels: [],
    designPatterns: patternRows,
  };
}

describe("design pattern KSA citations block delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses to delete a competency a design pattern KSA cites", async () => {
    const db = dbWith([
      {
        id: "dp-plant",
        name: "Name a plant part",
        focalKsas: [{ label: "Plant-part vocabulary", competencyId: "c-plant" }],
      },
    ]);
    loadDB.mockReturnValue(db);
    const refused = await request(makeApp()).delete("/api/competencies/c-plant");
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/design pattern/);
    expect(saveDB).not.toHaveBeenCalled();

    loadDB.mockReturnValue(dbWith([]));
    const removed = await request(makeApp()).delete("/api/competencies/c-plant");
    expect(removed.status).toBe(204);
    expect(saveDB).toHaveBeenCalled();
  });

  it("refuses to delete a competency model whose SMV a design pattern KSA cites", async () => {
    loadDB.mockReturnValue(
      dbWith([
        {
          id: "dp-plant",
          name: "Name a plant part",
          additionalKsas: [
            {
              label: "Names the part",
              relationship: "required_but_not_measured",
              competencyModelId: "cm-plant",
              smvId: "smv-names-part",
            },
          ],
        },
      ])
    );
    const refused = await request(makeApp()).delete("/api/competencies/models/cm-plant");
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/design pattern/);
    expect(saveDB).not.toHaveBeenCalled();
  });
});
