// server/delivery/__tests__/d124HumanRatingQueue.test.js
//
// D124 exit check: a rater completes a queued rating without seeing the
// automated result or the examinee's identity; disagreement triggers the
// declared adjudication rule; every rating is in the audit log.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { seedActivePackages } from "../../test/seedActivePackage.js";
import { applySaveAudits } from "../../utils/auditLog.js";
import {
  applyPhaseGate,
  completeHumanEvaluation,
  EVALUATION_STATUS,
} from "../evaluationPhases.js";
import { blindedRatingQueueFromSessions, blindedQueueRow } from "../raterQueue.js";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    const role = req.headers["x-test-role"] || "teacher";
    const districtId = req.headers["x-test-district"] || "tn-chennai";
    req.user = {
      id: "rater1",
      role,
      profile: { districtId },
      districtId,
    };
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
    saveDB: vi.fn((db) => {
      // Mirror production: collectSaveAudits via applySaveAudits on save.
      const before = loadDB.mock.results[0]?.value
        ? JSON.parse(JSON.stringify(loadDB.mock.results[0].value))
        : { sessions: [], auditLog: [] };
      applySaveAudits(before, db);
    }),
    finishSession: vi.fn(),
    readRawDB: (...args) => loadDB(...args),
  };
});

const { loadDB, saveDB } = await import("../../../src/utils/db-server.js");
const { default: router } = await import("../../routes/sessionRoutes.js");

