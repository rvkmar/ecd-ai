// D92 — token life, refresh rotation, revocation exit checks.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";
import { _resetTokenServiceForTests } from "../../utils/tokenService.js";

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

const TEST_PASSWORD = "WalkPass!2026";

async function makeUser(overrides = {}) {
  return {
    id: "teach1",
    username: "teach1",
    role: "teacher",
    email: "teach1@ecd.local",
    password: await bcrypt.hash(TEST_PASSWORD, 10),
    authEpoch: 0,
    ...overrides,
  };
}

async function buildApp() {
  vi.resetModules();
  _resetTokenServiceForTests();
  const { dbAdapter } = await import("../../utils/dbAdapter.js");
  const { default: usersRoutes } = await import("../usersRoutes.js");
  const { authenticateToken } = await import("../../utils/authMiddleware.js");
  const app = express();
  app.use(express.json());
  app.use("/api/users", usersRoutes);
  app.get("/api/probe", authenticateToken, (req, res) => {
    res.json({ ok: true, username: req.user.username });
  });
  return { app, dbAdapter };
}

describe("D92 session policy", () => {
  beforeEach(() => {
    _resetTokenServiceForTests();
  });

  it("issues a short-lived access token plus a refresh token on login", async () => {
    const { app, dbAdapter } = await buildApp();
    const user = await makeUser();
    dbAdapter.list.mockResolvedValue([user]);

    const res = await request(app)
      .post("/api/users/login")
      .send({ username: "teach1", password: TEST_PASSWORD, role: "teacher" });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.expiresIn).toBeTruthy();
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.jti).toBeTruthy();
    expect(decoded.ae).toBe(0);
    expect(decoded.typ).toBe("access");
  });

  it("rejects a revoked access token after logout (exit check)", async () => {
    const { app, dbAdapter } = await buildApp();
    const user = await makeUser();
    dbAdapter.list.mockResolvedValue([user]);

    const login = await request(app)
      .post("/api/users/login")
      .send({ username: "teach1", password: TEST_PASSWORD, role: "teacher" });

    const token = login.body.token;
    const refreshToken = login.body.refreshToken;

    const before = await request(app)
      .get("/api/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(before.status).toBe(200);

    await request(app)
      .post("/api/users/logout")
      .set("Authorization", `Bearer ${token}`)
      .send({ refreshToken });

    const after = await request(app)
      .get("/api/probe")
      .set("Authorization", `Bearer ${token}`);
    expect(after.status).toBe(403);
  });

  it("invalidates existing tokens when the user's role changes (exit check)", async () => {
    const { app, dbAdapter } = await buildApp();
    let user = await makeUser();
    dbAdapter.list.mockImplementation(async () => [user]);
    dbAdapter.updateWhere.mockImplementation(async (_c, _f, updates) => {
      user = { ...user, ...updates };
      return user;
    });

    const admin = await makeUser({
      id: "admin1",
      username: "admin1",
      role: "admin",
      password: await bcrypt.hash(TEST_PASSWORD, 10),
    });
    dbAdapter.list.mockImplementation(async () => [user, admin]);

    const adminLogin = await request(app)
      .post("/api/users/login")
      .send({ username: "admin1", password: TEST_PASSWORD, role: "admin" });

    const teachLogin = await request(app)
      .post("/api/users/login")
      .send({ username: "teach1", password: TEST_PASSWORD, role: "teacher" });
    const victimToken = teachLogin.body.token;

    const ok = await request(app)
      .get("/api/probe")
      .set("Authorization", `Bearer ${victimToken}`);
    expect(ok.status).toBe(200);

    const put = await request(app)
      .put("/api/users/teach1")
      .set("Authorization", `Bearer ${adminLogin.body.token}`)
      .send({ role: "district" });
    expect(put.status).toBe(200);
    expect(user.authEpoch).toBe(1);
    expect(user.role).toBe("district");

    const denied = await request(app)
      .get("/api/probe")
      .set("Authorization", `Bearer ${victimToken}`);
    expect(denied.status).toBe(403);
  });

  it("detects refresh-token replay and revokes the family (exit check)", async () => {
    const { app, dbAdapter } = await buildApp();
    const user = await makeUser();
    dbAdapter.list.mockResolvedValue([user]);

    const login = await request(app)
      .post("/api/users/login")
      .send({ username: "teach1", password: TEST_PASSWORD, role: "teacher" });

    const firstRefresh = login.body.refreshToken;

    const rotated = await request(app)
      .post("/api/users/refresh")
      .send({ refreshToken: firstRefresh });
    expect(rotated.status).toBe(200);
    expect(rotated.body.refreshToken).toBeTruthy();
    expect(rotated.body.refreshToken).not.toBe(firstRefresh);

    const replay = await request(app)
      .post("/api/users/refresh")
      .send({ refreshToken: firstRefresh });
    expect(replay.status).toBe(401);
    expect(replay.body.error).toMatch(/reuse/i);

    // The rotated sibling is also dead after family revoke.
    const sibling = await request(app)
      .post("/api/users/refresh")
      .send({ refreshToken: rotated.body.refreshToken });
    expect(sibling.status).toBe(401);
  });

  it("refuses a password shorter than the stated policy", async () => {
    const { app, dbAdapter } = await buildApp();
    const admin = await makeUser({
      id: "admin1",
      username: "admin1",
      role: "admin",
      password: await bcrypt.hash(TEST_PASSWORD, 10),
    });
    dbAdapter.list.mockResolvedValue([admin]);
    dbAdapter.insert.mockImplementation(async (_c, row) => row);

    const adminLogin = await request(app)
      .post("/api/users/login")
      .send({ username: "admin1", password: TEST_PASSWORD, role: "admin" });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminLogin.body.token}`)
      .send({ username: "newbie", password: "short1", role: "teacher" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/12/);
  });
});
