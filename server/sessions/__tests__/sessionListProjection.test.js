import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { SESSION_INDEX_FIELDS } from "../sessionBackend.js";
import {
  CATALOG_SUMMARY_PROJECTION,
  RATING_QUEUE_PROJECTION,
  catalogListSummary,
  projectSession,
} from "../sessionListProjection.js";
import {
  querySessions,
  resetSessionStoreForTests,
  upsertSessions,
} from "../sessionRepository.js";
import { mongoRemove } from "../mongoSessionStore.js";
import { blindedRatingQueueFromSessions } from "../../delivery/raterQueue.js";
import { EVALUATION_STATUS } from "../../delivery/evaluationPhases.js";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = {
      id: req.headers["x-user-id"] || "admin1",
      role: req.headers["x-role"] || "admin",
      username: req.headers["x-user-id"] || "admin1",
    };
    next();
  },
  authorizeRole: (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.sendStatus(403);
    next();
  },
}));

vi.mock("../../../src/utils/db-server.js", () => {
  const loadDB = vi.fn(() => ({ sessions: [], students: [], users: [] }));
  return {
    loadDB,
    saveDB: vi.fn(),
    finishSession: vi.fn(),
    readRawDB: (...args) => loadDB(...args),
  };
});

const { loadDB } = await import("../../../src/utils/db-server.js");
const { default: sessionRouter } = await import("../../routes/sessionRoutes.js");

const heavy = "n".repeat(240);

function catalogSession(overrides = {}) {
  return {
    id: "s-live",
    studentId: "stu1",
    studentIds: ["stu1"],
    assignmentGroupId: "ag1",
    cohortId: "class-1",
    taskIds: ["t1", "t2"],
    currentTaskIndex: 1,
    responses: [
      {
        taskId: "t1",
        itemId: "item1",
        rawAnswer: { selected: "A", note: heavy },
        rationale: heavy,
        evaluationStatus: "complete",
        observationId: "o1",
      },
      {
        taskId: "t1",
        itemId: "item1",
        observationId: "o2",
        rawAnswer: "extra-observable",
        evaluationStatus: "complete",
      },
    ],
    studentModel: {
      smvPosteriors: {
        theta: {
          smvId: "theta",
          estimate: 0.42,
          precision: 0.1,
          distribution: { a: 0.2, b: 0.8 },
        },
      },
      carriedForward: { competencyModelIds: ["cm1"] },
    },
    selectionStrategy: "fixed",
    nextTaskPolicy: { policyId: "p1" },
    deliveryModelId: "dm1",
    assemblyProgress: { delivered: 1 },
    carryForward: true,
    status: "in_progress",
    isCompleted: false,
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: null,
    autoFinished: false,
    reviewedAt: null,
    updatedAt: "2026-01-02T00:00:00.000Z",
    stopped: { rule: "maxItems", reason: "cap", assemblyModelId: "am1" },
    wizardPhaseTimings: {
      draft: { startedAt: "2026-01-01T00:00:00.000Z", endedAt: null, durationMs: null },
    },
    wizardPhase: "draft",
    closure: null,
    endTime: "2026-01-03T00:00:00.000Z",
    districtId: "d1",
    schoolId: "sch1",
    ...overrides,
  };
}

function expectedCatalogSummary(session) {
  return catalogListSummary(session);
}

function ratingSession() {
  return {
    id: "s-rate",
    studentId: "stu1",
    studentIds: ["stu1", "stu1b"],
    status: "in_progress",
    studentModel: {
      smvPosteriors: { theta: { estimate: 1, distribution: { x: heavy } } },
    },
    assemblyProgress: { delivered: 2 },
    responses: [
      {
        taskId: "t0",
        evaluationStatus: "complete",
        rationale: heavy,
        rawAnswer: "kept-but-not-pending",
      },
      {
        taskId: "t1",
        itemId: "item1",
        observationId: "o1",
        evaluationStatus: EVALUATION_STATUS.PENDING_HUMAN,
        rawAnswer: { selected: "opt_a", note: heavy },
        rationale: "secret-auto",
        provisionalActivated: true,
        pendingPhase: {
          order: 2,
          kind: "human",
          rubricId: "rub1",
          adjudicationRule: "human_wins",
          extra: "not-in-the-queue-row",
        },
      },
      {
        taskId: "t2",
        itemId: "item2",
        observationId: "o2",
        evaluationStatus: EVALUATION_STATUS.PENDING_ADJUDICATION,
        rawAnswer: "opt_b",
        pendingPhase: {
          order: 3,
          kind: "human",
          rubricId: null,
          adjudicationRule: "require_agreement",
        },
        automatedPhaseResult: { activated: true, rationale: heavy },
        humanPhaseResult: { activated: false, rationale: heavy },
        adjudicationApplied: "require_agreement",
      },
    ],
  };
}

