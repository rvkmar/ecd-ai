// server/routes/__tests__/d115PresentationNextTaskTenancy.test.js
//
// D115 live dual-PM walk: student /next-task must still attach the
// Presentation Model overlay when tenant-scoped loadDB hides authored
// tasks that have no districtId (selection still returns taskId from the
// session roster).

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { seedActivePackages } from "../../test/seedActivePackage.js";

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
  sessions: [
    {
      id: "s1",
      studentId: "stud1",
      studentIds: ["stud1"],
      status: "in_progress",
      isCompleted: false,
      selectionStrategy: "fixed",
      taskIds: ["t1"],
      currentTaskIndex: 0,
      responses: [],
    },
  ],
  // No districtId — tenant filter drops this row from loadDB for students.
  tasks: [{ id: "t1", taskModelId: "tm1", itemId: "item1" }],
  taskModels: [
    {
      id: "tm1",
      versionNumber: 1,
      status: "operational",
      locked: true,
      evidenceModelIds: ["em1"],
      expectedObservations: [],
    },
  ],
  presentationModels: [
    {
      id: "pm-large",
      name: "Large text",
      taskModelId: "tm1",
      taskModelVersion: 1,
      status: "operational",
      locked: true,
      layout: { navigation: "linear", grouping: "single_item", itemOrder: "authored" },
      conditionalDisplay: {
        showProgress: true,
        allowReview: true,
        showFeedback: "none",
        allowSkip: false,
      },
      accessibility: { profile: "large_text", fontScale: 1.5, timeMultiplier: 1 },
      updatedAt: "2026-09-21T10:00:00.000Z",
    },
    {
      id: "pm-contrast",
      name: "High contrast",
      taskModelId: "tm1",
      taskModelVersion: 1,
      status: "suspended",
      locked: true,
      layout: { navigation: "linear", grouping: "single_item", itemOrder: "authored" },
      conditionalDisplay: {
        showProgress: false,
        allowReview: true,
        showFeedback: "none",
        allowSkip: true,
      },
      accessibility: { profile: "high_contrast", fontScale: 1, timeMultiplier: 2 },
      updatedAt: "2026-09-21T11:00:00.000Z",
    },
  ],
  items: [],
  students: [{ id: "stud1", username: "stud1", districtId: "d-chennai" }],
  users: [],
  compositeLibrary: [],
};

vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: vi.fn(() => ({
    ...rawDb,
    // Simulate student tenancy: tasks without districtId are invisible.
    tasks: [],
  })),
  readRawDB: vi.fn(() => rawDb),
  saveDB: vi.fn(),
  finishSession: vi.fn(),
}));

const { loadDB, readRawDB, saveDB } = await import("../../../src/utils/db-server.js");
const { default: router } = await import("../sessionRoutes.js");

function buildApp() {
  seedActivePackages(rawDb);
  loadDB.mockReturnValue({
    ...rawDb,
    tasks: [],
    compositeLibrary: rawDb.compositeLibrary,
  });
  readRawDB.mockReturnValue(rawDb);
  const app = express();
  app.use(express.json());
  app.use("/api/sessions", router);
  return app;
}

describe("D115 GET /next-task presentation under student tenancy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rawDb.presentationModels[0].status = "operational";
    rawDb.presentationModels[1].status = "suspended";
  });

  it("attaches presentation even when scoped loadDB hides the task row", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/sessions/s1/next-task");
    expect(res.status).toBe(200);
    expect(res.body.taskId).toBe("t1");
    expect(res.body.presentation?.accessibility?.profile).toBe("large_text");
    expect(res.body.presentation?.presentationModelId).toBe("pm-large");
  });

  it("flipping operational PM changes overlay without touching the item", async () => {
    const app = buildApp();
    rawDb.presentationModels[0].status = "suspended";
    rawDb.presentationModels[1].status = "operational";

    const res = await request(app).get("/api/sessions/s1/next-task");
    expect(res.status).toBe(200);
    expect(res.body.presentation?.accessibility?.profile).toBe("high_contrast");
    expect(res.body.presentation?.conditionalDisplay?.showProgress).toBe(false);
    expect(res.body.presentation?.presentationModelId).toBe("pm-contrast");
    expect(saveDB).not.toHaveBeenCalled();
  });
});
