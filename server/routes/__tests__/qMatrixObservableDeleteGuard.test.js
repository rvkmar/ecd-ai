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
import itemsRouter from "../itemsRoutes.js";
import evidenceRouter from "../evidenceModels.js";

function app() {
  const server = express();
  server.use(express.json());
  server.use("/api/items", itemsRouter);
  server.use("/api/evidenceModels", evidenceRouter);
  return server;
}

function store() {
  return {
    items: [{ id: "i1", name: "Leaf", status: "draft", locked: false, taskModelId: "tm1" }],
    evidenceModels: [{
      id: "em1",
      name: "Part function evidence",
      status: "draft",
      locked: false,
      observables: [{ id: "obs-a", statement: "Selects the function" }],
    }],
    qMatrixModels: [{
      id: "qm1",
      entries: [
        { itemId: "i1", attributeId: "attr-a" },
        { observableId: "obs-a", evidenceModelId: "em1", attributeId: "attr-a" },
      ],
    }],
    sessions: [],
    taskModels: [],
  };
}

describe("Q-matrix citations block delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses to delete an item a Q-matrix cites", async () => {
    loadDB.mockReturnValue(store());
    const refused = await request(app()).delete("/api/items/i1");
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/Q-matrix/);
    expect(saveDB).not.toHaveBeenCalled();
  });

  it("refuses to delete an evidence model a Q-matrix cites", async () => {
    loadDB.mockReturnValue(store());
    const refused = await request(app()).delete("/api/evidenceModels/em1");
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/Q-matrix/);
    expect(saveDB).not.toHaveBeenCalled();
  });

  it("refuses to save an evidence model that drops a cited observable", async () => {
    loadDB.mockReturnValue(store());
    const refused = await request(app())
      .put("/api/evidenceModels/em1")
      .send({ name: "Part function evidence", observables: [] });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/observable/);
    expect(saveDB).not.toHaveBeenCalled();
  });
});
