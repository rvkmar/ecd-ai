// @vitest-environment node
/**
 * D100 / W20 gate — scope inspector matches live API; foreign district blocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";
import {
  setCachedAuthEpoch,
  _resetTokenServiceForTests,
} from "../../utils/tokenService.js";
import { applyTenancyToDb, filterRows } from "../../utils/tenancyScope.js";
import { getTenancyContext } from "../../utils/tenancyContext.js";
import { inspectSubjectVisibility } from "../../utils/scopeInspector.js";

const fixture = {
  students: [
    { id: "stu-c1", name: "C1", districtId: "tn-chennai", schoolId: "sch-1" },
    { id: "stu-c2", name: "C2", districtId: "tn-chennai", schoolId: "sch-1" },
    { id: "stu-m1", name: "M1", districtId: "tn-madurai", schoolId: "sch-m" },
  ],
  users: [
    {
      id: "u-admin",
      username: "admin1",
      role: "admin",
      authEpoch: 0,
      profile: {},
    },
    {
      id: "u-dist",
      username: "dist1",
      role: "district",
      authEpoch: 0,
      profile: { districtId: "tn-chennai" },
    },
    {
      id: "u-dist-m",
      username: "dist-madurai",
      role: "district",
      authEpoch: 0,
      profile: { districtId: "tn-madurai" },
    },
  ],
  sessions: [
    {
      id: "sess-c",
      studentId: "stu-c1",
      studentIds: ["stu-c1"],
      status: "in_progress",
      taskIds: ["t1"],
      responses: [],
      selectionStrategy: "fixed",
    },
    {
      id: "sess-m",
      studentId: "stu-m1",
      studentIds: ["stu-m1"],
      status: "in_progress",
      taskIds: ["t1"],
      responses: [{ rawAnswer: "secret-madurai" }],
      selectionStrategy: "fixed",
    },
  ],
  tasks: [
    { id: "task-c", districtId: "tn-chennai", name: "C" },
    { id: "task-m", districtId: "tn-madurai", name: "M" },
  ],
  announcements: [],
  analysisArtefacts: [
    { id: "art-c", scope: { districtId: "tn-chennai" } },
    { id: "art-m", scope: { districtId: "tn-madurai" } },
  ],
  calibrationJobs: [
    { id: "job-c", scope: { districtId: "tn-chennai" } },
    { id: "job-m", scope: { districtId: "tn-madurai" } },
  ],
};

vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: vi.fn(() => applyTenancyToDb(fixture)),
  readRawDB: vi.fn(() => fixture),
  saveDB: vi.fn(),
  finishSession: vi.fn(),
}));

vi.mock("../../utils/dbAdapter.js", () => ({
  dbAdapter: {
    list: vi.fn(async (collection) =>
      filterRows(collection, fixture[collection] || [], getTenancyContext(), fixture)
    ),
    get: vi.fn(async () => null),
    insert: vi.fn(),
    update: vi.fn(),
    updateWhere: vi.fn(),
    remove: vi.fn(),
    removeWhere: vi.fn(),
  },
}));

const studentsRoutes = (await import("../studentsRoutes.js")).default;
const reportsRoutes = (await import("../reportsRoutes.js")).default;
const tenancyRoutes = (await import("../tenancyRoutes.js")).default;

function accessToken({ username, role, districtId, schoolId }) {
  const payload = {
    username,
    role,
    ae: 0,
    typ: "access",
    jti: `d100-${username}`,
  };
  if (districtId) payload.districtId = districtId;
  if (schoolId) payload.schoolId = schoolId;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
}

function authHeader(actor) {
  setCachedAuthEpoch(actor.username, 0);
  return { Authorization: `Bearer ${accessToken(actor)}` };
}

const admin = { username: "admin1", role: "admin" };
const dist1 = {
  username: "dist1",
  role: "district",
  districtId: "tn-chennai",
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/students", studentsRoutes);
  app.use("/api/reports", reportsRoutes);
  app.use("/api/tenancy", tenancyRoutes);
  return app;
}

describe("D100 W20 gate — inspector matches API", () => {
  let app;
  beforeEach(() => {
    _resetTokenServiceForTests();
    app = buildApp();
  });

  it("inspector visible student ids equal GET /api/students for that district user", async () => {
    const subject = fixture.users.find((u) => u.username === "dist1");
    const predicted = inspectSubjectVisibility(subject, fixture);
    expect(predicted.collections.students.visibleIds.sort()).toEqual([
      "stu-c1",
      "stu-c2",
    ]);
    expect(predicted.collections.students.visibleIds).not.toContain("stu-m1");

    const inspectRes = await request(app)
      .get("/api/tenancy/inspect/dist1")
      .set(authHeader(admin));
    expect(inspectRes.status).toBe(200);
    expect(inspectRes.body.collections.students.visibleIds.sort()).toEqual(
      predicted.collections.students.visibleIds.sort()
    );

    const apiRes = await request(app)
      .get("/api/students")
      .set(authHeader(dist1));
    expect(apiRes.status).toBe(200);
    const apiIds = (apiRes.body || []).map((s) => s.id).sort();
    expect(apiIds).toEqual(
      predicted.collections.students.visibleIds.sort()
    );
  });

  it("district cannot read another district via report or student roster", async () => {
    const foreign = await request(app)
      .get("/api/reports/teacher/district/tn-madurai")
      .set(authHeader(dist1));
    expect(foreign.status).toBe(403);

    const students = await request(app)
      .get("/api/students")
      .set(authHeader(dist1));
    expect((students.body || []).map((s) => s.id)).not.toContain("stu-m1");

    const predicted = inspectSubjectVisibility(
      fixture.users.find((u) => u.username === "dist1"),
      fixture
    );
    expect(predicted.collections.sessions.visibleIds).toEqual(["sess-c"]);
    expect(predicted.collections.sessions.visibleIds).not.toContain("sess-m");
  });

  it("directory lists both districts for admin", async () => {
    const res = await request(app)
      .get("/api/tenancy/directory")
      .set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.districts.map((d) => d.id).sort()).toEqual([
      "tn-chennai",
      "tn-madurai",
    ]);
  });

  it("non-admin cannot call the inspector", async () => {
    const res = await request(app)
      .get("/api/tenancy/inspect/dist1")
      .set(authHeader(dist1));
    expect(res.status).toBe(403);
  });
});
