import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { seedActivePackages } from "../../test/seedActivePackage.js";
import { presentationTimeMultiplier } from "../../delivery/presentationModelResolution.js";
import { presentationPlayerPolicy } from "../../../src/components/sessions/presentationPlayer.js";

const { authState } = vi.hoisted(() => ({
  authState: { user: { id: "teach1", username: "teach1", role: "teacher" } },
}));

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = authState.user;
    next();
  },
  authorizeRole: (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.sendStatus(403);
    next();
  },
}));

vi.mock("../../../src/utils/db-server.js", () => {
  const loadDB = vi.fn();
  return {
    loadDB,
    saveDB: vi.fn(),
    finishSession: vi.fn(),
    readRawDB: (...args) => loadDB(...args),
  };
});

const { loadDB } = await import("../../../src/utils/db-server.js");
const { default: router } = await import("../sessionRoutes.js");

function appFor(db) {
  loadDB.mockReturnValue(db);
  const app = express();
  app.use(express.json());
  app.use("/api/sessions", router);
  return app;
}

function teacher() {
  authState.user = { id: "teach1", username: "teach1", role: "teacher" };
}

function student() {
  authState.user = { id: "stud1", username: "stud1", role: "student" };
}

function legacyDb(session, extra = {}) {
  return {
    sessions: [session],
    students: [],
    users: [],
    tasks: [
      { id: "t1", taskModelId: "tm1", generatedObservationIds: [], generatedEvidenceIds: [] },
      { id: "t2", taskModelId: "tm1", generatedObservationIds: [], generatedEvidenceIds: [] },
    ],
    taskModels: [{ id: "tm1", evidenceModelIds: [] }],
    evidenceModels: [],
    policies: [{ id: "p-fixed", type: "fixed", name: "Fixed" }],
    deliveryModels: extra.deliveryModels || [],
    presentationModels: extra.presentationModels || [],
    ...extra,
    sessions: extra.sessions || [session],
  };
}

function liveSession(overrides = {}) {
  return {
    id: "s1",
    studentId: "stud1",
    studentIds: ["stud1"],
    taskIds: ["t1", "t2"],
    currentTaskIndex: 0,
    responses: [],
    studentModel: { irtTheta: 0.2 },
    selectionStrategy: "fixed",
    status: "in_progress",
    isCompleted: false,
    ...overrides,
  };
}

const evidenceModel = {
  id: "em1",
  versionNumber: 1,
  observables: [{
    id: "o1",
    type: "selected_response",
    evidenceRule: { direction: "supports", strengthLevel: 4, activationCondition: "any", justification: "x" },
  }],
  statisticalModels: [{
    id: "sm1",
    type: "irt",
    active: true,
    structureConfig: {},
    parameterSets: [{
      parameterSetId: "ps1",
      parameters: { o1: { a: 1, b: 0 } },
      packageVersion: "pilot-1",
      converged: true,
      sampleSize: 1,
      calibratedAt: "2026-01-01T00:00:00.000Z",
    }],
    activeParameterSetId: "ps1",
  }],
};

const item = {
  id: "item1",
  taskModelId: "tm1",
  versionNumber: 1,
  taskModelVersion: 1,
  observationId: "o1",
  evidenceModelId: "em1",
  evidenceModelVersion: 1,
  locked: true,
  equivalenceGroupId: "grp1",
  stimulus: { layout: "single", blocks: [{ type: "text", content: "2/4 = ?" }] },
  interaction: { type: "mcq", responseComponents: [{ id: "opt_a" }, { id: "opt_b" }] },
  scoring: {
    method: "dichotomous",
    maxScore: 1,
    evidenceActivationMap: [
      { responsePattern: { selected: "opt_a" }, activatesObservable: true, strengthOverride: 4, rationale: "Correct." },
    ],
  },
  exposureControl: { usageCount: 0, maxUsageBeforeRetire: 5, reactivationCount: 0, maxReactivations: 0 },
};

function itemDb(session) {
  const db = {
    sessions: [session],
    students: [],
    users: [],
    tasks: [{
      id: "t1",
      taskModelId: "tm1",
      generatedObservationIds: [],
      generatedEvidenceIds: [],
    }],
    taskModels: [{
      id: "tm1",
      versionNumber: 1,
      status: "operational",
      locked: true,
      evidenceModelIds: ["em1"],
      expectedObservations: [{ observationId: "o1", evidenceModelId: "em1", required: true, weight: 1 }],
    }],
    evidenceModels: [evidenceModel],
    items: [item],
    policies: [{ id: "p-fixed", type: "fixed" }],
  };
  seedActivePackages(db);
  return db;
}

