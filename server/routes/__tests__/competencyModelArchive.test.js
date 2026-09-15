import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: "u1", role: "admin" };
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

function makeModel(overrides = {}) {
  return {
    id: "cm1",
    name: "Numerical Reasoning",
    measurementIntent: "unidimensional",
    status: "confirmed",
    locked: true,
    versionNumber: 1,
    ...overrides,
  };
}

describe("POST /api/competencies/models/:id/archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("archives a confirmed locked competency model", async () => {
    const model = makeModel();
    loadDB.mockReturnValue({ competencyModels: [model], competencies: [] });

    const res = await request(makeApp()).post("/api/competencies/models/cm1/archive");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("archived");
    expect(res.body.locked).toBe(true);
    expect(res.body.archiveMeta.archivedFrom).toBe("confirmed");
    expect(saveDB).toHaveBeenCalled();
  });

  it("refuses a draft", async () => {
    loadDB.mockReturnValue({
      competencyModels: [makeModel({ status: "draft", locked: false })],
      competencies: [],
    });

    const res = await request(makeApp()).post("/api/competencies/models/cm1/archive");
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/confirmed \(locked\)/);
    expect(saveDB).not.toHaveBeenCalled();
  });

  it("refuses a second archive", async () => {
    loadDB.mockReturnValue({
      competencyModels: [makeModel({ status: "archived" })],
      competencies: [],
    });

    const res = await request(makeApp()).post("/api/competencies/models/cm1/archive");
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already archived/);
  });
});
