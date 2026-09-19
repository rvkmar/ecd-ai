// @vitest-environment node
/**
 * D98 — row-level tenancy negatives (HTTP).
 * Storage filters landed in D97; this proves routes return nothing for
 * out-of-scope rows (not that the UI hides them).
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

const fixture = {
  students: [
    { id: "stu-c", name: "Chennai", districtId: "tn-chennai", schoolId: "sch-1" },
    { id: "stu-c2", name: "Chennai2", districtId: "tn-chennai", schoolId: "sch-2" },
    { id: "stu-m", name: "Madurai", districtId: "tn-madurai", schoolId: "sch-m" },
  ],
  users: [
    { id: "u-admin1", username: "admin1", role: "admin", authEpoch: 0, profile: { name: "Admin" } },
    { id: "u-dist1", username: "dist1", role: "district", authEpoch: 0, profile: { districtId: "tn-chennai" } },
    { id: "u-stud1", username: "stud1", role: "student", authEpoch: 0, profile: { districtId: "tn-chennai", schoolId: "sch-1" } },
    { id: "u-stud-m", username: "stud-madurai", role: "student", authEpoch: 0, profile: { districtId: "tn-madurai", schoolId: "sch-m" } },
    { id: "u-teach1", username: "teach1", role: "teacher", authEpoch: 0, profile: { districtId: "tn-chennai", schoolId: "sch-1" } },
  ],
  sessions: [
    { id: "sess-c", studentId: "stud1", studentIds: ["stud1"], status: "in_progress", taskIds: ["t1"], responses: [], selectionStrategy: "fixed" },
    { id: "sess-m", studentId: "stud-madurai", studentIds: ["stud-madurai"], status: "in_progress", taskIds: ["t1"], responses: [{ taskId: "t1", rawAnswer: "secret-madurai" }], selectionStrategy: "fixed" },
  ],
  tasks: [
    { id: "task-c", districtId: "tn-chennai", name: "C task" },
    { id: "task-m", districtId: "tn-madurai", name: "M task" },
  ],
  announcements: [
    { id: "ann-c", districtId: "tn-chennai", title: "C", body: "c", visibility: "public", audienceRoles: ["district", "teacher", "student"], createdBy: "dist1" },
    { id: "ann-m", districtId: "tn-madurai", title: "M", body: "m", visibility: "public", audienceRoles: ["district", "teacher", "student"], createdBy: "dist-m" },
  ],
  analysisArtefacts: [
    { id: "art-c", kind: "item-parameters", scope: { districtId: "tn-chennai" } },
    { id: "art-m", kind: "item-parameters", scope: { districtId: "tn-madurai" } },
    { id: "art-open", kind: "item-parameters", scope: {} },
  ],
  calibrationJobs: [
    { id: "job-c", status: "succeeded", scope: { districtId: "tn-chennai" } },
    { id: "job-m", status: "succeeded", scope: { districtId: "tn-madurai" } },
    { id: "job-open", status: "succeeded", scope: {} },
  ],
  policies: [{ id: "p-fixed", type: "fixed" }],
};

vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: vi.fn(() => applyTenancyToDb(fixture)),
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
const sessionsRoutes = (await import("../sessionRoutes.js")).default;
const tasksRoutes = (await import("../tasksRoutes.js")).default;
const announcementsRoutes = (await import("../announcementsRoutes.js")).default;
const artefactsRoutes = (await import("../analysisArtefactsRoutes.js")).default;
const jobsRoutes = (await import("../calibrationJobsRoutes.js")).default;
const reportsRoutes = (await import("../reportsRoutes.js")).default;

function accessToken({ username, role, districtId, schoolId }) {
  const payload = { username, role, ae: 0, typ: "access", jti: `d98-${username}-${Date.now()}` };
  if (districtId) payload.districtId = districtId;
  if (schoolId) payload.schoolId = schoolId;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
}

const actors = {
  admin: { username: "admin1", role: "admin" },
  district: { username: "dist1", role: "district", districtId: "tn-chennai" },
  teacher: { username: "teach1", role: "teacher", districtId: "tn-chennai", schoolId: "sch-1" },
  student: { username: "stud1", role: "student", districtId: "tn-chennai", schoolId: "sch-1" },
};

function authHeader(actor) {
  setCachedAuthEpoch(actor.username, 0);
  return { Authorization: `Bearer ${accessToken(actor)}` };
}

function tenancyErrorHandler(err, _req, res, next) {
  if (err?.code === "TENANCY_REQUIRED" || err?.name === "TenancyError") {
    return res.status(403).json({ error: err.message, code: "TENANCY_REQUIRED" });
  }
  return next(err);
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/students", studentsRoutes);
  app.use("/api/sessions", sessionsRoutes);
  app.use("/api/tasks", tasksRoutes);
  app.use("/api/announcements", announcementsRoutes);
  app.use("/api/analysisArtefacts", artefactsRoutes);
  app.use("/api/calibrationJobs", jobsRoutes);
  app.use("/api/reports", reportsRoutes);
  app.use(tenancyErrorHandler);
  return app;
}

describe("D98 row-level tenancy negatives (HTTP)", () => {
  let app;
  beforeEach(() => {
    _resetTokenServiceForTests();
    app = buildApp();
  });

  describe("district cannot read another district", () => {
    it("GET /api/students omits other districts", async () => {
      const res = await request(app).get("/api/students").set(authHeader(actors.district));
      expect(res.status).toBe(200);
      const ids = (res.body || []).map((s) => s.id);
      expect(ids).toEqual(expect.arrayContaining(["stu-c", "stu-c2"]));
      expect(ids).not.toContain("stu-m");
    });

    it("GET /api/students/:id is 404 for another district", async () => {
      const res = await request(app).get("/api/students/stu-m").set(authHeader(actors.district));
      expect(res.status).toBe(404);
    });

    it("GET /api/sessions omits other-district sessions", async () => {
      const res = await request(app).get("/api/sessions").set(authHeader(actors.district));
      expect(res.status).toBe(200);
      const ids = (res.body || []).map((s) => s.id);
      expect(ids).toContain("sess-c");
      expect(ids).not.toContain("sess-m");
    });

    it("GET /api/sessions/:id returns nothing for another district", async () => {
      const res = await request(app).get("/api/sessions/sess-m").set(authHeader(actors.district));
      expect([403, 404]).toContain(res.status);
      expect(JSON.stringify(res.body || {})).not.toMatch(/secret-madurai/);
    });

    it("GET /api/tasks omits other-district tasks", async () => {
      const res = await request(app).get("/api/tasks").set(authHeader(actors.district));
      expect(res.status).toBe(200);
      expect((res.body || []).map((t) => t.id)).toEqual(["task-c"]);
    });

    it("GET /api/announcements omits other-district rows", async () => {
      const res = await request(app).get("/api/announcements").set(authHeader(actors.district));
      expect(res.status).toBe(200);
      const ids = (res.body || []).map((a) => a.id);
      expect(ids).toContain("ann-c");
      expect(ids).not.toContain("ann-m");
    });

    it("GET /api/analysisArtefacts omits other districts and unscoped", async () => {
      const res = await request(app).get("/api/analysisArtefacts").set(authHeader(actors.district));
      expect(res.status).toBe(200);
      expect((res.body || []).map((a) => a.id)).toEqual(["art-c"]);
    });

    it("GET /api/analysisArtefacts/:id is 404 for foreign/unscoped", async () => {
      expect((await request(app).get("/api/analysisArtefacts/art-m").set(authHeader(actors.district))).status).toBe(404);
      expect((await request(app).get("/api/analysisArtefacts/art-open").set(authHeader(actors.district))).status).toBe(404);
    });

    it("GET /api/calibrationJobs omits other districts and unscoped", async () => {
      const res = await request(app).get("/api/calibrationJobs").set(authHeader(actors.district));
      expect(res.status).toBe(200);
      expect((res.body || []).map((j) => j.id)).toEqual(["job-c"]);
    });

    it("GET /api/reports/teacher/district/:foreignId is 403", async () => {
      const res = await request(app).get("/api/reports/teacher/district/tn-madurai").set(authHeader(actors.district));
      expect(res.status).toBe(403);
    });
  });

  describe("teacher school scope", () => {
    it("GET /api/students prefers school when schoolId claim present", async () => {
      const res = await request(app).get("/api/students").set(authHeader(actors.teacher));
      expect(res.status).toBe(200);
      expect((res.body || []).map((s) => s.id)).toEqual(["stu-c"]);
    });

    it("GET /api/sessions omits other-district sessions", async () => {
      const res = await request(app).get("/api/sessions").set(authHeader(actors.teacher));
      expect(res.status).toBe(200);
      const ids = (res.body || []).map((s) => s.id);
      expect(ids).toContain("sess-c");
      expect(ids).not.toContain("sess-m");
    });
  });

  describe("student self scope", () => {
    it("GET /api/students does not dump peer roster", async () => {
      const res = await request(app).get("/api/students").set(authHeader(actors.student));
      expect(res.status).toBe(200);
      expect(res.body || []).toEqual([]);
    });

    it("GET /api/sessions omits peers", async () => {
      const res = await request(app).get("/api/sessions").set(authHeader(actors.student));
      expect(res.status).toBe(200);
      expect((res.body || []).map((s) => s.id)).toEqual(["sess-c"]);
    });

    it("GET /api/sessions/:peerId returns nothing", async () => {
      const res = await request(app).get("/api/sessions/sess-m").set(authHeader(actors.student));
      expect([403, 404]).toContain(res.status);
      expect(JSON.stringify(res.body || {})).not.toMatch(/secret-madurai/);
    });

    it("GET /api/reports/session/:peerId returns nothing", async () => {
      const res = await request(app).get("/api/reports/session/sess-m").set(authHeader(actors.student));
      expect([403, 404]).toContain(res.status);
      expect(JSON.stringify(res.body || {})).not.toMatch(/secret-madurai/);
    });

    it("cannot list analysisArtefacts (role gate)", async () => {
      const res = await request(app).get("/api/analysisArtefacts").set(authHeader(actors.student));
      expect(res.status).toBe(403);
    });
  });

  describe("admin remains unscoped", () => {
    it("GET /api/students sees every district", async () => {
      const res = await request(app).get("/api/students").set(authHeader(actors.admin));
      expect(res.status).toBe(200);
      expect((res.body || []).map((s) => s.id).sort()).toEqual(["stu-c", "stu-c2", "stu-m"]);
    });

    it("GET /api/analysisArtefacts includes unscoped rows", async () => {
      const res = await request(app).get("/api/analysisArtefacts").set(authHeader(actors.admin));
      expect(res.status).toBe(200);
      expect((res.body || []).map((a) => a.id).sort()).toEqual(["art-c", "art-m", "art-open"]);
    });
  });
});
