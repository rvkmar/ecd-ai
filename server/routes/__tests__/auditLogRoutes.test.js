// server/routes/__tests__/auditLogRoutes.test.js
// D101: append-only audit log HTTP surface.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

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

async function buildApp(auditLog = []) {
  vi.resetModules();
  const { loadDB } = await import("../../../src/utils/db-server.js");
  loadDB.mockReturnValue({ auditLog });
  const { default: router } = await import("../auditLogRoutes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/auditLog", router);
  return { app };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/auditLog", () => {
  it("returns filtered rows for admin", async () => {
    const { app } = await buildApp([
      {
        id: "a1",
        at: "2026-09-20T01:00:00.000Z",
        action: "lifecycle.transition",
        actor: { userId: "admin1", role: "admin" },
        entity: { collection: "evidenceModels", id: "em1", version: 1 },
        detail: { from: "confirmed", to: "operational" },
        requestId: "r1",
      },
      {
        id: "a2",
        at: "2026-09-20T02:00:00.000Z",
        action: "auth.failure",
        actor: { userId: "teach1", role: null },
        entity: { collection: "users", id: "teach1", version: null },
        detail: { reason: "invalid_credentials" },
        requestId: "r2",
      },
    ]);

    const res = await request(app)
      .get("/api/auditLog")
      .query({ entityCollection: "evidenceModels" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe("a1");
  });

  it("refuses mutation", async () => {
    const { app } = await buildApp([]);
    const res = await request(app).post("/api/auditLog").send({ action: "x" });
    expect(res.status).toBe(405);
  });

  it("refuses non-admin", async () => {
    const { app } = await buildApp([]);
    const res = await request(app)
      .get("/api/auditLog")
      .set("x-test-role", "district");
    expect(res.status).toBe(403);
  });
});
