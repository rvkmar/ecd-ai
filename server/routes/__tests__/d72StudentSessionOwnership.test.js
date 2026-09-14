// @vitest-environment node
// D72: a student must not list, read, or submit on another examinee's session.
// sessionAssignedToStudent existed and its tests passed; production used it
// only on GET /mine, and /mine fell back to every live session when matching
// found none.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { username: "stud1", role: "student" };
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
  finishSession: vi.fn(),
}));

const { loadDB, saveDB } = await import("../../../src/utils/db-server.js");
const { default: router } = await import("../sessionRoutes.js");

const app = express();
app.use(express.json());
app.use("/api/sessions", router);

const own = {
  id: "s-own",
  studentId: "stud1",
  studentIds: ["stud1"],
  status: "in_progress",
  taskIds: ["t1"],
  responses: [],
  selectionStrategy: "fixed",
};
const other = {
  id: "s-other",
  studentId: "stu-other",
  studentIds: ["stu-other"],
  status: "in_progress",
  taskIds: ["t1"],
  responses: [{ taskId: "t1", rawAnswer: "secret" }],
  selectionStrategy: "fixed",
};

beforeEach(() => {
  loadDB.mockReturnValue({
    students: [],
    users: [],
    tasks: [{ id: "t1" }],
    sessions: [{ ...own }, { ...other }],
    policies: [{ id: "p-fixed", type: "fixed" }],
  });
});

describe("D72 student session ownership", () => {
  it("lets the assignee read their own session", async () => {
    const res = await request(app).get("/api/sessions/s-own");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("s-own");
  });

  it("refuses GET /:id for another examinee", async () => {
    const res = await request(app).get("/api/sessions/s-other");
    expect(res.status).toBe(403);
    expect(res.body.responses).toBeUndefined();
  });

  it("refuses POST /:id/submit on another examinee's session", async () => {
    const res = await request(app)
      .post("/api/sessions/s-other/submit")
      .send({ taskId: "t1", itemId: "i1", rawAnswer: "x" });
    expect(res.status).toBe(403);
    expect(saveDB).not.toHaveBeenCalled();
  });

  it("refuses GET /:id/next-task on another examinee's session", async () => {
    const res = await request(app).get("/api/sessions/s-other/next-task");
    expect(res.status).toBe(403);
  });
});
