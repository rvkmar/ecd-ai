// @vitest-environment node
// D59: role-split reports + examinee leak + classification/stop on payloads.
//
// The leak: any authenticated caller could GET /session/:id/teacher-report.
// A student must be refused. Staff must still receive the teacher payload,
// now including D57 classification and the D58 stop record.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";

const tokenFor = (role) =>
  jwt.sign({ username: `${role}1`, role }, JWT_SECRET, { expiresIn: "1h" });

const STOPPED = {
  rule: "targetsMet",
  assemblyModelId: "am-d59",
  reason: "Every declared Assembly Model target is scored and met (1 of 1) at 2 response(s).",
  targets: [
    {
      smvId: "attrA",
      classification: "master",
      expectedClassificationAccuracy: 0.95,
      requiredClassificationAccuracy: 0.8,
      masteryThreshold: 0.5,
      estimate: 0.95,
    },
  ],
  stoppedAt: "2026-09-13T06:00:00.000Z",
};

const SESSION = {
  id: "s-d59",
  studentId: "stu1",
  selectionStrategy: "BayesianNetwork",
  taskIds: [],
  responses: [{ taskId: "t1", scoredValue: 1 }],
  stopped: STOPPED,
  studentModel: {
    smvPosteriors: {
      attrA: {
        smvId: "attrA",
        method: "attribute-mastery-posterior",
        modelFamily: "dina",
        estimate: 0.95,
      },
    },
  },
};

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
    sessions: [SESSION],
    students: [{ id: "stu1", name: "Pat", classId: "c1", districtId: "d1" }],
    tasks: [],
    taskModels: [],
    evidenceModels: [],
    policies: [],
  };
});

describe("GET /api/reports/session/:id/teacher-report — examinee leak (D59)", () => {
  it("refuses a student (403)", async () => {
    const res = await request(app())
      .get("/api/reports/session/s-d59/teacher-report")
      .set("Authorization", `Bearer ${tokenFor("student")}`);
    expect(res.status).toBe(403);
  });

  it("admits teacher, district, and admin, with classification and stop", async () => {
    for (const role of ["teacher", "district", "admin"]) {
      const res = await request(app())
        .get("/api/reports/session/s-d59/teacher-report")
        .set("Authorization", `Bearer ${tokenFor(role)}`);
      expect(res.status, `${role} should read the teacher report`).toBe(200);
      expect(res.body.stopped).toMatchObject({
        rule: "targetsMet",
        reason: STOPPED.reason,
      });
      expect(res.body.attributeProfile).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            smvId: "attrA",
            classification: "master",
            expectedClassificationAccuracy: 0.95,
          }),
        ])
      );
      expect(res.body.modelSummary.AttributeProfile.attrA.classification).toBe("master");
    }
  });

  it("does not 500 when a bound evidence model has no constructs array", async () => {
    dbState.current = {
      ...dbState.current,
      tasks: [{ id: "t1", taskModelId: "tm1" }],
      taskModels: [{ id: "tm1", evidenceModelIds: ["em1"] }],
      evidenceModels: [{ id: "em1", observations: [] }],
    };
    const res = await request(app())
      .get("/api/reports/session/s-d59/teacher-report")
      .set("Authorization", `Bearer ${tokenFor("teacher")}`);
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe("s-d59");
  });
});

describe("learner and generic session reports carry the same measurement fields", () => {
  it("lets a student read learner-feedback with stop + profile", async () => {
    const res = await request(app())
      .get("/api/reports/session/s-d59/learner-feedback")
      .set("Authorization", `Bearer ${tokenFor("student")}`);
    expect(res.status).toBe(200);
    expect(res.body.stopped.rule).toBe("targetsMet");
    expect(res.body.attributeProfile[0].classification).toBe("master");
    expect(res.body.strengths).toContain("attrA");
    expect(res.body.summary.message).toBe(STOPPED.reason);
  });

  it("lets a student read the generic session report with stop + profile", async () => {
    const res = await request(app())
      .get("/api/reports/session/s-d59")
      .set("Authorization", `Bearer ${tokenFor("student")}`);
    expect(res.status).toBe(200);
    expect(res.body.stopped.reason).toBe(STOPPED.reason);
    expect(res.body.attributeProfile[0].smvId).toBe("attrA");
    expect(res.body.constructs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "AttributeProfile", smvId: "attrA", classification: "master" }),
      ])
    );
  });
});

describe("class and district teacher reports are staff-only", () => {
  it("refuses a student on /teacher/class/:classId", async () => {
    const res = await request(app())
      .get("/api/reports/teacher/class/c1")
      .set("Authorization", `Bearer ${tokenFor("student")}`);
    expect(res.status).toBe(403);
  });

  it("lets a teacher read the class report", async () => {
    const res = await request(app())
      .get("/api/reports/teacher/class/c1")
      .set("Authorization", `Bearer ${tokenFor("teacher")}`);
    expect(res.status).toBe(200);
    expect(res.body.classId).toBe("c1");
  });
});
