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
  const { default: router } = await import("../curricularPoliciesRoutes.js");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api/curricularPolicies", router);
  return expressApp;
}

const goals = [
  {
    code: "CG-1",
    statement: "Explain how a labelled diagram works",
    competencies: [{ code: "C-1.1", statement: "Name the relation between two parts", learningOutcomes: [] }],
  },
];

beforeEach(() => {
  dbState.current = {
    curricularPolicies: [],
    domainAnalyses: [{
      id: "dacscp-ncf",
      name: "NCF science",
      status: "draft",
      valuedKnowledge: [],
      contentStandards: {
        id: "cp-ncf",
        name: "NCF science",
        curricularGoals: goals,
      },
    }],
    competencyModels: [],
  };
});

describe("D143 Step 3 resolution", () => {
  it("returns the policy from the Domain Analysis when the collection row is gone", async () => {
    const res = await request(await app())
      .get("/api/curricularPolicies")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([dbState.current.domainAnalyses[0].contentStandards]);
  });
});
