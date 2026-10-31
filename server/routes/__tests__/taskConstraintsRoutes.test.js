// TU10: task time limits and maxAttempts are enforced on submit.
// A late first answer is stored and flagged. A later one is refused.
// The accommodated taskTimeLimits value is the limit. It is not scaled again.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { seedActivePackages } from "../../test/seedActivePackage.js";
import { TASK_TIMEOUT_POLICY } from "../../delivery/taskConstraints.js";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: "u1", role: "student" };
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

const { loadDB, saveDB } = await import("../../../src/utils/db-server.js");
const { default: router } = await import("../sessionRoutes.js");

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
  feedback: { general: "Check the equal parts." },
};

function makeSession(overrides = {}) {
  return {
    id: "s1",
    studentId: "u1",
    taskIds: ["t1"],
    currentTaskIndex: 0,
    responses: [],
    studentModel: {},
    selectionStrategy: "fixed",
    status: "in_progress",
    isCompleted: false,
    ...overrides,
  };
}

function makeDb({ taskStructure = {}, session = null, sessions = null } = {}) {
  const db = {
    sessions: sessions || [session || makeSession()],
    tasks: [{ id: "t1", taskModelId: "tm1", generatedObservationIds: [], generatedEvidenceIds: [] }],
    taskModels: [{
      id: "tm1",
      versionNumber: 1,
      status: "operational",
      locked: true,
      evidenceModelIds: ["em1"],
      expectedObservations: [{ observationId: "o1", evidenceModelId: "em1", required: true, weight: 1 }],
      taskStructure,
    }],
    evidenceModels: [evidenceModel],
    items: [item],
  };
  seedActivePackages(db);
  return db;
}

function buildApp(db) {
  loadDB.mockReturnValue(db);
  saveDB.mockImplementation(() => {});
  const app = express();
  app.use(express.json());
  app.use("/api/sessions", router);
  return app;
}

const T0 = "2026-10-31T12:00:00.000Z";

function at(ms) {
  return new Date(Date.parse(T0) + ms).toISOString();
}

async function present(app) {
  const res = await request(app).post("/api/sessions/s1/present").send({ taskId: "t1" });
  expect(res.status).toBe(200);
  return res;
}

