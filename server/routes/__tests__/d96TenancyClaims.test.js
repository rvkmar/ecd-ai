// D96 ? JWT tenancy claims from profile; refresh preserves them.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";
import { _resetTokenServiceForTests } from "../../utils/tokenService.js";
import {
  tenancyClaimsFromUser,
  viewScopeForRole,
} from "../../utils/tenancy.js";
import { rolePermissions } from "../../../src/config/rolePermissions.js";

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
    id: "dist1",
    username: "dist1",
    role: "district",
    email: "dist1@ecd.local",
    password: await bcrypt.hash(TEST_PASSWORD, 10),
    authEpoch: 0,
    profile: { districtId: "tn-chennai", name: "Chennai" },
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
    res.json({
      ok: true,
      username: req.user.username,
      districtId: req.user.districtId ?? null,
      schoolId: req.user.schoolId ?? null,
      viewScope: req.viewScope ?? null,
    });
  });
  return { app, dbAdapter };
}

describe("D96 tenancy claims", () => {
  beforeEach(() => {
    _resetTokenServiceForTests();
  });

  it("tenancyClaimsFromUser reads profile ids and normalizes empties", () => {
    expect(
      tenancyClaimsFromUser({
        profile: { districtId: " tn-chennai ", schoolId: "" },
      })
    ).toEqual({ districtId: "tn-chennai", schoolId: null });
    expect(tenancyClaimsFromUser({ profile: {} })).toEqual({
      districtId: null,
      schoolId: null,
    });
  });

  it("viewScopeForRole mirrors rolePermissions.restrictions.viewScope", () => {
    for (const role of ["admin", "district", "teacher", "student"]) {
      const client = rolePermissions[role]?.restrictions?.viewScope ?? null;
      expect(viewScopeForRole(role)).toBe(client);
    }
  });

  it("login puts districtId on the access token when profile has it", async () => {
    const { app, dbAdapter } = await buildApp();
    dbAdapter.list.mockResolvedValue([await makeUser()]);

    const res = await request(app)
      .post("/api/users/login")
      .send({ username: "dist1", password: TEST_PASSWORD, role: "district" });

    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.districtId).toBe("tn-chennai");
    expect(decoded.schoolId).toBeUndefined();

    const probe = await request(app)
      .get("/api/probe")
      .set("Authorization", "Bearer " + res.body.token);
    expect(probe.status).toBe(200);
    expect(probe.body.districtId).toBe("tn-chennai");
    expect(probe.body.viewScope).toBe("district");
  });

  it("admin login omits districtId when profile has none", async () => {
    const { app, dbAdapter } = await buildApp();
    dbAdapter.list.mockResolvedValue([
      await makeUser({
        id: "admin1",
        username: "admin1",
        role: "admin",
        profile: { name: "State Admin", state: "Tamil Nadu" },
      }),
    ]);

    const res = await request(app)
      .post("/api/users/login")
      .send({ username: "admin1", password: TEST_PASSWORD, role: "admin" });

    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.districtId).toBeUndefined();
  });

  it("refresh rotation preserves districtId and schoolId", async () => {
    const { app, dbAdapter } = await buildApp();
    dbAdapter.list.mockResolvedValue([
      await makeUser({
        username: "teach1",
        role: "teacher",
        profile: {
          districtId: "tn-chennai",
          schoolId: "school-chennai-01",
        },
      }),
    ]);

    const login = await request(app)
      .post("/api/users/login")
      .send({ username: "teach1", password: TEST_PASSWORD, role: "teacher" });

    const first = jwt.verify(login.body.token, JWT_SECRET);
    expect(first.districtId).toBe("tn-chennai");
    expect(first.schoolId).toBe("school-chennai-01");

    const rotated = await request(app)
      .post("/api/users/refresh")
      .send({ refreshToken: login.body.refreshToken });
    expect(rotated.status).toBe(200);

    const second = jwt.verify(rotated.body.token, JWT_SECRET);
    expect(second.districtId).toBe("tn-chennai");
    expect(second.schoolId).toBe("school-chennai-01");
  });
});

