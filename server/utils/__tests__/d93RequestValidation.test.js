// D93 — input sanitization + submit rate limit + filter hardening.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import {
  sanitizeRequestInputs,
  assertSafeEqualityFilter,
} from "../requestValidation.js";

describe("requestValidation helpers", () => {
  it("assertSafeEqualityFilter refuses operator keys and nested values", () => {
    expect(() => assertSafeEqualityFilter({ username: "teach1" })).not.toThrow();
    expect(() => assertSafeEqualityFilter({ $or: [] })).toThrow(/not allowed/);
    expect(() => assertSafeEqualityFilter({ username: { $ne: null } })).toThrow(
      /scalar/
    );
  });
});

describe("sanitizeRequestInputs middleware", () => {
  function app() {
    const a = express();
    a.use(express.json());
    a.use("/x", sanitizeRequestInputs);
    a.get("/x/:id", (req, res) => res.json({ id: req.params.id, q: req.query }));
    return a;
  }

  it("allows a normal id and string query", async () => {
    const res = await request(app()).get("/x/tm123?status=draft");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("tm123");
  });

  it("rejects path values outside the safe id pattern", async () => {
    const res = await request(app()).get("/x/a$b");
    expect(res.status).toBe(400);
  });

  it("rejects operator-shaped query objects", async () => {
    const res = await request(app()).get("/x/tm123?status[$gt]=1");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/query/i);
  });
});

describe("dbAdapter filter hardening", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("updateWhere refuses an operator filter before touching storage", async () => {
    vi.doMock("../../src/utils/schema.js", () => ({
      schema: {},
      validateEntity: () => ({ valid: true, errors: [] }),
    }));
    process.env.DB_MODE = "json";
    const { dbAdapter } = await import("../dbAdapter.js");
    await expect(
      dbAdapter.updateWhere("users", { $where: "1" }, { role: "admin" })
    ).rejects.toThrow(/not allowed/);
  });
});

describe("POST /api/sessions/:id/submit rate limit", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SUBMIT_RATE_LIMIT_MAX = "3";
    process.env.JWT_SECRET ||=
      "test-only-secret-do-not-use-outside-automated-tests-please-thanks";
  });

  afterEach(() => {
    delete process.env.SUBMIT_RATE_LIMIT_MAX;
  });

  it("returns 429 after the per-user submit budget is exhausted", async () => {
    vi.doMock("../../src/utils/db-server.js", () => ({
      loadDB: () => ({ sessions: [], students: [], users: [], items: [], questions: [] }),
      saveDB: () => {},
      finishSession: () => {},
    }));

    const { default: sessionRoutes } = await import("../../routes/sessionRoutes.js");
    const { setCachedAuthEpoch } = await import("../tokenService.js");
    const jwt = (await import("jsonwebtoken")).default;
    const { JWT_SECRET } = await import("../../config/jwt.js");
    setCachedAuthEpoch("stud1", 0);
    const token = jwt.sign(
      { username: "stud1", role: "student", ae: 0 },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const app = express();
    app.use(express.json());
    app.use("/api/sessions", sessionRoutes);

    let last;
    for (let i = 0; i < 4; i++) {
      last = await request(app)
        .post("/api/sessions/s-rate-test/submit")
        .set("Authorization", `Bearer ${token}`)
        .send({ itemId: "i1" });
    }
    expect(last.status).toBe(429);
    expect(last.body.error).toMatch(/submit/i);
  });
});