async function submit(app, body = {}) {
  return request(app).post("/api/sessions/s1/submit").send({
    taskId: "t1",
    itemId: "item1",
    rawAnswer: "opt_a",
    ...body,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(T0));
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("task time limit", () => {
  const timed = { timingConstraint: { timeLimitSeconds: 60, minimumResponseMs: 3000 } };

  it("accepts a submit exactly at the limit and keeps feedback and timing", async () => {
    const db = makeDb({ taskStructure: timed });
    const app = buildApp(db);
    await present(app);
    vi.setSystemTime(new Date(at(60000)));
    const res = await submit(app);
    expect(res.status).toBe(200);
    expect(res.body.responses[0]).toMatchObject({
      rawAnswer: "opt_a",
      presentedAt: T0,
      presentedAtSource: "server",
      timeOnItemMs: 60000,
      timeOnItemSource: "server",
      rapidGuess: false,
      feedback: { text: "Check the equal parts.", rule: "general", key: null },
    });
    expect(res.body.responses[0].timedOut).toBeUndefined();
    expect(res.body.responses[0].timeoutPolicy).toBeUndefined();
  });

  it("records a late first answer as timed out, then refuses another submit", async () => {
    const db = makeDb({ taskStructure: timed });
    const app = buildApp(db);
    await present(app);
    vi.setSystemTime(new Date(at(60001)));
    const late = await submit(app);
    expect(late.status).toBe(200);
    expect(late.body.responses).toHaveLength(1);
    expect(late.body.responses[0]).toMatchObject({
      rawAnswer: "opt_a",
      timedOut: true,
      timeoutPolicy: TASK_TIMEOUT_POLICY,
      taskTimeLimitSeconds: 60,
      taskTimeLimitSource: "timingConstraint",
      presentedAt: T0,
      timeOnItemMs: 60001,
      rapidGuess: false,
      feedback: { text: "Check the equal parts.", rule: "general", key: null },
    });

    vi.setSystemTime(new Date(at(70000)));
    const again = await submit(app, { rawAnswer: "opt_b" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("task_timed_out");
    expect(again.body.error).toMatch(/Time for this task has expired/);
    expect(again.body.error).toMatch(/locked/);
    expect(db.sessions[0].responses).toHaveLength(1);
    expect(db.sessions[0].responses[0].rawAnswer).toBe("opt_a");
    expect(db.sessions[0].responses[0].timedOut).toBe(true);
  });

  it("records an empty late answer instead of dropping it", async () => {
    const db = makeDb({ taskStructure: timed });
    const app = buildApp(db);
    await present(app);
    vi.setSystemTime(new Date(at(61000)));
    const res = await submit(app, { rawAnswer: null });
    expect(res.status).toBe(200);
    expect(res.body.responses[0]).toMatchObject({
      rawAnswer: null,
      timedOut: true,
      timeoutPolicy: TASK_TIMEOUT_POLICY,
      feedback: { text: "Check the equal parts.", rule: "general", key: null },
    });
    expect(res.body.responses[0].timeOnItemMs).toBeGreaterThan(60000);
  });

  it("uses the accommodated taskTimeLimits seconds and does not scale them again", async () => {
    const session = makeSession({
      deliveryAdministration: {
        accommodationTimeMultiplier: 2,
        extraTimeMinutes: 1,
        timeMultiplier: 1,
        taskTimeLimits: { t1: 120 },
      },
    });
    const onTime = makeDb({
      taskStructure: timed,
      session,
    });
    const onTimeApp = buildApp(onTime);
    await present(onTimeApp);
    vi.setSystemTime(new Date(at(90000)));
    const within = await submit(onTimeApp);
    expect(within.status).toBe(200);
    expect(within.body.responses[0].timeOnItemMs).toBe(90000);
    expect(within.body.responses[0].timedOut).toBeUndefined();
    expect(within.body.responses[0].feedback.text).toBe("Check the equal parts.");

    const lateDb = makeDb({
      taskStructure: timed,
      session: makeSession({
        deliveryAdministration: {
          accommodationTimeMultiplier: 2,
          extraTimeMinutes: 1,
          taskTimeLimits: { t1: 120 },
        },
      }),
    });
    const lateApp = buildApp(lateDb);
    vi.setSystemTime(new Date(T0));
    await present(lateApp);
    vi.setSystemTime(new Date(at(150000)));
    const late = await submit(lateApp);
    expect(late.status).toBe(200);
    expect(late.body.responses[0]).toMatchObject({
      timedOut: true,
      taskTimeLimitSeconds: 120,
      taskTimeLimitSource: "taskTimeLimits",
      timeOnItemMs: 150000,
      rapidGuess: false,
    });
  });

  it("refuses a revision after the limit even when attempts remain", async () => {
    const db = makeDb({
      taskStructure: {
        timingConstraint: { timeLimitSeconds: 60 },
        resourceConstraints: { maxAttempts: 3 },
      },
    });
    const app = buildApp(db);
    await present(app);
    vi.setSystemTime(new Date(at(10000)));
    const first = await submit(app);
    expect(first.status).toBe(200);
    expect(first.body.responses[0].attempt).toBe(1);
    expect(first.body.responses[0].timedOut).toBeUndefined();

    vi.setSystemTime(new Date(at(10000)));
    await present(app);
    vi.setSystemTime(new Date(at(80000)));
    const revision = await submit(app, { rawAnswer: "opt_b" });
    expect(revision.status).toBe(409);
    expect(revision.body.code).toBe("task_timed_out");
    expect(db.sessions[0].responses).toHaveLength(1);
    expect(db.sessions[0].responses[0].rawAnswer).toBe("opt_a");
    expect(db.sessions[0].responses[0].attempt).toBe(1);
  });

  it("does not enforce a limit when the server never saw a present", async () => {
    const db = makeDb({ taskStructure: timed });
    const res = await submit(buildApp(db), {
      timing: { clientPresentedAt: T0, visibleMs: 999999, hiddenMs: 0 },
    });
    expect(res.status).toBe(200);
    expect(res.body.responses[0].timedOut).toBeUndefined();
    expect(res.body.responses[0].timeOnItemMs).toBe(999999);
    expect(res.body.responses[0].feedback.rule).toBe("general");
  });

  it("leaves a task with no constraint on today's submit path", async () => {
    const db = makeDb({
      taskStructure: { timingConstraint: {}, resourceConstraints: {} },
    });
    const app = buildApp(db);
    const first = await submit(app);
    expect(first.status).toBe(200);
    expect(first.body.responses[0].timedOut).toBeUndefined();
    expect(first.body.responses[0].attempt).toBeUndefined();
    expect(first.body.responses[0].feedback.text).toBe("Check the equal parts.");
    expect(first.body.responses[0].timeOnItemMs).toBeUndefined();

    const second = await submit(app, { rawAnswer: "opt_b" });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("Task t1 already has a recorded response for this session.");
    expect(second.body.code).toBeUndefined();
    expect(db.sessions[0].responses).toHaveLength(1);
    expect(db.sessions[0].responses[0].rawAnswer).toBe("opt_a");
  });
});

describe("task maxAttempts", () => {
  it("counts attempts per task and refuses the next one", async () => {
    const db = makeDb({
      taskStructure: { resourceConstraints: { maxAttempts: 2 } },
    });
    const app = buildApp(db);
    const first = await submit(app);
    expect(first.status).toBe(200);
    expect(first.body.responses[0].attempt).toBe(1);
    expect(first.body.responses[0].feedback.rule).toBe("general");

    const second = await submit(app, { rawAnswer: "opt_b" });
    expect(second.status).toBe(200);
    expect(second.body.responses).toHaveLength(1);
    expect(second.body.responses[0]).toMatchObject({
      rawAnswer: "opt_b",
      attempt: 2,
      feedback: { text: "Check the equal parts.", rule: "general", key: null },
    });
    expect(second.body.responses[0].timedOut).toBeUndefined();

    const third = await submit(app, { rawAnswer: "opt_a" });
    expect(third.status).toBe(409);
    expect(third.body.code).toBe("task_attempts_exhausted");
    expect(third.body.maxAttempts).toBe(2);
    expect(third.body.attemptsUsed).toBe(2);
    expect(third.body.error).toMatch(/Task t1 allows 2 attempts/);
    expect(third.body.error).toMatch(/No further answers are accepted/);
    expect(db.sessions[0].responses).toHaveLength(1);
    expect(db.sessions[0].responses[0].rawAnswer).toBe("opt_b");
    expect(db.sessions[0].responses[0].attempt).toBe(2);
  });

  it("refuses a second item submit when the task allows one attempt", async () => {
    const db = makeDb({
      taskStructure: { resourceConstraints: { maxAttempts: 1 } },
    });
    const app = buildApp(db);
    expect((await submit(app)).status).toBe(200);
    const again = await submit(app);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("task_attempts_exhausted");
    expect(again.body.error).toMatch(/allows 1 attempt/);
  });

  it("counts question-path attempts and still appends when the task has no cap", async () => {
    const capped = makeDb({
      taskStructure: { resourceConstraints: { maxAttempts: 2 } },
    });
    const app = buildApp(capped);
    const first = await request(app).post("/api/sessions/s1/submit").send({
      taskId: "t1",
      questionId: "q1",
      rawAnswer: "a",
    });
    expect(first.status).toBe(200);
    expect(first.body.responses[0].attempt).toBe(1);

    const second = await request(app).post("/api/sessions/s1/submit").send({
      taskId: "t1",
      questionId: "q1",
      rawAnswer: "b",
    });
    expect(second.status).toBe(200);
    expect(second.body.responses).toHaveLength(1);
    expect(second.body.responses[0]).toMatchObject({ rawAnswer: "b", attempt: 2 });

    const third = await request(app).post("/api/sessions/s1/submit").send({
      taskId: "t1",
      questionId: "q1",
      rawAnswer: "c",
    });
    expect(third.status).toBe(409);
    expect(third.body.code).toBe("task_attempts_exhausted");

    const open = makeDb({ taskStructure: {} });
    const openApp = buildApp(open);
    const one = await request(openApp).post("/api/sessions/s1/submit").send({
      taskId: "t1",
      questionId: "q1",
      rawAnswer: "a",
    });
    const two = await request(openApp).post("/api/sessions/s1/submit").send({
      taskId: "t1",
      questionId: "q1",
      rawAnswer: "b",
    });
    expect(one.status).toBe(200);
    expect(two.status).toBe(200);
    expect(open.sessions[0].responses).toHaveLength(2);
    expect(open.sessions[0].responses[0].attempt).toBeUndefined();
    expect(open.sessions[0].responses[1].rawAnswer).toBe("b");
  });
});
