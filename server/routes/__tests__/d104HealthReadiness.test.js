// server/routes/__tests__/d104HealthReadiness.test.js
//
// D104 exit check: stopping R changes calibration readiness but leaves
// overall health green (and sessions still serveable).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";
import os from "os";
import path from "path";
import jwt from "jsonwebtoken";
import { collectSystemStatus } from "../../utils/systemStatus.js";
import { JWT_SECRET } from "../../config/jwt.js";

function bearer(role, username = `${role}1`) {
  return `Bearer ${jwt.sign(
    { username, role, ae: 0, typ: "access" },
    JWT_SECRET,
    { expiresIn: "1h" }
  )}`;
}

describe("D104 health vs readiness", () => {
  let tmpDir;
  let prevDb;
  let prevBackup;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "d104-"));
    prevDb = process.env.ECD_DB_FILE;
    prevBackup = process.env.ECD_BACKUP_DIR;
    process.env.ECD_DB_FILE = path.join(tmpDir, "db.json");
    process.env.ECD_BACKUP_DIR = path.join(tmpDir, "backups");
    fs.writeFileSync(
      process.env.ECD_DB_FILE,
      JSON.stringify({ calibrationJobs: [{ id: "j1", status: "queued" }], sessions: [] })
    );
    fs.mkdirSync(process.env.ECD_BACKUP_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.ECD_BACKUP_DIR, "db.json.old"), "{}");
  });

  afterEach(() => {
    if (prevDb === undefined) delete process.env.ECD_DB_FILE;
    else process.env.ECD_DB_FILE = prevDb;
    if (prevBackup === undefined) delete process.env.ECD_BACKUP_DIR;
    else process.env.ECD_BACKUP_DIR = prevBackup;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("R unreachable: health stays ok, readiness fails for calibration", async () => {
    const down = async () => ({
      ok: false,
      status: 0,
      json: null,
      error: { message: "R request failed" },
    });

    const status = await collectSystemStatus({ rHealthFn: down, rTimeoutMs: 50 });

    expect(status.health.ok).toBe(true);
    expect(status.health.servingSessions).toBe(true);
    expect(status.database.ecd.mode).toBe("ecd-json");
    expect(status.database.ecd.sessionsBackend).toBe("file");
    expect(status.readiness.ok).toBe(false);
    expect(status.readiness.calibration).toBe(false);
    expect(status.readiness.reason).toBe("r_unreachable");
    expect(status.r.reachable).toBe(false);
    expect(status.queue.queued).toBe(1);
    expect(status.migrations.registryCount).toBeGreaterThan(0);
    expect(status.backup.fileCount).toBe(1);
    expect(status.backup.ageMs).toEqual(expect.any(Number));
  });

  it("GET /api/health keeps mode ecd-json and names the session and audit stores", async () => {
    const { default: router } = await import("../healthRoutes.js");
    const app = express();
    app.use(express.json());
    app.use("/api", router);
    const previousSessions = process.env.SESSIONS_BACKEND;
    const previousAudit = process.env.AUDITLOG_BACKEND;

    try {
      if (previousSessions === undefined) delete process.env.SESSIONS_BACKEND;
      else process.env.SESSIONS_BACKEND = previousSessions;
      if (previousAudit === undefined) delete process.env.AUDITLOG_BACKEND;
      else process.env.AUDITLOG_BACKEND = previousAudit;

      const fileHealth = await request(app).get("/api/health");
      expect(fileHealth.status).toBe(200);
      expect(fileHealth.body.database.mode).toBe("ecd-json");
      expect(fileHealth.body.database.sessionsBackend).toBe("file");
      expect(fileHealth.body.database.auditLogBackend).toBe("file");
      expect(fileHealth.body.servingSessions).toBe(true);

      process.env.SESSIONS_BACKEND = "mongo";
      process.env.AUDITLOG_BACKEND = "mongo";
      const mongoHealth = await request(app).get("/api/health");
      expect(mongoHealth.status).toBe(200);
      expect(mongoHealth.body.database.mode).toBe("ecd-json");
      expect(mongoHealth.body.database.sessionsBackend).toBe("mongo");
      expect(mongoHealth.body.database.auditLogBackend).toBe("mongo");
      expect(mongoHealth.body.servingSessions).toBe(true);

      process.env.SESSIONS_BACKEND = "memory";
      process.env.AUDITLOG_BACKEND = "memory";
      const memoryHealth = await request(app).get("/api/health");
      expect(memoryHealth.body.database.mode).toBe("ecd-json");
      expect(memoryHealth.body.database.sessionsBackend).toBe("memory");
      expect(memoryHealth.body.database.auditLogBackend).toBe("memory");
    } finally {
      if (previousSessions === undefined) delete process.env.SESSIONS_BACKEND;
      else process.env.SESSIONS_BACKEND = previousSessions;
      if (previousAudit === undefined) delete process.env.AUDITLOG_BACKEND;
      else process.env.AUDITLOG_BACKEND = previousAudit;
    }
  });

  it("R healthy: readiness ok for calibration", async () => {
    const up = async () => ({
      ok: true,
      status: 200,
      json: { status: "healthy", packages: { mirt: "1.47" } },
    });

    const status = await collectSystemStatus({ rHealthFn: up, rTimeoutMs: 50 });

    expect(status.health.ok).toBe(true);
    expect(status.readiness.ok).toBe(true);
    expect(status.readiness.reason).toBeNull();
    expect(status.r.reachable).toBe(true);
  });
});

