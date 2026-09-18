// server/routes/__tests__/usersRoutes.test.js
//
// Covers the login endpoint (success, failure, the role-mismatch
// non-enumeration fix, and account lockout) plus a boundary check that the
// admin-only user-management endpoints still require auth. dbAdapter is
// mocked — these tests exercise usersRoutes.js's own logic, not Mongo.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";
import {
  setCachedAuthEpoch,
  _resetTokenServiceForTests,
} from "../../utils/tokenService.js";

vi.mock("../../utils/dbAdapter.js", () => ({
  dbAdapter: {
    list: vi.fn(),
    insert: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    updateWhere: vi.fn(),
    remove: vi.fn(),
    removeWhere: vi.fn(),
  },
}));

const TEST_PASSWORD = "correct-horse-battery-staple";

async function makeTestUser(overrides = {}) {
  return {
    username: "teach1",
    role: "teacher",
    email: "teach1@ecd.local",
    password: await bcrypt.hash(TEST_PASSWORD, 10),
    authEpoch: 0,
    ...overrides,
  };
}

// usersRoutes.js keeps the login rate limiter and the failed-attempt
// lockout map as module-scoped state. Re-importing it fresh (via
// vi.resetModules + dynamic import) per test gives each test its own
// isolated instance of that state, so one test's failed logins can't trip
// the lockout in a different test.
async function buildApp() {
  vi.resetModules();
  _resetTokenServiceForTests();
  const { dbAdapter } = await import("../../utils/dbAdapter.js");
  const { default: usersRoutes } = await import("../usersRoutes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/users", usersRoutes);
  return { app, dbAdapter };
}