beforeEach(() => {
  teacher();
  vi.clearAllMocks();
});

describe("POST /api/sessions stamps administration", () => {
  it("stamps the delivery rules and the presentation multiplier, and leaves a model with no rules unstamped", async () => {
    const db = {
      sessions: [],
      students: [],
      users: [],
      tasks: [{ id: "t1", taskModelId: "tm1" }, { id: "t-plain" }],
      taskModels: [{ id: "tm1", versionNumber: 1 }],
      policies: [{ id: "p-fixed", type: "fixed" }],
      presentationModels: [{
        id: "pm1",
        locked: true,
        status: "confirmed",
        taskModelId: "tm1",
        taskModelVersion: 1,
        accessibility: { timeMultiplier: 2 },
        conditionalDisplay: { allowReview: false },
      }],
      deliveryModels: [{
        id: "dm1",
        policyId: "p-fixed",
        presentationModelId: "pm1",
        administration: {
          timeLimitMinutes: 20,
          attempts: 2,
          allowedReview: true,
          feedbackMode: "none",
        },
      }, {
        id: "dm-empty",
        policyId: "p-fixed",
      }],
    };
    const app = appFor(db);
    const stamped = await request(app)
      .post("/api/sessions")
      .send({ taskIds: ["t1"], studentId: "stud1", deliveryModelId: "dm1" });
    expect(stamped.status).toBe(201);
    expect(stamped.body.deliveryAdministration.timeLimitMinutes).toBe(20);
    expect(stamped.body.deliveryAdministration.timeMultiplier).toBe(2);
    expect(stamped.body.deliveryAdministration.attempts).toBe(2);
    expect(stamped.body.deliveryAdministration.reviewAllowed).toBe(false);
    expect(stamped.body.deliveryAdministration.allowedReview).toBe(true);
    expect(stamped.body.deliveryAdministration.feedbackMode).toBe("none");
    expect(stamped.body.deliveryAdministration.extraTimeMinutes).toBe(0);
    expect(stamped.body.administration).toEqual({ allowedReview: false, feedbackMode: "none" });
    expect(stamped.body.endTime).toBe(stamped.body.deliveryAdministration.effectiveDeadline);
    expect(Date.parse(stamped.body.endTime) - Date.parse(stamped.body.startedAt)).toBe(40 * 60 * 1000);
    expect(stamped.body.deliveryTiming.remainingMs).toBeLessThanOrEqual(40 * 60 * 1000);
    expect(stamped.body.deliveryTiming.remainingMs).toBeGreaterThan(39 * 60 * 1000);
    expect(stamped.body.studentModel).toBeDefined();

    const overlay = {
      presentationModelId: "pm1",
      accessibility: { timeMultiplier: 2 },
      timeMultiplier: 2,
      conditionalDisplay: { allowReview: true, showFeedback: "immediate" },
    };
    const factor = presentationTimeMultiplier(overlay);
    expect(factor).toBe(2);
    expect(Date.parse(stamped.body.endTime) - Date.parse(stamped.body.startedAt)).toBe(
      20 * factor * 60 * 1000
    );
    const policy = presentationPlayerPolicy(overlay, stamped.body);
    expect(policy.timeMultiplier).toBe(factor);
    expect(policy.allowReview).toBe(false);
    expect(policy.showReviewScreen).toBe(false);
    expect(policy.serverFeedbackMode).toBe("none");
    expect(policy.feedbackTiming).toBe("none");
    const clockMs = Date.parse(stamped.body.endTime) - Date.parse(stamped.body.startedAt);
    expect(clockMs).toBe(20 * 60 * 1000 * factor);

    const plain = await request(app)
      .post("/api/sessions")
      .send({ taskIds: ["t-plain"], studentId: "stud1", deliveryModelId: "dm-empty" });
    expect(plain.status).toBe(201);
    expect(plain.body.deliveryAdministration).toBeUndefined();
    expect(plain.body.administration).toBeUndefined();
    expect(plain.body.endTime).toBeUndefined();
    expect(plain.body.deliveryTiming).toBeUndefined();
  });
});

