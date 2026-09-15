import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = globalThis.__annUser || { username: "admin1", role: "admin" };
    next();
  },
  authorizeRole: (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.sendStatus(403);
    next();
  },
}));

vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: vi.fn(),
  saveDB: vi.fn(),
}));

const { loadDB, saveDB } = await import("../../../src/utils/db-server.js");
const { default: router } = await import("../announcementsRoutes.js");

const app = express();
app.use(express.json());
app.use("/api/announcements", router);

describe("announcements API", () => {
  beforeEach(() => {
    globalThis.__annUser = { username: "admin1", role: "admin" };
    loadDB.mockReturnValue({ announcements: [] });
    saveDB.mockClear();
  });

  it("creates a public admin announcement and returns it on GET for any role", async () => {
    const created = await request(app)
      .post("/api/announcements")
      .send({ title: "Hello", body: "World", visibility: "public" });
    expect(created.status).toBe(201);
    expect(created.body.visibility).toBe("public");

    globalThis.__annUser = { username: "stud1", role: "student" };
    const list = await request(app).get("/api/announcements");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].title).toBe("Hello");
  });

  it("hides role-restricted announcements from other roles", async () => {
    loadDB.mockReturnValue({
      announcements: [
        {
          id: "ann1",
          title: "Teachers",
          body: "PD",
          visibility: "roles",
          audienceRoles: ["teacher"],
          authorRole: "admin",
          createdBy: "admin1",
          createdAt: "2026-09-15T10:00:00.000Z",
        },
      ],
    });
    globalThis.__annUser = { username: "stud1", role: "student" };
    const list = await request(app).get("/api/announcements");
    expect(list.body).toEqual([]);
  });

  it("forces district audience to district/teacher/student", async () => {
    globalThis.__annUser = { username: "dist1", role: "district" };
    const created = await request(app)
      .post("/api/announcements")
      .send({ title: "Buses", body: "Late", visibility: "public" });
    expect(created.status).toBe(201);
    expect(created.body.audienceRoles).toEqual([
      "district",
      "teacher",
      "student",
    ]);
    expect(created.body.visibility).toBe("roles");
  });

  it("lets admin delete any announcement", async () => {
    loadDB.mockReturnValue({
      announcements: [
        {
          id: "ann-del",
          title: "X",
          body: "Y",
          authorRole: "district",
          createdBy: "dist1",
          visibility: "roles",
          audienceRoles: ["district", "teacher", "student"],
        },
      ],
    });
    const res = await request(app).delete("/api/announcements/ann-del");
    expect(res.status).toBe(204);
    expect(saveDB).toHaveBeenCalled();
  });

  it("blocks teachers from creating announcements", async () => {
    globalThis.__annUser = { username: "t1", role: "teacher" };
    const res = await request(app)
      .post("/api/announcements")
      .send({ title: "Nope", body: "Nope" });
    expect(res.status).toBe(403);
  });
});
