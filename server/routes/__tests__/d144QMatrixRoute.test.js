import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";

const tokenFor = (role) =>
  jwt.sign({ username: `${role}1`, role }, JWT_SECRET, { expiresIn: "1h" });

const dbState = { current: {} };
vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: () => dbState.current,
  readRawDB: () => dbState.current,
  saveDB: (next) => {
    dbState.current = next;
  },
}));

async function app() {
  const { default: router } = await import("../qMatrixModelsRoutes.js");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api/qMatrixModels", router);
  return expressApp;
}

const matrix = {
  id: "qm1",
  name: "Force",
  competencyModelId: "cm1",
  attributeIds: [],
  entries: [],
  status: "draft",
  locked: false,
  versionNumber: 1,
};

beforeEach(() => {
  dbState.current = {
    qMatrixModels: [matrix],
    competencyModels: [{ id: "cm1", smVariables: [] }],
    domainAnalyses: [{ id: "da1", name: "Diagrams" }],
    items: [],
  };
});

describe("D144 Q-matrix route", () => {
  it("still resolves the existing id", async () => {
    const res = await request(await app())
      .get("/api/qMatrixModels/qm1")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(res.status).toBe(200);
    expect(res.body.competencyModelId).toBe("cm1");
  });

  it("stores a link only when the Domain Analysis exists", async () => {
    const ok = await request(await app())
      .post("/api/qMatrixModels")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ name: "Linked", competencyModelId: "cm1", domainAnalysisId: "da1" });
    expect(ok.status).toBe(201);
    expect(ok.body.id).toMatch(/^qm/);
    expect(ok.body.domainAnalysisId).toBe("da1");
    expect(ok.body.competencyModelId).toBe("cm1");

    const missing = await request(await app())
      .post("/api/qMatrixModels")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ name: "Missing", competencyModelId: "cm1", domainAnalysisId: "da-nope" });
    expect(missing.status).toBe(400);
  });
});
