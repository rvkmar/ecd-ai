// @vitest-environment node
/**
 * D99 — aggregate leakage: named scope, small-cell suppression, exposure gate.
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
import {
  MIN_CELL_SIZE,
  suppressCount,
  suppressIrtSummary,
  redactItemExposure,
  redactCalibrationJobForViewer,
  maySeeGlobalExposure,
} from "../../utils/aggregatePrivacy.js";
import { applyTenancyToDb, filterRows } from "../../utils/tenancyScope.js";
import { getTenancyContext } from "../../utils/tenancyContext.js";

const fixture = {
  students: [
    { id: "stu-1", name: "A", districtId: "tn-chennai", schoolId: "sch-1", classId: "6A" },
    { id: "stu-2", name: "B", districtId: "tn-chennai", schoolId: "sch-1", classId: "6A" },
    { id: "stu-3", name: "C", districtId: "tn-chennai", schoolId: "sch-1", classId: "6A" },
    { id: "stu-m", name: "M", districtId: "tn-madurai", schoolId: "sch-m", classId: "7B" },
  ],
  users: [
    { id: "u-a", username: "admin1", role: "admin", authEpoch: 0 },
    { id: "u-d", username: "dist1", role: "district", authEpoch: 0, profile: { districtId: "tn-chennai" } },
    { id: "u-t", username: "teach1", role: "teacher", authEpoch: 0, profile: { districtId: "tn-chennai", schoolId: "sch-1" } },
  ],
  sessions: [
    {
      id: "s1",
      studentId: "stu-1",
      selectionStrategy: "IRT",
      studentModel: { irtTheta: 0.2 },
      taskIds: ["t1"],
      responses: [{ scoredValue: 1, evidenceId: "ev1" }],
      finishedAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "s2",
      studentId: "stu-2",
      selectionStrategy: "IRT",
      studentModel: { irtTheta: -0.1 },
      taskIds: ["t1"],
      responses: [{ scoredValue: 0, evidenceId: "ev1" }],
      finishedAt: "2026-09-02T00:00:00.000Z",
    },
    {
      id: "s-m",
      studentId: "stu-m",
      selectionStrategy: "IRT",
      studentModel: { irtTheta: 2 },
      taskIds: ["t1"],
      responses: [{ scoredValue: 99, evidenceId: "ev-secret" }],
      finishedAt: "2026-09-03T00:00:00.000Z",
    },
  ],
  tasks: [{ id: "t1", generatedEvidenceIds: ["selected-obs"] }],
  items: [
    {
      id: "item-1",
      status: "operational",
      exposureControl: { usageCount: 42, maxUsageBeforeRetire: 100 },
      psychometrics: { calibrationStatus: "calibrated", irtParams: { a: 1, b: 0, sampleSize: 3 } },
    },
  ],
  evidenceModels: [],
  policies: [],
  analysisArtefacts: [
    {
      id: "art-1",
      kind: "attribute-profile-summary",
      scope: { districtId: "tn-chennai" },
      sampleSize: 3,
      parameters: {
        nMaster: 2,
        profileDistribution: [{ key: "1100", count: 2 }],
      },
    },
  ],
  calibrationJobs: [
    {
      id: "job-1",
      status: "succeeded",
      scope: { districtId: "tn-chennai" },
      request: {
        cohort: { id: "c1", members: [{ id: "p1", mastery: {} }] },
        responses: [[1, 0, 1]],
      },
      response: { sampleSize: 3 },
    },
  ],
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

const reportsRoutes = (await import("../reportsRoutes.js")).default;
const itemsRoutes = (await import("../itemsRoutes.js")).default;
const itemAnalyticsRoutes = (await import("../itemAnalyticsRoutes.js")).default;
const artefactsRoutes = (await import("../analysisArtefactsRoutes.js")).default;
const jobsRoutes = (await import("../calibrationJobsRoutes.js")).default;

function accessToken({ username, role, districtId, schoolId }) {
  const payload = { username, role, ae: 0, typ: "access", jti: `d99-${username}` };
  if (districtId) payload.districtId = districtId;
  if (schoolId) payload.schoolId = schoolId;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
}

function authHeader(actor) {
  setCachedAuthEpoch(actor.username, 0);
  return { Authorization: `Bearer ${accessToken(actor)}` };
}

const actors = {
  admin: { username: "admin1", role: "admin" },
  district: { username: "dist1", role: "district", districtId: "tn-chennai" },
  teacher: { username: "teach1", role: "teacher", districtId: "tn-chennai", schoolId: "sch-1" },
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/reports", reportsRoutes);
  app.use("/api/items", itemsRoutes);
  app.use("/api/itemAnalytics", itemAnalyticsRoutes);
  app.use("/api/analysisArtefacts", artefactsRoutes);
  app.use("/api/calibrationJobs", jobsRoutes);
  return app;
}

describe("aggregatePrivacy helpers", () => {
  it("exports MIN_CELL_SIZE = 5", () => {
    expect(MIN_CELL_SIZE).toBe(5);
  });

  it("suppresses counts below the threshold", () => {
    expect(suppressCount(3).suppressed).toBe(true);
    expect(suppressCount(3).value).toBeNull();
    expect(suppressCount(5).suppressed).toBe(false);
    expect(suppressCount(0).suppressed).toBe(false);
  });

  it("suppresses IRT blocks when n is small", () => {
    const out = suppressIrtSummary({ count: 2, mean: 0.1, stddev: 0, distribution: {} });
    expect(out.suppressed).toBe(true);
    expect(out.mean).toBeNull();
  });

  it("redacts item usageCount for non-admin", () => {
    const item = { exposureControl: { usageCount: 9, maxUsageBeforeRetire: 10 } };
    expect(redactItemExposure(item, false).exposureControl.usageCount).toBeNull();
    expect(redactItemExposure(item, true).exposureControl.usageCount).toBe(9);
  });

  it("redacts cohort members on jobs for non-admin", () => {
    const job = {
      request: { cohort: { members: [{ id: "x" }] }, responses: [[1]] },
    };
    const red = redactCalibrationJobForViewer(job, false);
    expect(red.request.cohort.members).toBeUndefined();
    expect(red.request.cohort.membersRedacted).toBe(true);
    expect(red.request.responses).toBeUndefined();
  });
});

describe("D99 aggregate HTTP surface", () => {
  let app;
  beforeEach(() => {
    _resetTokenServiceForTests();
    app = buildApp();
  });

  it("dashboard names scope and does not include foreign-district scores", async () => {
    const res = await request(app)
      .get("/api/reports/dashboard")
      .set(authHeader(actors.district));
    expect(res.status).toBe(200);
    expect(res.body.scope).toMatchObject({
      role: "district",
      districtId: "tn-chennai",
      kind: "dashboard",
    });
    expect(res.body.minCellSize).toBe(5);
    const blob = JSON.stringify(res.body);
    expect(blob).not.toMatch(/ev-secret/);
    expect(blob).not.toMatch(/99/);
  });

  it("class report omits roster names and per-student captured rows", async () => {
    const res = await request(app)
      .get("/api/reports/teacher/class/6A")
      .set(authHeader(actors.teacher));
    expect(res.status).toBe(200);
    expect(res.body.scope.kind).toBe("class-report");
    expect(res.body.students).toBeUndefined();
    expect(res.body.summary?.captured).toBeUndefined();
    expect(res.body.summary?.IRT?.suppressed).toBe(true); // n=2 < 5
  });

  it("itemAnalytics summary is admin-only", async () => {
    const denied = await request(app)
      .get("/api/itemAnalytics/summary")
      .set(authHeader(actors.district));
    expect(denied.status).toBe(403);

    const ok = await request(app)
      .get("/api/itemAnalytics/summary")
      .set(authHeader(actors.admin));
    expect(ok.status).toBe(200);
    expect(ok.body.scope.kind).toBe("item-analytics-summary");
    expect(ok.body.overexposed).toBeDefined();
  });

  it("GET /api/items redacts usageCount for district", async () => {
    const res = await request(app).get("/api/items").set(authHeader(actors.district));
    expect(res.status).toBe(200);
    expect(res.body[0].exposureControl.usageCount).toBeNull();
    expect(res.body[0].exposureControl.usageCountRedacted).toBe(true);
  });

  it("district artefact read suppresses small sampleSize", async () => {
    const res = await request(app)
      .get("/api/analysisArtefacts/art-1")
      .set(authHeader(actors.district));
    expect(res.status).toBe(200);
    expect(res.body.sampleSize).toBeNull();
    expect(res.body.sampleSizeSuppressed).toBe(true);
    expect(res.body.minCellSize).toBe(5);
  });

  it("district job read redacts cohort members", async () => {
    const res = await request(app)
      .get("/api/calibrationJobs/job-1")
      .set(authHeader(actors.district));
    expect(res.status).toBe(200);
    expect(res.body.request.cohort.membersRedacted).toBe(true);
    expect(res.body.request.cohort.members).toBeUndefined();
  });

  it("maySeeGlobalExposure is admin-only", () => {
    expect(maySeeGlobalExposure({ user: { role: "admin" } })).toBe(true);
    expect(maySeeGlobalExposure({ user: { role: "district" } })).toBe(false);
  });
});