describe("time limit", () => {
  function timed(deadline) {
    return liveSession({
      deliveryAdministration: {
        timeLimitMinutes: 30,
        timeMultiplier: 1,
        extraTimeMinutes: 0,
        pausedMs: 0,
        clockStartedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
        pauseStartedAt: null,
        effectiveDeadline: deadline,
        reviewAllowed: true,
        attempts: 2,
        feedbackMode: "immediate",
      },
    });
  }

  it("accepts a submit before the deadline and rejects one after it, closing the session", async () => {
    const open = timed(new Date(Date.now() + 20 * 60_000).toISOString());
    const db = legacyDb(open);
    const app = appFor(db);
    const ok = await request(app).post("/api/sessions/s1/submit").send({ taskId: "t1", questionId: "q1", rawAnswer: "a" });
    expect(ok.status).toBe(200);
    expect(ok.body.responses).toHaveLength(1);
    expect(ok.body.deliveryTiming.effectiveDeadline).toBe(open.deliveryAdministration.effectiveDeadline);

    open.deliveryAdministration.effectiveDeadline = new Date(Date.now() - 1000).toISOString();
    const late = await request(app).post("/api/sessions/s1/submit").send({ taskId: "t2", questionId: "q2", rawAnswer: "b" });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe("time_limit");
    expect(late.body.error).toMatch(/Time limit reached/);
    expect(db.sessions[0].autoFinished).toBe(true);
    expect(db.sessions[0].status).toBe("submitted");
    expect(db.sessions[0].responses).toHaveLength(1);
    expect(db.sessions[0].deliveryAdministration.timeLimitReached).toBe(true);
  });

  it("freezes the clock on pause and moves the deadline on resume", async () => {
    const session = timed(new Date(Date.now() + 20 * 60_000).toISOString());
    const db = legacyDb(session);
    const app = appFor(db);

    const paused = await request(app).post("/api/sessions/s1/pause");
    expect(paused.status).toBe(200);
    expect(paused.body.status).toBe("paused");
    expect(paused.body.deliveryAdministration.pauseStartedAt).toEqual(expect.any(String));
    expect(paused.body.deliveryTiming.paused).toBe(true);

    const whilePaused = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", questionId: "q1", rawAnswer: "a" });
    expect(whilePaused.status).toBe(409);
    expect(whilePaused.body.code).toBe("session_paused");
    expect(db.sessions[0].responses).toHaveLength(0);

    const resumed = await request(app).post("/api/sessions/s1/resume");
    expect(resumed.status).toBe(200);
    expect(resumed.body.status).toBe("in_progress");
    expect(resumed.body.deliveryAdministration.pauseStartedAt).toBeNull();
    expect(resumed.body.deliveryAdministration.pausedMs).toBeGreaterThanOrEqual(0);
    const resumedMs = Date.parse(resumed.body.deliveryAdministration.effectiveDeadline);
    const expected = Date.parse(resumed.body.deliveryAdministration.clockStartedAt)
      + 30 * 60_000
      + resumed.body.deliveryAdministration.pausedMs;
    expect(Math.abs(resumedMs - expected)).toBeLessThan(5);
    expect(resumed.body.endTime).toBe(resumed.body.deliveryAdministration.effectiveDeadline);
  });

  it("reports the limit from next-task and from finish, and play refuses a clock that has run out", async () => {
    const session = timed(new Date(Date.now() - 1000).toISOString());
    const db = legacyDb(session);
    const app = appFor(db);

    const next = await request(app).get("/api/sessions/s1/next-task");
    expect(next.status).toBe(200);
    expect(next.body.timeLimitReached).toBe(true);
    expect(next.body.taskId).toBeUndefined();
    expect(db.sessions[0].autoFinished).toBe(true);

    db.sessions[0] = timed(new Date(Date.now() - 1000).toISOString());
    const finished = await request(app).post("/api/sessions/s1/finish");
    expect(finished.status).toBe(200);
    expect(finished.body.autoFinished).toBe(true);
    expect(finished.body.status).toBe("submitted");

    db.sessions[0] = timed(new Date(Date.now() - 1000).toISOString());
    const play = await request(app).post("/api/sessions/s1/play");
    expect(play.status).toBe(409);
    expect(play.body.code).toBe("time_limit");
  });

  it("writes endTime at create and does not enforce a delivery model that was never stamped", async () => {
    const db = {
      sessions: [],
      students: [],
      tasks: [{ id: "t1", taskModelId: "tm1", generatedObservationIds: [], generatedEvidenceIds: [] }],
      taskModels: [{ id: "tm1", evidenceModelIds: [] }],
      policies: [{ id: "p-fixed", type: "fixed" }],
      deliveryModels: [{
        id: "dm1",
        policyId: "p-fixed",
        administration: { timeLimitMinutes: 5, attempts: 1, allowedReview: false, feedbackMode: "none" },
      }],
    };
    const app = appFor(db);
    const created = await request(app)
      .post("/api/sessions")
      .send({ taskIds: ["t1"], studentId: "stud1", deliveryModelId: "dm1" });
    expect(created.status).toBe(201);
    const id = created.body.id;
    const played = await request(app).post(`/api/sessions/${id}/play`);
    expect(played.status).toBe(200);
    expect(played.body.deliveryAdministration.clockStartedAt).toBe(created.body.startedAt);
    expect(played.body.endTime).toBe(created.body.endTime);
    expect(played.body.administration).toEqual({ allowedReview: false, feedbackMode: "none" });
    expect(played.body.deliveryTiming.remainingMs).toBeGreaterThan(4 * 60 * 1000);

    const inflight = liveSession({
      id: "old",
      deliveryModelId: "dm1",
      startedAt: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
    });
    db.sessions.push(inflight);
    const first = await request(app).post("/api/sessions/old/submit").send({ taskId: "t1", questionId: "q1", rawAnswer: "a" });
    const second = await request(app).post("/api/sessions/old/submit").send({ taskId: "t1", questionId: "q1", rawAnswer: "b" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(inflight.responses).toHaveLength(2);
    expect(inflight.deliveryAdministration).toBeUndefined();
  });
});

describe("attempts and review", () => {
  function adminSession(admin) {
    return liveSession({
      deliveryAdministration: {
        attempts: 2,
        reviewAllowed: true,
        feedbackMode: "immediate",
        ...admin,
      },
    });
  }

  it("allows a second answer under the cap when review is on, and blocks the next one", async () => {
    const session = adminSession({ attempts: 2, reviewAllowed: true });
    const db = legacyDb(session);
    const app = appFor(db);
    const first = await request(app).post("/api/sessions/s1/submit").send({ taskId: "t1", questionId: "q1", rawAnswer: "a" });
    expect(first.status).toBe(200);
    expect(first.body.responses[0].attempt).toBe(1);
    expect(first.body.currentTaskIndex).toBe(1);

    const second = await request(app).post("/api/sessions/s1/submit").send({ taskId: "t1", questionId: "q1", rawAnswer: "b" });
    expect(second.status).toBe(200);
    expect(second.body.responses).toHaveLength(1);
    expect(second.body.responses[0].rawAnswer).toBe("b");
    expect(second.body.responses[0].attempt).toBe(2);
    expect(second.body.currentTaskIndex).toBe(1);

    const third = await request(app).post("/api/sessions/s1/submit").send({ taskId: "t1", questionId: "q1", rawAnswer: "c" });
    expect(third.status).toBe(409);
    expect(third.body.code).toBe("attempts_exhausted");
    expect(third.body.error).toMatch(/Task t1 has used all 2 attempts/);
    expect(db.sessions[0].responses[0].rawAnswer).toBe("b");
  });

  it("refuses a change when review is off, including when the presentation flag is the one that forbids it", async () => {
    const session = adminSession({ attempts: 3, reviewAllowed: false, allowedReview: true, presentationAllowReview: false });
    const db = legacyDb(session);
    const app = appFor(db);
    expect((await request(app).post("/api/sessions/s1/submit").send({ taskId: "t1", questionId: "q1", rawAnswer: "a" })).status).toBe(200);
    const again = await request(app).post("/api/sessions/s1/submit").send({ taskId: "t1", questionId: "q1", rawAnswer: "b" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("review_not_allowed");
    expect(again.body.error).toMatch(/Review is not allowed/);
    expect(db.sessions[0].responses).toHaveLength(1);

    session.currentTaskIndex = 0;
    const next = await request(app).get("/api/sessions/s1/next-task");
    expect(next.status).toBe(409);
    expect(next.body.code).toBe("review_not_allowed");
  });

  it("keeps the historical item-path refusal when nothing is stamped, and replaces an item answer when review is on", async () => {
    const plain = liveSession({ studentId: "stud1", taskIds: ["t1"] });
    const plainDb = itemDb(plain);
    const app = appFor(plainDb);
    const first = await request(app).post("/api/sessions/s1/submit").send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });
    expect(first.status).toBe(200);
    expect(first.body.responses[0].activated).toBe(true);
    const duplicate = await request(app).post("/api/sessions/s1/submit").send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toBe("Task t1 already has a recorded response for this session.");
    expect(duplicate.body.code).toBeUndefined();

    const reviewed = liveSession({
      id: "s2",
      taskIds: ["t1"],
      deliveryAdministration: { attempts: 2, reviewAllowed: true, feedbackMode: "immediate" },
    });
    const reviewedDb = itemDb(reviewed);
    const reviewedApp = appFor(reviewedDb);
    const saved = await request(reviewedApp).post("/api/sessions/s2/submit").send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });
    expect(saved.status).toBe(200);
    const usage = reviewedDb.items[0].exposureControl.usageCount;
    const changed = await request(reviewedApp).post("/api/sessions/s2/submit").send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });
    expect(changed.status).toBe(200);
    expect(changed.body.responses).toHaveLength(1);
    expect(changed.body.responses[0].attempt).toBe(2);
    expect(changed.body.responses[0].activated).toBe(true);
    expect(reviewedDb.items[0].exposureControl.usageCount).toBe(usage);
    expect(reviewedDb.sessions[0].currentTaskIndex).toBe(1);
  });
});

