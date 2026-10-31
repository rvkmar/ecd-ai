import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { username: "teach1", role: "teacher" };
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
  recordAuditEvent: vi.fn(),
}));

vi.mock("../../utils/dbAdapter.js", () => ({
  dbAdapter: {
    list: vi.fn(async () => [
      { username: "stud1", role: "student", profile: { grade: "6A" } },
      { username: "teach1", role: "teacher" },
    ]),
  },
}));

const { loadDB } = await import("../../../src/utils/db-server.js");
const { default: router } = await import("../studentsRoutes.js");

const app = express();
app.use(express.json());
app.use("/api/students", router);

describe("GET /api/students/assignable", () => {
  beforeEach(() => {
    loadDB.mockReturnValue({
      students: [{ id: "stu1", name: "Pat", classId: "6A" }],
    });
  });

  it("is not treated as GET /:id (Student not found)", async () => {
    const res = await request(app).get("/api/students/assignable");
    expect(res.status).toBe(200);
    expect(res.body.students.map((s) => s.id).sort()).toEqual(["stu1", "stud1"]);
    expect(res.body.cohorts[0].id).toBe("6A");
    expect(res.body.error).toBeUndefined();
  });
});
