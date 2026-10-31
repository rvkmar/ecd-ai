// TU9: the teacher report shows a rapid-guess flag per response and a
// per-student rate. A response with no time is unknown, never a rapid guess.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";

const tokenFor = (role) =>
  jwt.sign({ username: `${role}1`, role }, JWT_SECRET, { expiresIn: "1h" });

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
      id: "s1",
      studentId: "stu1",
      selectionStrategy: "fixed",
      taskIds: ["t1", "t2", "t3"],
      responses: [
        {
          taskId: "t1",
          itemId: "it1",
          rawAnswer: "opt_a",
          presentedAt: "2026-10-31T12:00:00.000Z",
          presentedAtSource: "server",
          timeOnItemMs: 1200,
          rapidGuess: true,
          rapidGuessStatus: "rapid",
        },
        {
          taskId: "t2",
          itemId: "it1",
          rawAnswer: "opt_b",
          presentedAt: "2026-10-31T12:01:00.000Z",
          presentedAtSource: "server",
          timeOnItemMs: 9000,
          rapidGuess: false,
          rapidGuessStatus: "engaged",
        },
        { taskId: "t3", itemId: "it1", rawAnswer: "opt_a", rapidGuess: true },
      ],
      studentModel: {},
    }],
    students: [{ id: "stu1", name: "Pat", classId: "c1", districtId: "d1" }],
    tasks: [
      { id: "t1", taskModelId: "tm1" },
      { id: "t2", taskModelId: "tm1" },
      { id: "t3", taskModelId: "tm1" },
    ],
    taskModels: [{ id: "tm1", evidenceModelIds: ["em1"] }],
    items: [{ id: "it1" }],
    evidenceModels: [{ id: "em1", constructs: [] }],
    policies: [],
    competencyModels: [],
    competencies: [],
  };
});

describe("teacher report response timing", () => {
  it("shows the flag, the rate, and unknown for a legacy response", async () => {
    const res = await request(app())
      .get("/api/reports/session/s1/teacher-report")
      .set("Authorization", `Bearer ${tokenFor("teacher")}`);

    expect(res.status).toBe(200);
    const byTask = Object.fromEntries(res.body.responses.map((row) => [row.taskId, row]));
    expect(byTask.t1).toMatchObject({
      rapidGuess: true,
      rapidGuessStatus: "rapid",
      timeOnItemMs: 1200,
      presentedAtSource: "server",
    });
    expect(byTask.t2).toMatchObject({
      rapidGuess: false,
      rapidGuessStatus: "engaged",
      timeOnItemMs: 9000,
    });
    expect(byTask.t3).toMatchObject({
      rapidGuess: null,
      rapidGuessStatus: "unknown",
      timeOnItemMs: null,
    });
    expect(res.body.responseTiming).toMatchObject({
      rapidGuessCount: 1,
      timedResponseCount: 2,
      unknownResponseCount: 1,
      rapidGuessRate: 0.5,
      ruleId: "normative-threshold-v1",
    });
  });
});