describe("feedback mode", () => {
  function scored(mode, status = "in_progress") {
    return liveSession({
      status,
      isCompleted: status === "submitted" || status === "completed",
      deliveryAdministration: { feedbackMode: mode, reviewAllowed: true, attempts: 2 },
      responses: [{
        taskId: "t1",
        rawAnswer: "opt_a",
        activated: true,
        rationale: "Correct.",
        scoredValue: 1,
        direction: "supports",
      }],
    });
  }

  it("hides scores from the student for none and for delayed_end, and shows them to staff", async () => {
    student();
    const db = legacyDb(scored("none"));
    const app = appFor(db);
    const hidden = await request(app).get("/api/sessions/s1");
    expect(hidden.status).toBe(200);
    expect(hidden.body.responses[0].rawAnswer).toBe("opt_a");
    expect(hidden.body.responses[0].activated).toBeUndefined();
    expect(hidden.body.responses[0].rationale).toBeUndefined();
    expect(hidden.body.responses[0].scoredValue).toBeUndefined();
    expect(hidden.body.studentModel).toBeUndefined();
    expect(db.sessions[0].responses[0].activated).toBe(true);
    expect(db.sessions[0].studentModel.irtTheta).toBe(0.2);

    const listed = await request(app).get("/api/sessions/mine");
    expect(listed.body[0].studentModel).toBeUndefined();
    expect(listed.body[0].responses[0].rationale).toBeUndefined();

    teacher();
    const staff = await request(app).get("/api/sessions/s1");
    expect(staff.body.responses[0].activated).toBe(true);
    expect(staff.body.responses[0].rationale).toBe("Correct.");
    expect(staff.body.studentModel.irtTheta).toBe(0.2);

    student();
    db.sessions[0] = scored("delayed_end");
    const during = await request(app).get("/api/sessions/s1");
    expect(during.body.responses[0].activated).toBeUndefined();
    const done = await request(app).post("/api/sessions/s1/finish");
    expect(done.status).toBe(200);
    expect(done.body.status).toBe("completed");
    expect(done.body.responses[0].activated).toBe(true);
    expect(done.body.responses[0].rationale).toBe("Correct.");

    db.sessions[0] = scored("none", "completed");
    const stillHidden = await request(app).get("/api/sessions/s1");
    expect(stillHidden.body.responses[0].activated).toBeUndefined();

    db.sessions[0] = scored("immediate");
    const shown = await request(app).get("/api/sessions/s1");
    expect(shown.body.responses[0].activated).toBe(true);
    expect(shown.body.studentModel.irtTheta).toBe(0.2);
  });

  it("strips a legacy submit payload for the student and keeps the stored score", async () => {
    student();
    const session = liveSession({
      deliveryAdministration: { feedbackMode: "none", reviewAllowed: true, attempts: 1 },
      responses: [],
      studentModel: { irtTheta: 0.4 },
    });
    const db = legacyDb(session);
    const app = appFor(db);
    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", questionId: "q1", rawAnswer: "a", scoredValue: 1 });
    expect(res.status).toBe(200);
    expect(res.body.responses[0].rawAnswer).toBe("a");
    expect(res.body.responses[0].scoredValue).toBeUndefined();
    expect(res.body.studentModel).toBeUndefined();
    expect(db.sessions[0].responses[0].scoredValue).toBe(1);
    expect(db.sessions[0].studentModel.irtTheta).toBe(0.4);
  });

  it("leaves an unstamped student payload unchanged", async () => {
    student();
    const session = liveSession({
      responses: [{ taskId: "t1", rawAnswer: "a", activated: false, rationale: "No." }],
    });
    const db = legacyDb(session);
    const app = appFor(db);
    const res = await request(app).get("/api/sessions/s1");
    expect(res.body.responses[0].activated).toBe(false);
    expect(res.body.responses[0].rationale).toBe("No.");
    expect(res.body.studentModel.irtTheta).toBe(0.2);
    expect(res.body.deliveryTiming).toBeUndefined();
  });
});