describe("D104 HTTP endpoints", () => {
  let tmpDir;
  let prevDb;
  let prevBackup;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "d104-http-"));
    prevDb = process.env.ECD_DB_FILE;
    prevBackup = process.env.ECD_BACKUP_DIR;
    process.env.ECD_DB_FILE = path.join(tmpDir, "db.json");
    process.env.ECD_BACKUP_DIR = path.join(tmpDir, "backups");
    fs.writeFileSync(process.env.ECD_DB_FILE, JSON.stringify({ calibrationJobs: [] }));
    fs.mkdirSync(process.env.ECD_BACKUP_DIR, { recursive: true });
  });

  afterEach(() => {
    if (prevDb === undefined) delete process.env.ECD_DB_FILE;
    else process.env.ECD_DB_FILE = prevDb;
    if (prevBackup === undefined) delete process.env.ECD_BACKUP_DIR;
    else process.env.ECD_BACKUP_DIR = prevBackup;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.resetModules();
    vi.doUnmock("../../utils/systemStatus.js");
  });

  async function appWithStatus(statusFactory) {
    vi.resetModules();
    vi.doMock("../../utils/systemStatus.js", () => ({
      collectSystemStatus: statusFactory,
    }));
    const { default: router } = await import("../healthRoutes.js");
    // resetModules drops the epoch cache seeded in test setup. Minted
    // tokens below must hit this fresh copy, the one the router imported.
    const { setCachedAuthEpoch } = await import("../../utils/tokenService.js");
    for (const username of ["admin1", "teacher1", "district1", "student1"]) {
      setCachedAuthEpoch(username, 0);
    }
    const app = express();
    app.use(express.json());
    app.use("/api", router);
    return app;
  }

  it("GET /api/health is 200 when R is down; GET /api/ready is 503", async () => {
    const status = {
      at: "2026-09-20T00:00:00.000Z",
      process: { ok: true, uptimeSec: 1, pid: 1, node: "v24" },
      database: { ok: true, ecd: { ok: true, mode: "ecd-json" }, userStore: { ok: true } },
      r: { ok: false, reachable: false, url: "http://r-backend:4000", status: 0 },
      queue: { queued: 0, running: 0 },
      migrations: {
        latestId: null,
        latestAppliedAt: null,
        appliedCount: 0,
        registryCount: 5,
        pendingIds: [],
      },
      backup: { latestAt: null, ageMs: null, fileCount: 0 },
      health: { ok: true, servingSessions: true },
      readiness: {
        ok: false,
        calibration: false,
        reason: "r_unreachable",
      },
    };

    const app = await appWithStatus(async () => status);

    const health = await request(app).get("/api/health");
    expect(health.status).toBe(200);
    expect(health.body.status).toBe("ok");
    expect(health.body.servingSessions).toBe(true);
    expect(health.body.r.reachable).toBe(false);

    const ready = await request(app).get("/api/ready");
    expect(ready.status).toBe(503);
    expect(ready.body.status).toBe("not_ready");
    expect(ready.body.healthOk).toBe(true);
    expect(ready.body.servingSessions).toBe(true);
  });

  it("GET /api/metrics includes migration version and backup age fields", async () => {
    const status = {
      at: "2026-09-20T00:00:00.000Z",
      process: { ok: true, uptimeSec: 1, pid: 1, node: "v24" },
      database: { ok: true, ecd: { ok: true, mode: "ecd-json" }, userStore: { ok: true } },
      r: { ok: true, reachable: true, url: "http://r-backend:4000", status: 200, rStatus: "healthy" },
      queue: { queued: 2, running: 1, maxConcurrent: 1 },
      migrations: {
        latestId: "005-remove-lifecycle-meta",
        latestAppliedAt: "2026-09-20T00:00:00.000Z",
        appliedCount: 5,
        registryCount: 5,
        pendingIds: [],
      },
      backup: { latestAt: "2026-09-19T00:00:00.000Z", ageMs: 86400000, fileCount: 3 },
      health: { ok: true, servingSessions: true },
      readiness: { ok: true, calibration: true, reason: null },
    };

    const app = await appWithStatus(async () => status);
    const res = await request(app)
      .get("/api/metrics")
      .set("Authorization", bearer("admin"));
    expect(res.status).toBe(200);
    expect(res.body.migrations.latestId).toBe("005-remove-lifecycle-meta");
    expect(res.body.backup.ageMs).toBe(86400000);
    expect(res.body.queue.queued).toBe(2);
  });

  it("GET /api/metrics requires an admin; health and ready stay public", async () => {
    const status = {
      at: "2026-09-20T00:00:00.000Z",
      process: { ok: true, uptimeSec: 1, pid: 1, node: "v24" },
      database: { ok: true, ecd: { ok: true, mode: "ecd-json" }, userStore: { ok: true } },
      r: { ok: true, reachable: true, url: "http://r-backend:4000", status: 200, rStatus: "healthy" },
      queue: { queued: 2, running: 1, maxConcurrent: 1 },
      migrations: {
        latestId: "005-remove-lifecycle-meta",
        latestAppliedAt: "2026-09-20T00:00:00.000Z",
        appliedCount: 5,
        registryCount: 5,
        pendingIds: [],
      },
      backup: { latestAt: "2026-09-19T00:00:00.000Z", ageMs: 86400000, fileCount: 3 },
      health: { ok: true, servingSessions: true },
      readiness: { ok: true, calibration: true, reason: null },
    };
    const app = await appWithStatus(async () => status);

    const open = await request(app).get("/api/metrics");
    expect(open.status).toBe(401);
    expect(open.body.migrations).toBeUndefined();

    const garbage = await request(app)
      .get("/api/metrics")
      .set("Authorization", "Bearer not-a-token");
    expect(garbage.status).toBe(403);
    expect(garbage.body.queue).toBeUndefined();

    const teacher = await request(app)
      .get("/api/metrics")
      .set("Authorization", bearer("teacher"));
    expect(teacher.status).toBe(403);
    expect(teacher.body.backup).toBeUndefined();

    const district = await request(app)
      .get("/api/metrics")
      .set("Authorization", bearer("district"));
    expect(district.status).toBe(403);

    const student = await request(app)
      .get("/api/metrics")
      .set("Authorization", bearer("student"));
    expect(student.status).toBe(403);

    const admin = await request(app)
      .get("/api/metrics")
      .set("Authorization", bearer("admin"));
    expect(admin.status).toBe(200);
    expect(admin.body.migrations.latestId).toBe("005-remove-lifecycle-meta");
    expect(admin.body.backup.ageMs).toBe(86400000);

    const health = await request(app).get("/api/health");
    expect(health.status).toBe(200);
    expect(health.body.status).toBe("ok");

    const ready = await request(app).get("/api/ready");
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe("ready");
  });

  it("POST /api/client-errors accepts a release-tagged report", async () => {
    const app = await appWithStatus(async () => ({
      health: { ok: true },
      readiness: { ok: true },
      at: new Date().toISOString(),
      process: {},
      database: { ecd: { ok: true, mode: "ecd-json" } },
      r: { reachable: true, url: "x" },
      queue: {},
      migrations: {},
      backup: {},
    }));

    const res = await request(app)
      .post("/api/client-errors")
      .send({
        release: "1.0.0+test",
        label: "Step 3",
        errorName: "TypeError",
        message: "x is not a function",
        stack: "TypeError: x is not a function\n    at Wizard",
        href: "http://localhost/admin",
        name: "should-be-ignored-as-pii-key-if-logged-wrong",
        response: { answer: "secret" },
      });
    expect(res.status).toBe(204);
  });
});
