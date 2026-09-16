// server/routes/__tests__/attachSeedParameterSets.test.js
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
  app.use(express.json());
  app.use("/api/evidenceModels", evidenceModelsRoutes);
  return app;
}

describe("POST /api/evidenceModels/:id/attach-seed-parameter-sets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("attaches calibrationPlan.seedParameterSets onto the active statistical model", async () => {
    const db = {
      evidenceModels: [
        {
          id: "em1",
          status: "confirmed",
          locked: true,
          competencyId: "c1",
          competencyModelVersion: 1,
          calibrationPlan: {
            seedParameterSets: [
              {
                statisticalModelId: "sm1",
                parameterSet: {
                  parameterSetId: "ps_pilot_sm1",
                  parameters: { o1: { a: 1.1, b: -0.2 } },
                  packageVersion: "ecd-pilot-1.0.0",
                  converged: true,
                  sampleSize: 220,
                  calibratedAt: "2026-09-01T00:00:00.000Z",
                },
              },
            ],
          },
          statisticalModels: [
            {
              id: "sm1",
              type: "irt",
              subtype: "2pl",
              active: true,
              structureConfig: { observableIds: ["o1"] },
              parameterSets: [],
              activeParameterSetId: null,
            },
          ],
        },
      ],
      competencies: [{ id: "c1", modelId: "cm1" }],
      competencyModels: [{ id: "cm1", versionNumber: 1 }],
    };
    loadDB.mockReturnValue(db);

    const res = await request(makeApp())
      .post("/api/evidenceModels/em1/attach-seed-parameter-sets")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.attached).toEqual([
      { statisticalModelId: "sm1", parameterSetId: "ps_pilot_sm1" },
    ]);
    const sm = db.evidenceModels[0].statisticalModels[0];
    expect(sm.parameterSets).toHaveLength(1);
    expect(sm.activeParameterSetId).toBe("ps_pilot_sm1");
    expect(sm.parameterSets[0].packageVersion).toBe("ecd-pilot-1.0.0");
    expect(saveDB).toHaveBeenCalled();
  });

  it("refuses draft models", async () => {
    loadDB.mockReturnValue({
      evidenceModels: [{ id: "em1", status: "draft", statisticalModels: [], calibrationPlan: { seedParameterSets: [{}] } }],
    });
    const res = await request(makeApp())
      .post("/api/evidenceModels/em1/attach-seed-parameter-sets")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/confirmed|suspended/i);
  });
});