let previousBackend;

beforeEach(() => {
  previousBackend = process.env.SESSIONS_BACKEND;
  process.env.SESSIONS_BACKEND = "json";
  resetSessionStoreForTests();
});

afterEach(() => {
  resetSessionStoreForTests();
  if (previousBackend === undefined) delete process.env.SESSIONS_BACKEND;
  else process.env.SESSIONS_BACKEND = previousBackend;
});

describe("session list projection", () => {
  it("indexes the rating-queue filter and the status filters", () => {
    const names = SESSION_INDEX_FIELDS.map((spec) =>
      Array.isArray(spec[0]) ? spec[0].join("+") : spec[0]
    );
    expect(names).toContain("status");
    expect(names).toContain("responses.evaluationStatus");
    expect(names).toContain("responses.evidenceModelId+status");
  });

  it("summary drops responses and studentModel and adds responseCount and answeredTaskIds", () => {
    const session = catalogSession();
    const summary = catalogListSummary(session);
    expect(summary.responses).toBeUndefined();
    expect(summary.studentModel).toBeUndefined();
    expect(summary.responseCount).toBe(2);
    expect(summary.answeredTaskIds).toEqual(["t1"]);
    expect(summary.taskIds).toEqual(["t1", "t2"]);
    expect(summary.deliveryModelId).toBe("dm1");
    expect(JSON.stringify(summary)).not.toMatch(/secret|heavy|smvPosteriors|rawAnswer/);
    expect(CATALOG_SUMMARY_PROJECTION.responses).toBeUndefined();
    expect(CATALOG_SUMMARY_PROJECTION.studentModel).toBeUndefined();
    expect(CATALOG_SUMMARY_PROJECTION["responses.taskId"]).toBe(1);
  });

  it("keeps catalog summary JSON identical on the file store and the memory store", async () => {
    const archived = catalogSession({
      id: "s-arch",
      status: "archived",
      isCompleted: true,
      autoFinished: true,
      responses: [{ taskId: "t2", rawAnswer: heavy }],
    });
    const sessions = [catalogSession(), archived];
    const expected = sessions.map(expectedCatalogSummary);

    const fromFile = await querySessions(
      { sessions, students: [], users: [] },
      {},
      { projection: CATALOG_SUMMARY_PROJECTION }
    );
    expect(fromFile.map(catalogListSummary)).toEqual(expected);
    expect(fromFile[0].responses[0].taskId).toBe("t1");
    expect(fromFile[0].responses[0].rationale).toBeUndefined();
    expect(fromFile[0].studentModel).toBeUndefined();

    process.env.SESSIONS_BACKEND = "memory";
    resetSessionStoreForTests();
    await upsertSessions(sessions);
    const fromMemory = await querySessions(
      { students: [], users: [] },
      {},
      { projection: CATALOG_SUMMARY_PROJECTION }
    );
    expect(fromMemory.map(catalogListSummary)).toEqual(expected);
  });

  it("rating-queue JSON matches the full-document queue while skipping unused fields", async () => {
    const session = ratingSession();
    const rows = await querySessions(
      { sessions: [session], students: [], users: [] },
      { pendingRating: true },
      { projection: RATING_QUEUE_PROJECTION }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].studentModel).toBeUndefined();
    expect(rows[0].assemblyProgress).toBeUndefined();
    expect(rows[0].responses[0].rationale).toBeUndefined();
    expect(rows[0].responses[1].provisionalActivated).toBeUndefined();
    expect(rows[0].responses[1].pendingPhase.extra).toBeUndefined();
    expect(rows[0].responses[2].automatedPhaseResult).toEqual({ activated: true });
    expect(rows[0].responses).toHaveLength(3);

    const projectedQueue = blindedRatingQueueFromSessions(rows);
    const fullQueue = blindedRatingQueueFromSessions([session]);
    expect(JSON.stringify(projectedQueue)).toBe(JSON.stringify(fullQueue));
    expect(projectedQueue.map((row) => row.responseIndex)).toEqual([1, 2]);
    expect(projectedQueue[0].workProduct).toEqual({ selected: "opt_a", note: heavy });
    expect(projectedQueue[1].adjudication).toEqual({
      automatedActivated: true,
      humanActivated: false,
      adjudicationRule: "require_agreement",
    });
  });

  it("keeps a response index when an earlier response has none of the projected fields", () => {
    const session = {
      id: "s-gap",
      studentId: "stu1",
      responses: [{ untouched: true }, { evaluationStatus: "pending_human", taskId: "t9" }],
    };
    const projected = projectSession(session, RATING_QUEUE_PROJECTION);
    expect(projected.responses).toHaveLength(2);
    expect(projected.responses[0]).toEqual({});
    const queue = blindedRatingQueueFromSessions([projected]);
    expect(queue).toHaveLength(1);
    expect(queue[0].responseIndex).toBe(1);
    expect(JSON.stringify(queue)).toBe(JSON.stringify(blindedRatingQueueFromSessions([session])));
  });

  const mongoIt = process.env.MONGO_URI ? it : it.skip;

  mongoIt("mongo returns the same catalog summary JSON and the same rating-queue JSON", async () => {
    const previous = process.env.SESSIONS_BACKEND;
    process.env.SESSIONS_BACKEND = "mongo";
    const live = catalogSession({ id: "mongo-live" });
    const pending = ratingSession();
    pending.id = "mongo-rate";
    resetSessionStoreForTests();
    try {
      await upsertSessions([live, pending]);
      const listed = await querySessions(
        { students: [], users: [] },
        {},
        { projection: CATALOG_SUMMARY_PROJECTION }
      );
      const byId = Object.fromEntries(listed.map((row) => [row.id, row]));
      expect(catalogListSummary(byId["mongo-live"])).toEqual(expectedCatalogSummary(live));
      const queued = await querySessions(
        { students: [], users: [] },
        { pendingRating: true },
        { projection: RATING_QUEUE_PROJECTION }
      );
      expect(JSON.stringify(blindedRatingQueueFromSessions(queued))).toBe(
        JSON.stringify(blindedRatingQueueFromSessions([pending]))
      );
    } finally {
      await mongoRemove("mongo-live");
      await mongoRemove("mongo-rate");
      resetSessionStoreForTests();
      if (previous === undefined) delete process.env.SESSIONS_BACKEND;
      else process.env.SESSIONS_BACKEND = previous;
    }
  });
});

