// TU9: present and submit record server-trusted timing, and a client
// clock is only a supplement. Legacy submits with no timing stay untimed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { seedActivePackages } from "../../test/seedActivePackage.js";
import { RESPONSE_TIMING_RULE } from "../../delivery/responseTiming.js";

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

function makeDb(overrides = {}) {
  const db = {
    sessions: [makeSession()],
    tasks: [{ id: "t1", taskModelId: "tm1", generatedObservationIds: [], generatedEvidenceIds: [] }],
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
    ...overrides,
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(T0));
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /:id/present and submit timing", () => {
  it("records a server presentedAt and the visible time, and ignores an inflated client time", async () => {
    const db = makeDb();
    const app = buildApp(db);

    const presented = await request(app).post("/api/sessions/s1/present").send({
      taskId: "t1",
      clientPresentedAt: "2026-10-31T12:00:00.250Z",
    });
    expect(presented.status).toBe(200);
    expect(presented.body).toMatchObject({
      taskId: "t1",
      presentedAt: T0,
      presentedAtSource: "server",
      clientPresentedAt: "2026-10-31T12:00:00.250Z",
    });

    vi.setSystemTime(new Date("2026-10-31T12:00:01.000Z"));
    const again = await request(app).post("/api/sessions/s1/present").send({ taskId: "t1" });
    expect(again.body.presentedAt).toBe(T0);
    expect(db.sessions[0].responseTiming.tasks.t1.open.presentedAt).toBe(T0);

    vi.setSystemTime(new Date("2026-10-31T12:00:04.000Z"));
    const res = await request(app).post("/api/sessions/s1/submit").send({
      taskId: "t1",
      itemId: "item1",
      rawAnswer: "opt_a",
      timing: { clientPresentedAt: "2026-10-31T12:00:00.250Z", visibleMs: 999999, hiddenMs: 0 },
    });

    expect(res.status).toBe(200);
    expect(res.body.responses[0]).toMatchObject({
      presentedAt: T0,
      presentedAtSource: "server",
      clientPresentedAt: "2026-10-31T12:00:00.250Z",
      timeOnItemMs: 4000,
      timeOnItemSource: "server",
      rapidGuess: false,
      rapidGuessStatus: "engaged",
      rapidGuessBasis: "floor",
      rapidGuessRule: RESPONSE_TIMING_RULE.id,
      rapidGuessThresholdMs: RESPONSE_TIMING_RULE.floorMs,
    });
  });

  it("drops tab-hidden time and flags a rapid guess under the floor", async () => {
    const db = makeDb();
    const app = buildApp(db);
    await request(app).post("/api/sessions/s1/present").send({ taskId: "t1" });
    vi.setSystemTime(new Date("2026-10-31T12:00:10.000Z"));
    const res = await request(app).post("/api/sessions/s1/submit").send({
      taskId: "t1",
      itemId: "item1",
      rawAnswer: "opt_a",
      timing: { hiddenMs: 8000, visibleMs: 2000, clientPresentedAt: T0 },
    });
    expect(res.status).toBe(200);
    expect(res.body.responses[0]).toMatchObject({
      timeOnItemMs: 2000,
      timeOnItemSource: "server",
      rapidGuess: true,
      rapidGuessStatus: "rapid",
    });
  });

  it("accumulates a revisit onto the earlier response time", async () => {
    const db = makeDb({
      sessions: [makeSession({
        taskIds: ["t1", "t2"],
        deliveryAdministration: { attempts: 2, reviewAllowed: true },
      })],
      tasks: [
        { id: "t1", taskModelId: "tm1", generatedObservationIds: [], generatedEvidenceIds: [] },
        { id: "t2", taskModelId: "tm1", generatedObservationIds: [], generatedEvidenceIds: [] },
      ],
    });
    const app = buildApp(db);

    await request(app).post("/api/sessions/s1/present").send({ taskId: "t1" });
    vi.setSystemTime(new Date("2026-10-31T12:00:10.000Z"));
    const first = await request(app).post("/api/sessions/s1/submit").send({
      taskId: "t1",
      itemId: "item1",
      rawAnswer: "opt_a",
      timing: { visibleMs: 10000, hiddenMs: 0 },
    });
    expect(first.status).toBe(200);
    expect(first.body.responses[0].timeOnItemMs).toBe(10000);

    vi.setSystemTime(new Date("2026-10-31T12:00:20.000Z"));
    await request(app).post("/api/sessions/s1/present").send({
      taskId: "t2",
      leaving: { taskId: "t1", hiddenMs: 0, visibleMs: 0 },
    });
    vi.setSystemTime(new Date("2026-10-31T12:00:24.000Z"));
    await request(app).post("/api/sessions/s1/present").send({ taskId: "t1" });
    vi.setSystemTime(new Date("2026-10-31T12:00:28.000Z"));
    const second = await request(app).post("/api/sessions/s1/submit").send({
      taskId: "t1",
      itemId: "item1",
      rawAnswer: "opt_a",
      timing: { visibleMs: 4000, hiddenMs: 0 },
    });
    expect(second.status).toBe(200);
    const row = second.body.responses.find((response) => response.taskId === "t1");
    expect(row.timeOnItemMs).toBe(14000);
    expect(row.presentedAt).toBe(T0);
    expect(row.rapidGuess).toBe(false);
    expect(second.body.responses.filter((response) => response.taskId === "t1")).toHaveLength(1);
  });

  it("labels a client clock when the server has no presentation, and omits timing when the client sends none", async () => {
    const fresh = makeDb({
      sessions: [makeSession({ deliveryAdministration: { attempts: 2, reviewAllowed: true } })],
    });
    const freshApp = buildApp(fresh);
    const timed = await request(freshApp).post("/api/sessions/s1/submit").send({
      taskId: "t1",
      itemId: "item1",
      rawAnswer: "opt_a",
      timing: { clientPresentedAt: T0, visibleMs: 1000, hiddenMs: 500 },
    });
    expect(timed.status).toBe(200);
    expect(timed.body.responses[0]).toMatchObject({
      presentedAt: T0,
      presentedAtSource: "client",
      timeOnItemMs: 1000,
      timeOnItemSource: "client",
      rapidGuess: true,
    });

    const bareDb = makeDb();
    const bare = await request(buildApp(bareDb)).post("/api/sessions/s1/submit").send({
      taskId: "t1",
      itemId: "item1",
      rawAnswer: "opt_a",
    });
    expect(bare.status).toBe(200);
    expect(bare.body.responses[0]).not.toHaveProperty("presentedAt");
    expect(bare.body.responses[0]).not.toHaveProperty("timeOnItemMs");
    expect(bare.body.responses[0]).not.toHaveProperty("rapidGuess");
  });

  it("keeps authored item feedback beside the timing fields", async () => {
    const db = makeDb({
      items: [{ ...item, feedback: { general: "Check the equal parts." } }],
    });
    const res = await request(buildApp(db)).post("/api/sessions/s1/submit").send({
      taskId: "t1",
      itemId: "item1",
      rawAnswer: "opt_a",
      timing: { clientPresentedAt: T0, visibleMs: 4500 },
    });
    expect(res.status).toBe(200);
    expect(res.body.responses[0]).toMatchObject({
      presentedAt: T0,
      presentedAtSource: "client",
      timeOnItemMs: 4500,
      rapidGuess: false,
      feedback: { text: "Check the equal parts.", rule: "general", key: null },
    });
  });

  it("records visible time on an accommodated session without scaling it again", async () => {
    const db = makeDb({
      sessions: [makeSession({
        deliveryAdministration: {
          timeLimitMinutes: 30,
          timeMultiplier: 1,
          accommodationTimeMultiplier: 2,
          extraTimeMinutes: 10,
          accommodations: {
            extraTimeMinutes: 10,
            timeMultiplier: 2,
            fontScale: 1.25,
            highContrast: true,
            readAloud: true,
          },
          taskTimeLimits: { t1: 120 },
          reviewAllowed: true,
          attempts: 2,
        },
      })],
    });
    const app = buildApp(db);
    const presented = await request(app).post("/api/sessions/s1/present").send({
      taskId: "t1",
      clientPresentedAt: T0,
    });
    expect(presented.status).toBe(200);
    expect(presented.body.presentedAt).toBe(T0);

    vi.setSystemTime(new Date("2026-10-31T12:00:08.000Z"));
    const res = await request(app).post("/api/sessions/s1/submit").send({
      taskId: "t1",
      itemId: "item1",
      rawAnswer: "opt_a",
      timing: { clientPresentedAt: T0, visibleMs: 8000, hiddenMs: 0 },
    });
    expect(res.status).toBe(200);
    expect(res.body.responses[0]).toMatchObject({
      presentedAt: T0,
      presentedAtSource: "server",
      timeOnItemMs: 8000,
      timeOnItemSource: "server",
      rapidGuess: false,
    });
    expect(res.body.responses[0].timeOnItemMs).not.toBe(16000);
    expect(db.sessions[0].deliveryAdministration.accommodationTimeMultiplier).toBe(2);
    expect(db.sessions[0].deliveryAdministration.taskTimeLimits.t1).toBe(120);
  });

  it("uses 10% of the item median, or a configured per-item minimum", async () => {
    const peers = [1, 2, 3, 4, 5].map((n) => ({
      id: `peer-${n}`,
      responses: [{ taskId: "t1", itemId: "item1", timeOnItemMs: 60000 }],
    }));
    const db = makeDb({
      sessions: [makeSession(), ...peers],
    });
    const median = await request(buildApp(db)).post("/api/sessions/s1/submit").send({
      taskId: "t1",
      itemId: "item1",
      rawAnswer: "opt_a",
      timing: { clientPresentedAt: T0, visibleMs: 5000 },
    });
    expect(median.status).toBe(200);
    expect(median.body.responses[0]).toMatchObject({
      timeOnItemMs: 5000,
      rapidGuess: true,
      rapidGuessBasis: "median",
      rapidGuessThresholdMs: 6000,
      rapidGuessMedianMs: 60000,
    });

    const minimumItem = { ...item, rapidGuessMinimumMs: 8000 };
    const minDb = makeDb({ items: [minimumItem] });
    const raised = await request(buildApp(minDb)).post("/api/sessions/s1/submit").send({
      taskId: "t1",
      itemId: "item1",
      rawAnswer: "opt_a",
      timing: { clientPresentedAt: T0, visibleMs: 5000 },
    });
    expect(raised.status).toBe(200);
    expect(raised.body.responses[0]).toMatchObject({
      rapidGuess: true,
      rapidGuessBasis: "item-minimum",
      rapidGuessThresholdMs: 8000,
    });
  });
});
