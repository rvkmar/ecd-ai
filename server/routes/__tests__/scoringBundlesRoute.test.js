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

function model() {
  return {
    id: "em1",
    status: "confirmed",
    locked: true,
    scoringBundles: undefined,
  };
}

async function buildApp() {
  vi.resetModules();
  const db = {
    evidenceModels: [model()],
    items: [
      { id: "itemA", interaction: { workProductId: "wp1" } },
      { id: "itemB", interaction: { workProductId: "wp1" } },
    ],
  };
  const { loadDB, saveDB } = await import("../../../src/utils/db-server.js");
  loadDB.mockReturnValue(db);
  saveDB.mockImplementation(() => {});
  const { default: router } = await import("../evidenceModels.js");
  const app = express();
  app.use(express.json());
  app.use("/api/evidenceModels", router);
  return { app, db, saveDB };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PUT /api/evidenceModels/:id/scoring-bundles", () => {
  it("stores an enabled bundle on a locked model and clears it when the list is empty", async () => {
    const { app, db, saveDB } = await buildApp();
    const body = {
      scoringBundles: [{
        id: "bundle_workProduct_wp1",
        enabled: true,
        basis: "workProduct",
        sourceId: "wp1",
        itemIds: ["itemA", "itemB"],
      }],
    };
    const saved = await request(app).put("/api/evidenceModels/em1/scoring-bundles").send(body);
    expect(saved.status).toBe(200);
    expect(saved.body.scoringBundles).toEqual(body.scoringBundles);
    expect(db.evidenceModels[0].locked).toBe(true);
    expect(saveDB).toHaveBeenCalled();

    const cleared = await request(app).put("/api/evidenceModels/em1/scoring-bundles").send({ scoringBundles: [] });
    expect(cleared.status).toBe(200);
    expect(cleared.body.scoringBundles).toEqual([]);
    expect(db.evidenceModels[0].scoringBundles).toBeUndefined();
  });

  it("rejects a bundle whose items do not share the work product", async () => {
    const { app } = await buildApp();
    const res = await request(app).put("/api/evidenceModels/em1/scoring-bundles").send({
      scoringBundles: [{
        id: "bundle_workProduct_other",
        enabled: true,
        basis: "workProduct",
        sourceId: "other",
        itemIds: ["itemA", "itemB"],
      }],
    });
    expect(res.status).toBe(400);
    expect(res.body.errors.join(" ")).toMatch(/does not use work product/);
  });
});
