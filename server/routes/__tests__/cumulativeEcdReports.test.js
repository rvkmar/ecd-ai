// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";
import { MIN_CELL_SIZE } from "../../utils/aggregatePrivacy.js";

const tokenFor = (role, extra = {}) =>
  jwt.sign({ username: `${role}1`, role, ae: 0, ...extra }, JWT_SECRET, { expiresIn: "1h" });

const plant = {
  competencies: [{ id: "c-name", name: "Plant part naming", modelId: "cm-plant" }],
  competencyModels: [{ id: "cm-plant", name: "Plant morphology" }],
  evidenceModels: [{ id: "em-plant", name: "Part naming evidence", competencyId: "c-name" }],
  taskModels: [{ id: "tm-plant", name: "Name the plant part", evidenceModelIds: ["em-plant"], primaryEvidenceModelId: "em-plant" }],
  tasks: [{ id: "t-leaf", name: "Leaf diagram", taskModelId: "tm-plant" }],
  items: [{ id: "it-leaf", name: "Leaf", taskModelId: "tm-plant", evidenceModelId: "em-plant" }],
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

function closed(id, studentId, score = 1) {
  return {
    id,
    studentId,
    status: "submitted",
    isCompleted: true,
    finishedAt: "2026-10-10T00:00:00.000Z",
    responses: [{ taskId: "t-leaf", itemId: "it-leaf", scoredValue: score }],
  };
}

beforeEach(() => {
  dbState.current = {
    ...plant,
    users: [
      { username: "admin1", role: "admin", authEpoch: 0 },
      { username: "district1", role: "district", authEpoch: 0, districtId: "d1" },
      { username: "teacher1", role: "teacher", authEpoch: 0, districtId: "d1", schoolId: "sch-1" },
      { username: "student1", role: "student", authEpoch: 0 },
    ],
    students: [
      { id: "stu1", name: "Pat", username: "student1", classId: "6A", districtId: "d1", schoolId: "sch-1" },
      { id: "stu2", name: "Sam", username: "student2", classId: "6A", districtId: "d1", schoolId: "sch-1" },
      { id: "stu-m", name: "Other", username: "studm", classId: "7B", districtId: "d-other", schoolId: "sch-m" },
    ],
    sessions: [
      closed("s1", "stu1", 1),
      closed("s2", "stu1", 0),
      closed("s3", "stu2", 0),
      closed("s-m", "stu-m", 1),
    ],
    studentModelRecords: [],
    policies: [],
  };
});

describe("GET /api/reports/cumulative/student", () => {
  it("lets a student read only their own cumulative report", async () => {
    const res = await request(app())
      .get("/api/reports/cumulative/student")
      .set("Authorization", `Bearer ${tokenFor("student")}`);
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("student");
    expect(res.body.overview.nSessions).toBe(2);
    expect(res.body.competencies[0].name).toBe("Plant part naming");
    expect(JSON.stringify(res.body)).not.toMatch(/isCorrect/);
  });

  it("ignores a spoofed studentId query from the examinee", async () => {
    const res = await request(app())
      .get("/api/reports/cumulative/student?studentId=stu-m")
      .set("Authorization", `Bearer ${tokenFor("student")}`);
    expect(res.status).toBe(200);
    expect(res.body.student.id).not.toBe("stu-m");
    expect(res.body.overview.nSessions).toBe(2);
  });

  it("lets a teacher in tenancy read a student, and refuses a foreign student", async () => {
    const ok = await request(app())
      .get("/api/reports/cumulative/student?studentId=stu1")
      .set("Authorization", `Bearer ${tokenFor("teacher", { districtId: "d1", schoolId: "sch-1" })}`);
    expect(ok.status).toBe(200);
    expect(ok.body.student.name).toBe("Pat");

    const denied = await request(app())
      .get("/api/reports/cumulative/student?studentId=stu-m")
      .set("Authorization", `Bearer ${tokenFor("teacher", { districtId: "d1", schoolId: "sch-1" })}`);
    expect(denied.status).toBe(403);
  });
});

describe("GET /api/reports/cumulative/teacher", () => {
  it("refuses a student", async () => {
    const res = await request(app())
      .get("/api/reports/cumulative/teacher")
      .set("Authorization", `Bearer ${tokenFor("student")}`);
    expect(res.status).toBe(403);
  });

  it("names the teacher's students and ranks classroom focus", async () => {
    const res = await request(app())
      .get("/api/reports/cumulative/teacher")
      .set("Authorization", `Bearer ${tokenFor("teacher", { districtId: "d1", schoolId: "sch-1" })}`);
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("teacher");
    expect(res.body.students.map((s) => s.name).sort()).toEqual(["Pat", "Sam"]);
    expect(res.body.students.some((s) => s.name === "Other")).toBe(false);
    expect(res.body.nextSteps.length).toBeGreaterThan(0);
  });
});

describe("GET /api/reports/cumulative/district", () => {
  it("refuses student and teacher", async () => {
    for (const role of ["student", "teacher"]) {
      const res = await request(app())
        .get("/api/reports/cumulative/district")
        .set("Authorization", `Bearer ${tokenFor(role, { districtId: "d1" })}`);
      expect(res.status, role).toBe(403);
    }
  });

  it("omits names and suppresses small cells for a district", async () => {
    const res = await request(app())
      .get("/api/reports/cumulative/district")
      .set("Authorization", `Bearer ${tokenFor("district", { districtId: "d1" })}`);
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("district");
    expect(res.body.students).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/Pat/);
    expect(res.body.minCellSize).toBe(MIN_CELL_SIZE);
    expect(res.body.overview.suppressed).toBe(true);
  });

  it("lets admin read an unsuppressed district when n is large enough", async () => {
    dbState.current.students = Array.from({ length: MIN_CELL_SIZE }, (_, i) => ({
      id: `stu${i}`,
      name: `N${i}`,
      classId: "6A",
      districtId: "d1",
      schoolId: "sch-1",
    }));
    dbState.current.sessions = dbState.current.students.map((s, i) => closed(`s${i}`, s.id, 0.2));
    const res = await request(app())
      .get("/api/reports/cumulative/district?districtId=d1")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(res.status).toBe(200);
    expect(res.body.overview.nStudents).toBe(MIN_CELL_SIZE);
    expect(res.body.overview.suppressed).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/N0/);
  });
});