const evidenceModel = {
  id: "em1",
  versionNumber: 1,
  observables: [
    {
      id: "o1",
      type: "selected_response",
      evidenceRule: {
        direction: "supports",
        strengthLevel: 4,
        activationCondition: "any",
        justification: "Key then human.",
      },
    },
  ],
  evaluationProcedures: [
    {
      id: "ep1",
      observableId: "o1",
      workProductType: "selected_response",
      method: "key",
      description: "Automated key then human confirmation of the Observable.",
      artifact: { kind: "key", correctPatterns: [{ selected: "opt_a" }] },
      phases: [
        { order: 1, kind: "automated" },
        { order: 2, kind: "human", adjudicationRule: "human_wins", rubricId: "rub-1" },
      ],
    },
  ],
  statisticalModels: [
    {
      id: "sm1",
      type: "irt",
      active: true,
      structureConfig: {},
      parameterSets: [
        {
          parameterSetId: "ps1",
          parameters: { o1: { a: 1, b: 0 } },
          packageVersion: "pilot-1",
          converged: true,
          sampleSize: 1,
          calibratedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activeParameterSetId: "ps1",
    },
  ],
};

function makeDb(sessionOverrides = {}) {
  return seedActivePackages({
    rubrics: [
      {
        id: "rub-1",
        name: "Accuracy",
        status: "confirmed",
        dimensions: [
          {
            id: "acc",
            name: "Accuracy",
            levels: [
              { value: 0, label: "No", exemplar: "Wrong work sample" },
              { value: 1, label: "Yes", exemplar: "Correct work sample" },
            ],
            activatesAt: 1,
          },
        ],
      },
    ],
    students: [
      { id: "stu-chennai", name: "Secret Examinee", districtId: "tn-chennai" },
      { id: "stu-madurai", name: "Other District Kid", districtId: "tn-madurai" },
    ],
    sessions: [
      {
        id: "s-chennai",
        studentId: "stu-chennai",
        taskIds: ["t1"],
        currentTaskIndex: 0,
        responses: [],
        studentModel: {},
        selectionStrategy: "fixed",
        status: "in_progress",
        isCompleted: false,
        ...sessionOverrides,
      },
    ],
    tasks: [{ id: "t1", taskModelId: "tm1", generatedObservationIds: [], generatedEvidenceIds: [] }],
    taskModels: [
      {
        id: "tm1",
        versionNumber: 1,
        status: "operational",
        locked: true,
        evidenceModelIds: ["em1"],
        expectedObservations: [
          { observationId: "o1", evidenceModelId: "em1", required: true, weight: 1 },
        ],
      },
    ],
    evidenceModels: [evidenceModel],
    items: [
      {
        id: "item1",
        taskModelId: "tm1",
        versionNumber: 1,
        taskModelVersion: 1,
        status: "confirmed",
        observationId: "o1",
        evidenceModelId: "em1",
        evidenceModelVersion: 1,
        interaction: { type: "mcq", responseComponents: [{ id: "opt_a" }, { id: "opt_b" }] },
        scoring: { method: "dichotomous", evidenceActivationMap: [] },
      },
    ],
    compositeLibrary: [],
    auditLog: [],
  });
}

function buildApp(db) {
  let snapshot = JSON.parse(JSON.stringify(db));
  loadDB.mockReturnValue(db);
  saveDB.mockImplementation((next) => {
    // `next` is often the same object as `db` after in-place mutation.
    // Diff against the last persisted snapshot (production saveDB reads raw disk).
    applySaveAudits(snapshot, next);
    snapshot = JSON.parse(JSON.stringify(next));
    if (next !== db) Object.assign(db, next);
  });
  const app = express();
  app.use(express.json());
  app.use("/api/sessions", router);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("D124 blinding helpers", () => {
  it("queue rows never carry provisionalActivated or student identity", () => {
    const pending = applyPhaseGate(
      {
        activated: true,
        provisionalActivated: true,
        studentId: "stu-chennai",
        studentName: "Secret",
        taskId: "t1",
        itemId: "item1",
        observationId: "o1",
        rawAnswer: "opt_a",
      },
      {
        phases: [
          { order: 1, kind: "automated" },
          { order: 2, kind: "human", adjudicationRule: "human_wins" },
        ],
      }
    );
    const session = {
      id: "s1",
      studentId: "stu-chennai",
      responses: [{ ...pending, taskId: "t1", itemId: "item1", rawAnswer: "opt_a" }],
    };
    const queue = blindedRatingQueueFromSessions([session]);
    expect(queue).toHaveLength(1);
    expect(queue[0].provisionalActivated).toBeUndefined();
    expect(queue[0].automatedPhaseResult).toBeUndefined();
    expect(queue[0].studentId).toBeUndefined();
    expect(queue[0].studentName).toBeUndefined();
    expect(queue[0].workProduct).toEqual({ selected: "opt_a" });
  });
});

describe("D124 exit check — rating queue + audit", () => {
  it("rater completes via blinded queue without seeing automated result or examinee identity", async () => {
    const db = makeDb();
    const gated = applyPhaseGate(
      {
        activated: true,
        observationId: "o1",
        observableId: "o1",
        direction: "supports",
        strength: 4,
        rationale: "auto",
      },
      evidenceModel.evaluationProcedures[0]
    );
    db.sessions[0].responses = [
      {
        ...gated,
        taskId: "t1",
        itemId: "item1",
        itemVersion: 1,
        taskModelVersion: 1,
        evidenceModelId: "em1",
        evidenceModelVersion: 1,
        parameterSetId: "ps1",
        parameterSource: "calibrated",
        rawAnswer: "opt_a",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ];
    const app = buildApp(db);

    const queue = await request(app)
      .get("/api/sessions/rating-queue")
      .set("x-test-role", "teacher");
    expect(queue.status).toBe(200);
    expect(queue.body.items.length).toBeGreaterThanOrEqual(1);
    const row = queue.body.items[0];
    expect(row.provisionalActivated).toBeUndefined();
    expect(row.studentId).toBeUndefined();
    expect(JSON.stringify(row)).not.toMatch(/Secret Examinee/);
    expect(JSON.stringify(row)).not.toMatch(/provisionalActivated/);

    const card = await request(app)
      .get(`/api/sessions/${row.sessionId}/rating/${row.responseIndex}`)
      .set("x-test-role", "teacher");
    expect(card.status).toBe(200);
    expect(card.body.provisionalActivated).toBeUndefined();
    expect(card.body.automatedPhaseResult).toBeUndefined();
    expect(card.body.studentId).toBeUndefined();
    expect(card.body.rubric?.dimensions?.[0]?.levels?.[1]?.exemplar).toMatch(/Correct/);

    const rated = await request(app)
      .post(`/api/sessions/${row.sessionId}/human-rating`)
      .set("x-test-role", "teacher")
      .send({
        responseIndex: row.responseIndex,
        activated: false,
        rationale: "Blind rater says no",
      });
    expect(rated.status).toBe(200);
    expect(rated.body.evaluationStatus).toBe("complete");
    expect(rated.body.activated).toBe(false);

    const audits = (db.auditLog || []).filter((a) => a.action === "human_rating.complete");
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(audits[0].detail.ratedBy).toBe("rater1");
    expect(JSON.stringify(audits[0])).not.toMatch(/opt_a/);
    expect(JSON.stringify(audits[0])).not.toMatch(/Secret/);
  });

  it("require_agreement disagreement holds for adjudication", () => {
    const pending = applyPhaseGate(
      { activated: true, strength: 2 },
      {
        phases: [
          { order: 1, kind: "automated" },
          { order: 2, kind: "human", adjudicationRule: "require_agreement" },
        ],
      }
    );
    const held = completeHumanEvaluation(pending, { activated: false });
    expect(held.evaluationStatus).toBe(EVALUATION_STATUS.PENDING_ADJUDICATION);
    expect(held.activated).toBeNull();

    const session = { id: "s1", responses: [held] };
    const row = blindedQueueRow(session, held, 0);
    expect(row.adjudication.automatedActivated).toBe(true);
    expect(row.adjudication.humanActivated).toBe(false);

    const resolved = completeHumanEvaluation(held, {
      activated: true,
      ratedBy: "adj1",
    });
    expect(resolved.evaluationStatus).toBe(EVALUATION_STATUS.COMPLETE);
    expect(resolved.activated).toBe(true);
    expect(resolved.adjudicationApplied).toBe("manual_adjudication");
  });

  it("students cannot open the rating queue", async () => {
    const db = makeDb();
    const app = buildApp(db);
    const res = await request(app)
      .get("/api/sessions/rating-queue")
      .set("x-test-role", "student");
    expect(res.status).toBe(403);
  });
});
