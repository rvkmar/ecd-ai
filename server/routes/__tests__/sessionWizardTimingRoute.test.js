import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { username: "stud1", role: "student" };
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
  finishSession: vi.fn(),
}));

const { loadDB, saveDB } = await import("../../../src/utils/db-server.js");
const { default: router } = await import("../sessionRoutes.js");

const app = express();
app.use(express.json());
app.use("/api/sessions", router);

describe("POST /api/sessions/:id/wizard-timing", () => {
  beforeEach(() => {
    loadDB.mockReturnValue({
      students: [{ id: "stu99", name: "stud1" }],
      sessions: [
        {
          id: "s-live",
          studentId: "stu99",
          status: "in_progress",
          taskIds: ["t1"],
        },
      ],
    });
    saveDB.mockClear();
  });

  it("persists draft start and review advance on the session", async () => {
    const draft = await request(app)
      .post("/api/sessions/s-live/wizard-timing")
      .send({ phase: "draft" });
    expect(draft.status).toBe(200);
    expect(draft.body.wizardPhase).toBe("draft");
    expect(draft.body.wizardPhaseTimings.draft.startedAt).toBeTruthy();
    expect(saveDB).toHaveBeenCalled();

    const review = await request(app)
      .post("/api/sessions/s-live/wizard-timing")
      .send({ phase: "review" });
    expect(review.status).toBe(200);
    expect(review.body.wizardPhase).toBe("review");
    expect(review.body.wizardPhaseTimings.draft.endedAt).toBeTruthy();
    expect(review.body.wizardPhaseTimings.draft.durationMs).toBeGreaterThanOrEqual(0);
    expect(review.body.wizardPhaseTimings.review.startedAt).toBeTruthy();
  });

  it("finish closes the submitted phase clock", async () => {
    await request(app)
      .post("/api/sessions/s-live/wizard-timing")
      .send({ phase: "draft" });
    const res = await request(app).post("/api/sessions/s-live/finish");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
    expect(res.body.wizardPhaseTimings.submitted.endedAt).toBeTruthy();
    expect(res.body.wizardPhase).toBe("submitted");
  });

  it("is idempotent when the submit clock is already closed", async () => {
    loadDB.mockReturnValue({
      students: [{ id: "stu99", name: "stud1" }],
      sessions: [
        {
          id: "s-done",
          studentId: "stu99",
          status: "completed",
          isCompleted: true,
          wizardPhaseTimings: {
            submitted: {
              startedAt: "2026-09-15T10:00:00.000Z",
              endedAt: "2026-09-15T10:01:00.000Z",
              durationMs: 60000,
            },
          },
        },
      ],
    });
    const res = await request(app)
      .post("/api/sessions/s-done/wizard-timing")
      .send({ phase: "review" });
    expect(res.status).toBe(200);
    expect(res.body.wizardPhaseTimings.submitted.endedAt).toBe(
      "2026-09-15T10:01:00.000Z"
    );
  });
});
