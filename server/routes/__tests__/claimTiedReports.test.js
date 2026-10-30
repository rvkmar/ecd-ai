// @vitest-environment node
// TU3: session, learner, teacher, class, and district reports quote the
// claim, carry SE or posterior SD, and take levels from authored cuts
// with a labelled default when nothing applies.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";

const tokenFor = (role) =>
  jwt.sign({ username: `${role}1`, role }, JWT_SECRET, { expiresIn: "1h" });

const claim = "The student can explain why a fraction names equal parts.";

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

function irtSession(id, studentId, theta, extra = {}) {
  return {
    id,
    studentId,
    selectionStrategy: "IRT",
    taskIds: ["t1"],
    responses: [{ taskId: "t1", itemId: "it1" }, { taskId: "t1", itemId: "it1" }],
    studentModel: {
      irtTheta: theta,
      irtSe: 0.25,
      smvPosteriors: {
        smv1: { smvId: "smv1", method: "eap", modelFamily: "irt", estimate: theta, sem: 0.25, evidenceModelId: "em1" },
      },
    },
    ...extra,
  };
}

beforeEach(() => {
  dbState.current = {
    sessions: [
      irtSession("s-irt", "stu1", 0.4),
      irtSession("s-mismatch", "stu1", 1.2, {
        studentModel: {
          irtTheta: 1.2,
          irtSe: 0.18,
        },
      }),
      {
        id: "s-bn",
        studentId: "stu1",
        selectionStrategy: "BayesianNetwork",
        taskIds: ["t1"],
        responses: [{}],
        studentModel: {
          bnPosteriors: { smv1: 0.8 },
          smvPosteriors: {
            smv1: {
              smvId: "smv1",
              method: "attribute-mastery-posterior",
              modelFamily: "dina",
              estimate: 0.8,
              sem: 0.12,
              evidenceModelId: "em1",
              competencyModelId: "cm1",
            },
          },
        },
      },
    ],
    students: [
      { id: "stu1", name: "Pat", username: "student1", classId: "c1", districtId: "d1" },
    ],
    tasks: [{ id: "t1", taskModelId: "tm1" }],
    taskModels: [{ id: "tm1", evidenceModelIds: ["em1"], primaryEvidenceModelId: "em1" }],
    items: [{ id: "it1", evidenceModelId: "em1" }],
    evidenceModels: [{
      id: "em1",
      competencyId: "c1",
      claimStatement: claim,
      decisionRule: { type: "mastery", threshold: 0.9, direction: "above" },
    }],
    competencies: [{
      id: "c1",
      name: "Equal parts",
      modelId: "cm1",
      performanceLevelScale: "theta",
      performanceLevels: [
        { label: "Basic", descriptor: "Not yet the claim.", cut: -1 },
        { label: "Proficient", descriptor: "Meets the equal-parts claim.", cut: 0.2 },
      ],
    }],
    competencyModels: [{
      id: "cm1",
      smVariables: [{ id: "smv1", type: "binary" }],
      competencies: [{ id: "c1", name: "Equal parts" }],
    }],
    policies: [],
  };
});

describe("claim-tied session reports", () => {
  it("quotes the claim, the theta SE, and the authored descriptor", async () => {
    const res = await request(app())
      .get("/api/reports/session/s-irt")
      .set("Authorization", `Bearer ${tokenFor("student")}`);
    expect(res.status).toBe(200);
    const irt = res.body.constructs.find((row) => row.type === "IRT");
    expect(irt).toMatchObject({
      estimate: 0.4,
      level: "Proficient",
      levelText: "Meets the equal-parts claim.",
      levelSource: "authored",
      claimStatement: claim,
      standardError: 0.25,
    });
    expect(res.body.ecdReport.evidence[0].claimStatement).toBe(claim);
    expect(res.body.ecdReport.overview.level).toBe("Proficient");
    expect(res.body.ecdReport.overview.levelSource).toBe("authored");
  });

  it("labels the historical theta cut when the authored scale does not match", async () => {
    dbState.current.competencies[0].performanceLevelScale = "probability";
    const res = await request(app())
      .get("/api/reports/session/s-mismatch/learner-feedback")
      .set("Authorization", `Bearer ${tokenFor("student")}`);
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({
      level: "Advanced",
      levelSource: "default",
      levelNote: "default cut",
      standardError: 0.18,
      claimStatement: claim,
    });
    expect(res.body.summary.message).toMatch(/ready for challenging problems/);
    expect(res.body.strengths).toContain("Core skills mastered");
  });

  it("keeps the mastery class from classifyByRule and the default probability word", async () => {
    dbState.current.competencies[0].performanceLevelScale = "probability";
    dbState.current.competencies[0].performanceLevels = [];
    const res = await request(app())
      .get("/api/reports/session/s-bn/teacher-report")
      .set("Authorization", `Bearer ${tokenFor("teacher")}`);
    expect(res.status).toBe(200);
    expect(res.body.modelSummary.BayesianNetwork.smv1).toMatchObject({
      posterior: 0.8,
      level: "Strong",
      levelSource: "default",
      levelNote: "default cut",
      posteriorSd: 0.12,
      claimStatement: claim,
      classification: "nonmaster",
      masteryThreshold: 0.9,
    });
    expect(res.body.attributeProfile[0]).toMatchObject({
      classification: "nonmaster",
      masteryThreshold: 0.9,
      claimStatement: claim,
      posteriorSd: 0.12,
      level: "Strong",
      levelSource: "default",
    });
  });
});

describe("claim-tied class and district reports", () => {
  function roster(n, strategy, theta) {
    const students = [];
    const sessions = [];
    for (let i = 0; i < n; i += 1) {
      const id = `stu-${i}`;
      students.push({ id, name: `Student ${i}`, classId: "c1", districtId: "d1" });
      sessions.push(irtSession(`s-${i}`, id, theta));
    }
    dbState.current.students = students;
    dbState.current.sessions = sessions;
  }

  it("puts the claim, the SE, and the authored level on a class large enough to report", async () => {
    roster(5, "IRT", 0.4);
    const res = await request(app())
      .get("/api/reports/teacher/class/c1")
      .set("Authorization", `Bearer ${tokenFor("teacher")}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.IRT.suppressed).toBe(false);
    expect(res.body.summary.IRT).toMatchObject({
      level: "Proficient",
      levelText: "Meets the equal-parts claim.",
      levelSource: "authored",
      claimStatement: claim,
    });
    expect(res.body.summary.IRT.standardError).toEqual(expect.any(Number));
    expect(res.body.summary.IRT.mean).toBeCloseTo(0.4, 5);
  });

  it("keeps the claim when a small class suppresses the score", async () => {
    roster(2, "IRT", 1.4);
    const res = await request(app())
      .get("/api/reports/teacher/class/c1")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.IRT.suppressed).toBe(true);
    expect(res.body.summary.IRT.mean).toBeNull();
    expect(res.body.summary.IRT.level).toBeNull();
    expect(res.body.summary.IRT.claimStatement).toBe(claim);
  });

  it("puts the same claim and level on the district summary", async () => {
    roster(5, "IRT", 1.4);
    const res = await request(app())
      .get("/api/reports/teacher/district/d1")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(res.status).toBe(200);
    expect(res.body.districtSummary.IRT).toMatchObject({
      suppressed: false,
      level: "Proficient",
      levelSource: "authored",
      claimStatement: claim,
    });
    expect(res.body.districtSummary.IRT.standardError).toEqual(expect.any(Number));
    expect(res.body.classes.c1.IRT.claimStatement).toBe(claim);
  });
});
