// @vitest-environment node
// F24: session, learner, and teacher reports show the Bayesian network
// posterior. The number on bnPosteriors stays a probability so class and
// district means keep summing numbers. The distribution rides alongside.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";

const tokenFor = (role) =>
  jwt.sign({ username: `${role}1`, role }, JWT_SECRET, { expiresIn: "1h" });

const distribution = { not_mastered: 0.2, mastered: 0.8 };

const dbState = { current: {} };
vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: () => dbState.current,
  saveDB: (next) => {
    dbState.current = next;
  },
}));

import reportsRoutes from "../reportsRoutes.js";

function app() {
  const server = express();
  server.use(express.json());
  server.use("/api/reports", reportsRoutes);
  return server;
}

beforeEach(() => {
  dbState.current = {
    sessions: [{
      id: "s-bn",
      studentId: "stu1",
      selectionStrategy: "BayesianNetwork",
      taskIds: [],
      responses: [],
      studentModel: {
        bnPosteriors: { smv1: 0.8 },
        smvPosteriors: {
          smv1: {
            smvId: "smv1",
            modelFamily: "bayesian_network",
            method: "exact-bayes",
            estimate: 0.8,
            distribution,
            states: ["not_mastered", "mastered"],
          },
        },
      },
    }],
    students: [{ id: "stu1", name: "Pat", username: "student1", classId: "c1", districtId: "d1" }],
    tasks: [],
    taskModels: [],
    evidenceModels: [],
    policies: [],
  };
});

describe("Bayesian network posteriors on reports", () => {
  it("puts the node, the probability, and the distribution on the session report", async () => {
    const res = await request(app())
      .get("/api/reports/session/s-bn")
      .set("Authorization", `Bearer ${tokenFor("student")}`);
    expect(res.status).toBe(200);
    const row = res.body.constructs.find((construct) => construct.type === "BayesianNetwork");
    expect(row).toMatchObject({
      node: "smv1",
      probability: 0.8,
      level: "Strong",
      distribution,
    });
  });

  it("returns the same distribution on learner feedback", async () => {
    const res = await request(app())
      .get("/api/reports/session/s-bn/learner-feedback")
      .set("Authorization", `Bearer ${tokenFor("student")}`);
    expect(res.status).toBe(200);
    expect(res.body.bayesianNetwork.smv1).toMatchObject({
      probability: 0.8,
      level: "Strong",
      distribution,
    });
    expect(res.body.strengths).toContain("smv1");
  });

  it("returns the same distribution on the teacher model summary", async () => {
    const res = await request(app())
      .get("/api/reports/session/s-bn/teacher-report")
      .set("Authorization", `Bearer ${tokenFor("teacher")}`);
    expect(res.status).toBe(200);
    expect(res.body.modelSummary.BayesianNetwork.smv1).toMatchObject({
      posterior: 0.8,
      level: "Strong",
      distribution,
    });
    expect(typeof res.body.modelSummary.BayesianNetwork.smv1.posterior).toBe("number");
  });
});
