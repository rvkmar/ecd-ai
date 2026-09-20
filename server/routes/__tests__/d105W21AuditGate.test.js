// server/routes/__tests__/d105W21AuditGate.test.js
//
// W21 / D105 exit check: "Who promoted this Task Model to operational,
// when, and on what evidence" is ONE query on /api/auditLog.
// Also: auditLog is admin-only and not tenant-scoped; the four alerts exist.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { isTenantScopedCollection } from "../../utils/tenancyScope.js";
import { evaluateOpsAlerts } from "../../utils/opsAlerts.js";
import { __testing__ as submitTesting } from "../../utils/submitStats.js";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { username: "admin1", role: req.headers["x-test-role"] || "admin" };
    next();
  },
  authorizeRole: (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.sendStatus(403);
    next();
  },
}));

vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: vi.fn(),
}));

describe("D105 W21 audit gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitTesting.reset();
  });

  afterEach(() => {
    submitTesting.reset();
  });

  it("answers TM→operational in one GET /api/auditLog query", async () => {
    const { loadDB } = await import("../../../src/utils/db-server.js");
    loadDB.mockReturnValue({
      auditLog: [
        {
          id: "a-noise",
          at: "2026-09-19T10:00:00.000Z",
          action: "lifecycle.transition",
          actor: { userId: "admin1", role: "admin" },
          entity: { collection: "taskModels", id: "tm_other", version: 1 },
          detail: { from: "confirmed", to: "operational" },
          requestId: "r0",
        },
        {
          id: "a-promo",
          at: "2026-09-20T08:00:00.000Z",
          action: "lifecycle.transition",
          actor: { userId: "admin_ravikumar", role: "admin" },
          entity: { collection: "taskModels", id: "tm_gate", version: 3 },
          detail: { from: "confirmed", to: "operational", validatorPassed: true },
          requestId: "req-w21",
        },
        {
          id: "a-draft",
          at: "2026-09-20T07:00:00.000Z",
          action: "lifecycle.transition",
          actor: { userId: "admin_ravikumar", role: "admin" },
          entity: { collection: "taskModels", id: "tm_gate", version: 2 },
          detail: { from: "draft", to: "reviewed" },
          requestId: "r1",
        },
      ],
    });

    vi.resetModules();
    const { default: router } = await import("../auditLogRoutes.js");
    const app = express();
    app.use(express.json());
    app.use("/api/auditLog", router);

    // ONE query — entity + action + toStatus.
    const res = await request(app).get("/api/auditLog").query({
      entityCollection: "taskModels",
      entityId: "tm_gate",
      action: "lifecycle.transition",
      toStatus: "operational",
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const row = res.body[0];
    expect(row.actor.userId).toBe("admin_ravikumar");
    expect(row.at).toBe("2026-09-20T08:00:00.000Z");
    expect(row.detail).toEqual({
      from: "confirmed",
      to: "operational",
      validatorPassed: true,
    });
  });

  it("keeps auditLog admin-only and not tenant-scoped", () => {
    expect(isTenantScopedCollection("auditLog")).toBe(false);
  });

  it("evaluates exactly four named alerts", () => {
    submitTesting.reset();
    for (let i = 0; i < 12; i += 1) submitTesting.push(Date.now(), false);

    const result = evaluateOpsAlerts(
      {
        queue: { depthAlarm: true, queued: 25, depthAlarmThreshold: 20 },
        backup: { ageMs: 40 * 60 * 60 * 1000, fileCount: 1 },
      },
      Array.from({ length: 25 }, (_, i) => ({
        action: "auth.failure",
        at: new Date().toISOString(),
        id: `af-${i}`,
      }))
    );

    expect(result.alerts).toHaveLength(4);
    expect(result.alerts.map((a) => a.id).sort()).toEqual(
      [
        "auth.failure_rate",
        "backup.age",
        "calibration.queue_depth",
        "session.submit_error_rate",
      ].sort()
    );
    expect(result.firingCount).toBe(4);
  });
});

describe("D105 ops routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitTesting.reset();
  });

  it("GET /api/ops/alerts is admin-only", async () => {
    const { loadDB } = await import("../../../src/utils/db-server.js");
    loadDB.mockReturnValue({ auditLog: [], calibrationJobs: [] });

    vi.resetModules();
    vi.doMock("../../utils/systemStatus.js", () => ({
      collectSystemStatus: async () => ({
        at: new Date().toISOString(),
        queue: { queued: 0, depthAlarm: false, depthAlarmThreshold: 20 },
        backup: { ageMs: 1000, fileCount: 1 },
        health: { ok: true },
        readiness: { ok: true },
        process: {},
        database: {},
        r: {},
        migrations: {},
      }),
    }));

    const { default: router } = await import("../opsRoutes.js");
    const app = express();
    app.use(express.json());
    app.use("/api/ops", router);

    const denied = await request(app)
      .get("/api/ops/alerts")
      .set("x-test-role", "district");
    expect(denied.status).toBe(403);

    const ok = await request(app).get("/api/ops/alerts");
    expect(ok.status).toBe(200);
    expect(ok.body.alerts).toHaveLength(4);
  });
});
