// server/routes/__tests__/d115TaskDeliveryTenancy.test.js
//
// Companion to D115 presentation attach: GET /api/tasks/:id must return
// a rostered task to the assigned student even when tenant-scoped loadDB
// hides authored tasks that lack districtId.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = {
      id: "stud1",
      username: "stud1",
      role: "student",
      districtId: "d-chennai",
    };
    next();
  },
  authorizeRole: (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.sendStatus(403);
    next();
  },
}));

const rawDb = {
  tasks: [
    { id: "t1", taskModelId: "tm1", itemId: "item1" },
    {
      id: "t-stamped",
      taskModelId: "tm1",
      itemId: "item2",
      districtId: "d-madurai",
    },
  ],
  sessions: [
    {
      id: "s1",
      studentId: "stud1",
      studentIds: ["stud1"],
      status: "in_progress",
      taskIds: ["t1", "t-stamped"],
    },
  ],
  students: [],
  users: [],
};

vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: vi.fn(() => ({ ...rawDb, tasks: [] })),
  readRawDB: vi.fn(() => rawDb),
  saveDB: vi.fn(),
}));

const { loadDB, readRawDB } = await import("../../../src/utils/db-server.js");
const { default: router } = await import("../tasksRoutes.js");

describe("D115 GET /api/tasks/:id under student tenancy", () => {
  beforeEach(() => {
    loadDB.mockReturnValue({ ...rawDb, tasks: [] });
    readRawDB.mockReturnValue(rawDb);
  });

  it("returns a session-rostered task hidden by scoped loadDB", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/tasks", router);

    const res = await request(app).get("/api/tasks/t1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("t1");
    expect(res.body.itemId).toBe("item1");
  });

  it("still 404s a task not on the student's session", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/tasks", router);

    const res = await request(app).get("/api/tasks/t-other");
    expect(res.status).toBe(404);
  });

  it("returns a rostered task that already has a districtId (D115b stamp)", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/tasks", router);

    const res = await request(app).get("/api/tasks/t-stamped");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("t-stamped");
    expect(res.body.itemId).toBe("item2");
    expect(res.body.districtId).toBe("d-madurai");
  });

  it("returns a same-district stamped task from scoped loadDB without the raw fallback", async () => {
    const scoped = {
      ...rawDb,
      tasks: [
        {
          id: "t-home",
          taskModelId: "tm1",
          itemId: "item3",
          districtId: "d-chennai",
        },
      ],
    };
    loadDB.mockReturnValue(scoped);
    readRawDB.mockReturnValue(scoped);

    const app = express();
    app.use(express.json());
    app.use("/api/tasks", router);

    const res = await request(app).get("/api/tasks/t-home");
    expect(res.status).toBe(200);
    expect(res.body.itemId).toBe("item3");
  });
});