describe("POST /api/users/login", () => {
  it("returns a token for a correct username/password/role", async () => {
    const { app, dbAdapter } = await buildApp();
    dbAdapter.list.mockResolvedValue([await makeTestUser()]);

    const res = await request(app)
      .post("/api/users/login")
      .send({ username: "teach1", password: TEST_PASSWORD, role: "teacher" });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.token.length).toBeGreaterThan(10);
    expect(typeof res.body.refreshToken).toBe("string");
    expect(res.body.username).toBe("teach1");
    expect(res.body.role).toBe("teacher");
  });

  it("rejects a wrong password", async () => {
    const { app, dbAdapter } = await buildApp();
    dbAdapter.list.mockResolvedValue([await makeTestUser()]);

    const res = await request(app)
      .post("/api/users/login")
      .send({ username: "teach1", password: "wrong-password", role: "teacher" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid username or password");
  });

  it("rejects an unknown username with the same generic message as a wrong password", async () => {
    const { app, dbAdapter } = await buildApp();
    dbAdapter.list.mockResolvedValue([]);

    const res = await request(app)
      .post("/api/users/login")
      .send({ username: "ghost", password: "whatever", role: "teacher" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid username or password");
  });

  it("rejects a correct password with the wrong role, using the SAME generic message", async () => {
    // Regression test for the role-enumeration fix: previously a caller who
    // knew a valid username/password could tell "wrong role" apart from
    // "wrong password" by a distinct 403 "Role mismatch" response — that
    // let an attacker discover a real account's true role. Both failure
    // modes must now be indistinguishable.
    const { app, dbAdapter } = await buildApp();
    dbAdapter.list.mockResolvedValue([await makeTestUser()]);

    const res = await request(app)
      .post("/api/users/login")
      .send({ username: "teach1", password: TEST_PASSWORD, role: "admin" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid username or password");
  });

  it("requires username, password, and role", async () => {
    const { app } = await buildApp();
    const res = await request(app).post("/api/users/login").send({ username: "teach1" });
    expect(res.status).toBe(400);
  });

  it("locks the account out after repeated failed attempts, even with a correct password", async () => {
    const { app, dbAdapter } = await buildApp();
    dbAdapter.list.mockResolvedValue([await makeTestUser()]);

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/users/login")
        .send({ username: "teach1", password: "wrong", role: "teacher" });
    }

    const res = await request(app)
      .post("/api/users/login")
      .send({ username: "teach1", password: TEST_PASSWORD, role: "teacher" });

    expect(res.status).toBe(423);
  });

  it("does not lock out a different username after another account's failed attempts", async () => {
    const { app, dbAdapter } = await buildApp();
    dbAdapter.list.mockResolvedValue([
      await makeTestUser({ username: "teach1" }),
      await makeTestUser({ username: "stud1", role: "student" }),
    ]);

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/users/login")
        .send({ username: "teach1", password: "wrong", role: "teacher" });
    }

    const res = await request(app)
      .post("/api/users/login")
      .send({ username: "stud1", password: TEST_PASSWORD, role: "student" });

    expect(res.status).toBe(200);
  });

  it("accepts EMIS id in the username field for local teachers", async () => {
    const { app, dbAdapter } = await buildApp();
    dbAdapter.list.mockResolvedValue([
      await makeTestUser({
        username: "teach-chennai",
        profile: { emisId: "TN-TCH-CHENNAI-001", udiseId: "33030100101" },
      }),
    ]);

    const res = await request(app)
      .post("/api/users/login")
      .send({
        username: "TN-TCH-CHENNAI-001",
        password: TEST_PASSWORD,
        role: "teacher",
      });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe("teach-chennai");
    expect(res.body.mustChangePassword).toBe(false);
  });

  it("refuses password login for oidc accounts without breaking local login", async () => {
    const { app, dbAdapter } = await buildApp();
    dbAdapter.list.mockResolvedValue([
      await makeTestUser({
        username: "federated",
        authProvider: "oidc",
        password: await bcrypt.hash(TEST_PASSWORD, 10),
      }),
      await makeTestUser({ username: "teach1" }),
    ]);

    const sso = await request(app)
      .post("/api/users/login")
      .send({ username: "federated", password: TEST_PASSWORD, role: "teacher" });
    expect(sso.status).toBe(401);
    expect(sso.body.error).toMatch(/single sign-on/i);

    const local = await request(app)
      .post("/api/users/login")
      .send({ username: "teach1", password: TEST_PASSWORD, role: "teacher" });
    expect(local.status).toBe(200);
  });
});

describe("admin user-management endpoints still require auth", () => {
  it("GET /api/users rejects an unauthenticated request", async () => {
    const { app } = await buildApp();
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(401);
  });

  it("POST /api/users rejects an unauthenticated request", async () => {
    const { app } = await buildApp();
    const res = await request(app)
      .post("/api/users")
      .send({ username: "new1", password: "x", role: "teacher" });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/users/:username rejects an unauthenticated request", async () => {
    const { app } = await buildApp();
    const res = await request(app).delete("/api/users/teach1");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/users/:username/reset-password", () => {
  // Regression test for: "password reset is not persisted for existing
  // accounts admin1/dist1/teach1/stud1". Those four seed accounts are
  // created by initMongo.js (and server/users.json) WITHOUT an `id` field,
  // and the route used to call dbAdapter.update("users", target.id ||
  // username, ...), which matches on `id`. In Mongo mode that matched no
  // document and returned null without throwing, so the endpoint answered
  // 200 while the password on disk was unchanged. The route must key the
  // write on { username } instead.
  beforeEach(() => {
    _resetTokenServiceForTests();
    setCachedAuthEpoch("admin1", 0);
  });

  const adminToken = () =>
    jwt.sign({ username: "admin1", role: "admin", ae: 0 }, JWT_SECRET, {
      expiresIn: "1h",
    });

  it("updates an id-less seed account by username and persists the new hash", async () => {
    const { app, dbAdapter } = await buildApp();
    const { setCachedAuthEpoch: setEpoch } = await import("../../utils/tokenService.js");
    setEpoch("admin1", 0);
    const seed = { username: "teach1", role: "teacher", password: "old-hash" }; // note: no `id`
    dbAdapter.list.mockResolvedValue([seed]);
    dbAdapter.updateWhere.mockImplementation(async (_c, _f, updates) => ({ ...seed, ...updates }));

    const res = await request(app)
      .post("/api/users/teach1/reset-password")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ newPassword: "brand-new-pass1!" });

    expect(res.status).toBe(200);
    expect(dbAdapter.updateWhere).toHaveBeenCalledTimes(1);

    const [collection, filter, updates] = dbAdapter.updateWhere.mock.calls[0];
    expect(collection).toBe("users");
    expect(filter).toEqual({ username: "teach1" });
    expect(await bcrypt.compare("brand-new-pass1!", updates.password)).toBe(true);
    expect(updates.authEpoch).toBe(1);
  });

  it("reports a failure instead of success when the write matched nothing", async () => {
    const { app, dbAdapter } = await buildApp();
    const { setCachedAuthEpoch: setEpoch } = await import("../../utils/tokenService.js");
    setEpoch("admin1", 0);
    dbAdapter.list.mockResolvedValue([{ username: "teach1", role: "teacher", password: "old" }]);
    dbAdapter.updateWhere.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/users/teach1/reset-password")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ newPassword: "brand-new-pass1!" });

    expect(res.status).toBe(500);
  });

  it("rejects an unauthenticated request", async () => {
    const { app } = await buildApp();
    const res = await request(app).post("/api/users/teach1/reset-password").send({});
    expect(res.status).toBe(401);
  });
});