describe("list route JSON", () => {
  const app = express();
  app.use(express.json());
  app.use("/api/sessions", sessionRouter);

  it("returns catalog summaries for /, /active, /archived, and /mine", async () => {
    const live = catalogSession();
    const archived = catalogSession({
      id: "s-arch",
      status: "archived",
      isCompleted: true,
      studentId: "stu2",
      studentIds: ["stu2"],
      responses: [{ taskId: "t2", rawAnswer: heavy }],
    });
    const history = catalogSession({
      id: "s-done",
      status: "completed",
      isCompleted: true,
      studentId: "stu1",
      studentIds: ["stu1"],
      taskIds: ["t1"],
      responses: [{ taskId: "t1", rawAnswer: "done" }],
    });
    loadDB.mockReturnValue({
      sessions: [live, archived, history],
      students: [{ id: "stu1", name: "Stu" }],
      users: [],
    });

    const all = await request(app).get("/api/sessions").set("x-role", "admin");
    expect(all.status).toBe(200);
    expect(all.body).toEqual([
      expectedCatalogSummary(live),
      expectedCatalogSummary(archived),
      expectedCatalogSummary(history),
    ]);
    expect(all.body[0].responses).toBeUndefined();
    expect(all.body[0].studentModel).toBeUndefined();
    expect(all.body[0].responseCount).toBe(2);
    expect(all.body[0].answeredTaskIds).toEqual(["t1"]);
    expect(JSON.stringify(all.body)).not.toMatch(heavy);

    const active = await request(app).get("/api/sessions/active").set("x-role", "admin");
    expect(active.body).toEqual([
      expectedCatalogSummary(live),
      expectedCatalogSummary(history),
    ]);

    const archivedRes = await request(app).get("/api/sessions/archived").set("x-role", "admin");
    expect(archivedRes.body).toEqual([expectedCatalogSummary(archived)]);

    const mine = await request(app).get("/api/sessions/mine").set("x-role", "teacher").set("x-user-id", "teach1");
    expect(mine.body).toEqual([
      expectedCatalogSummary(live),
      expectedCatalogSummary(history),
    ]);

    const studentMine = await request(app)
      .get("/api/sessions/mine")
      .set("x-role", "student")
      .set("x-user-id", "stu1");
    expect(studentMine.body).toEqual([expectedCatalogSummary(live)]);

    const studentHistory = await request(app)
      .get("/api/sessions/mine?scope=history")
      .set("x-role", "student")
      .set("x-user-id", "stu1");
    expect(studentHistory.body).toEqual([expectedCatalogSummary(history)]);
  });

  it("returns the same rating-queue bytes as a full-document read", async () => {
    const pending = ratingSession();
    const other = catalogSession();
    loadDB.mockReturnValue({
      sessions: [other, pending],
      students: [],
      users: [],
    });
    const res = await request(app).get("/api/sessions/rating-queue").set("x-role", "teacher");
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toBe(
      JSON.stringify({ items: blindedRatingQueueFromSessions([other, pending]) })
    );
    expect(JSON.stringify(res.body)).not.toMatch(/secret-auto/);
    expect(JSON.stringify(res.body)).not.toMatch(/stu1b/);
  });
});
