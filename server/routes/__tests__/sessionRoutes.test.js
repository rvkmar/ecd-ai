// server/routes/__tests__/sessionRoutes.test.js
//
// Day 28 (Week 6): wiring Evidence Identification into sessionRoutes.js.
// Exit check: a session scores through an authored Evidence Model for the
// first time in the app's history. Scoped to the new item-based path on
// POST /:id/submit only -- the legacy db.questions path is verified
// UNCHANGED (still reachable, still behaves the same), not re-tested in
// full here (it has no prior test coverage of its own to preserve; this
// file's job is to prove the new path works and the old one is untouched
// by it, not to backfill full legacy coverage).
//
// sessionRoutes.js has a cold import cost that routeAuth.test.js documents as
// slow enough on this memory-constrained sandbox to need a widened timeout.
// (It used to import `mathjs` for a `log2` it never called; D49b removed that,
// but the module still pulls in the whole delivery layer.)
// Re-importing the router fresh per test (the vi.resetModules() + dynamic
// import pattern evidenceModelLifecycle.test.js uses) pays that cost once
// per test; with 7+ tests that compounds into real flakiness. Only the one
// test that actually needs a fresh env-var read (ITEM_DELIVERY_ENABLED) does
// that; everything else imports the router once, statically, up front.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { seedActivePackages } from "../../test/seedActivePackage.js";

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

vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: vi.fn(),
  saveDB: vi.fn(),
  finishSession: vi.fn(),
}));

const { loadDB, saveDB } = await import("../../../src/utils/db-server.js");
const { default: router } = await import("../sessionRoutes.js");

// Carries an active, calibrated statisticalModel -- src/utils/schema.js's
// sessions validation (a pre-existing contract, not new today) requires
// every response to reference the parameterSetId that was active when it
// was scored, once the session is live. An Evidence Model authored but
// never calibrated cannot deliver; this fixture represents one that can.
const evidenceModel = {
  id: "em1",
  versionNumber: 1,
  observables: [
    {
      id: "o1",
      type: "selected_response",
      evidenceRule: { direction: "supports", strengthLevel: 4, activationCondition: "any", justification: "x" },
    },
  ],
  statisticalModels: [
    {
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
    },
  ],
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
  interaction: { type: "mcq", responseComponents: [{ id: "opt_a" }, { id: "opt_b" }, { id: "opt_c" }] },
  scoring: {
    method: "dichotomous",
    maxScore: 1,
    evidenceActivationMap: [
      { responsePattern: { selected: "opt_a" }, activatesObservable: true, strengthOverride: 4, rationale: "Correct." },
      { responsePattern: { selected: ["opt_b", "opt_c"] }, activatesObservable: false, rationale: "Distractor." },
    ],
  },
};

// A fully "operational"-ready set (Day 29 exposure tests only): strict
// item validation at `operational` needs more than the base fixtures above
// declare (an operational Evidence Model, a statisticalModelType + pilot
// irtParams on the item, and a single-direction evidenceActivationMap --
// mixing an activatesObservable:false entry into a purely "supports"
// observable trips a pre-existing coherence check unrelated to exposure).
const operationalEvidenceModel = { ...evidenceModel, status: "operational", locked: true };
const operationalTaskModel = {
  id: "tm1",
  versionNumber: 1,
  status: "operational",
  locked: true,
  evidenceModelIds: ["em1"],
  expectedObservations: [{ observationId: "o1", evidenceModelId: "em1", required: true, weight: 1 }],
};
const operationalItem = {
  ...item,
  status: "operational",
  psychometrics: { statisticalModelType: "irt", irtParams: { a: 1, b: 0 } },
  scoring: { ...item.scoring, evidenceActivationMap: [item.scoring.evidenceActivationMap[0]] },
  exposureControl: { usageCount: 0, maxUsageBeforeRetire: 5, reactivationCount: 0, maxReactivations: 0 },
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

function makeTask(overrides = {}) {
  return {
    id: "t1",
    taskModelId: "tm1",
    generatedObservationIds: [],
    generatedEvidenceIds: [],
    ...overrides,
  };
}

function makeDb(overrides = {}) {
  const { compositeLibrary, ...rest } = overrides;
  const db = {
    sessions: [makeSession()],
    tasks: [makeTask()],
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
    ...rest,
  };
  if (compositeLibrary !== undefined) {
    db.compositeLibrary = compositeLibrary;
  } else {
    seedActivePackages(db);
  }
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /:id/submit — item-based delivery (Day 28)", () => {
  it("scores through the authored Evidence Model: an activating response produces an Observable Variable value, not a score", async () => {
    const db = makeDb();
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(200);
    const response = res.body.responses[0];
    expect(response).toMatchObject({
      taskId: "t1",
      itemId: "item1",
      evidenceModelId: "em1",
      evidenceModelVersion: 1,
      parameterSetId: "ps1",
      observationId: "o1",
      observableId: "o1",
      activated: true,
      direction: "supports",
      strength: 4,
      rationale: "Correct.",
    });
    expect(response).not.toHaveProperty("scoredValue");
    expect(response).not.toHaveProperty("score");
  });

  it("records a non-activating response correctly", async () => {
    const db = makeDb();
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_b" });

    expect(res.status).toBe(200);
    expect(res.body.responses[0].activated).toBe(false);
  });

  it("advances currentTaskIndex and records the observationId on the task instance", async () => {
    const db = makeDb();
    const app = buildApp(db);

    await request(app).post("/api/sessions/s1/submit").send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(db.sessions[0].currentTaskIndex).toBe(1);
    expect(db.tasks[0].generatedObservationIds).toContain("o1");
    expect(saveDB).toHaveBeenCalled();
  });

  it("increments usageCount on an operational item, for the first time in the app's history", async () => {
    const db = makeDb({
      items: [operationalItem],
      evidenceModels: [operationalEvidenceModel],
      taskModels: [operationalTaskModel],
    });
    const app = buildApp(db);

    await request(app).post("/api/sessions/s1/submit").send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(db.items[0].exposureControl.usageCount).toBe(1);
    expect(db.items[0].status).toBe("operational");
  });

  it("auto-suspends an item once usageCount reaches maxUsageBeforeRetire", async () => {
    const almostRetired = { ...operationalItem, exposureControl: { ...operationalItem.exposureControl, usageCount: 4 } };
    const db = makeDb({
      items: [almostRetired],
      evidenceModels: [operationalEvidenceModel],
      taskModels: [operationalTaskModel],
    });
    const app = buildApp(db);

    await request(app).post("/api/sessions/s1/submit").send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(db.items[0].exposureControl.usageCount).toBe(5);
    expect(db.items[0].status).toBe("suspended");
  });

  it("does not accrue exposure for a non-operational item (draft/preview delivery), but still scores it", async () => {
    const draftItem = { ...item, status: "draft" };
    const db = makeDb({ items: [draftItem] });
    const app = buildApp(db);

    const res = await request(app).post("/api/sessions/s1/submit").send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(200);
    expect(res.body.responses[0].activated).toBe(true);
    expect(db.items[0].status).toBe("draft");
  });

  it("rejects an unknown itemId with 400, without touching the legacy path", async () => {
    const db = makeDb();
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item-does-not-exist", rawAnswer: "opt_a" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid itemId/);
  });

  it("refuses to score against an Evidence Model with no active statistical model at all", async () => {
    const uncalibratedEvidenceModel = { ...evidenceModel, statisticalModels: [] };
    const db = makeDb({ evidenceModels: [uncalibratedEvidenceModel] });
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/has no active statistical model/);
  });

  // Day 38 (Week 8): the pilot-vs-calibrated split (build reference Part
  // 0.2). An Evidence Model can have an ACTIVE statistical model with no
  // calibrated parameter set yet (an authored-but-never-calibrated IRT
  // model, the ordinary state of a brand-new item) -- before Day 38 that
  // refused delivery outright with the same message the previous test used
  // to expect. It now falls back to the item's own pilot
  // `psychometrics.irtParams` (Item Wizard Step 7).
  it("refuses delivery when the active statistical model has no calibrated set AND the item carries no usable pilot IRT parameters", async () => {
    const noCalibrationYet = {
      ...evidenceModel,
      statisticalModels: [{ ...evidenceModel.statisticalModels[0], parameterSets: [], activeParameterSetId: undefined }],
    };
    const db = makeDb({ evidenceModels: [noCalibrationYet] }); // `item` fixture carries no psychometrics.irtParams
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no usable pilot IRT parameters/);
  });

  it("falls back to the item's pilot IRT parameters when the Evidence Model has no calibrated set yet, and tags the response 'pilot'", async () => {
    const noCalibrationYet = {
      ...evidenceModel,
      statisticalModels: [{ ...evidenceModel.statisticalModels[0], parameterSets: [], activeParameterSetId: undefined }],
    };
    const pilotItem = { ...item, psychometrics: { statisticalModelType: "irt", irtParams: { a: 1, b: 0 } } };
    const db = makeDb({ evidenceModels: [noCalibrationYet], items: [pilotItem] });
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(200);
    const response = res.body.responses[0];
    expect(response.parameterSource).toBe("pilot");
    expect(response.parameterSetId).toBeFalsy();
    expect(response.activated).toBe(true);
  });

  // D53b: the 'dina' analogue of the two IRT pilot tests above --
  // `psychometrics.dinaParams` is the slip/guess pilot field, and the
  // fallback is gated to 'dina' only ('gdina' still has none; see the
  // dedicated refusal test below).
  it("refuses delivery when a 'dina' model has no calibrated set AND the item carries no usable pilot DINA parameters", async () => {
    const dinaNoCalibration = {
      ...evidenceModel,
      statisticalModels: [{
        id: "sm1", type: "dina", active: true,
        structureConfig: { qMatrixId: "qm1" }, parameterSets: [], activeParameterSetId: undefined,
      }],
    };
    const db = makeDb({ evidenceModels: [dinaNoCalibration] }); // `item` fixture carries no psychometrics.dinaParams
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no usable pilot DINA parameters/);
  });

  it("falls back to the item's pilot slip/guess parameters when a 'dina' model has no calibrated set yet, and tags the response 'pilot'", async () => {
    const dinaNoCalibration = {
      ...evidenceModel,
      statisticalModels: [{
        id: "sm1", type: "dina", active: true,
        structureConfig: { qMatrixId: "qm1" }, parameterSets: [], activeParameterSetId: undefined,
      }],
    };
    const pilotItem = { ...item, psychometrics: { statisticalModelType: "dina", dinaParams: { slip: 0.1, guess: 0.2 } } };
    const db = makeDb({ evidenceModels: [dinaNoCalibration], items: [pilotItem] });
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(200);
    const response = res.body.responses[0];
    expect(response.parameterSource).toBe("pilot");
    expect(response.parameterSetId).toBeFalsy();
    expect(response.pilotParams).toEqual({ slip: 0.1, guess: 0.2 });
  });

  it("still refuses a 'gdina' model with no calibrated set outright -- no pilot field exists for it", async () => {
    const gdinaNoCalibration = {
      ...evidenceModel,
      statisticalModels: [{
        id: "sm1", type: "gdina", active: true,
        structureConfig: { qMatrixId: "qm1" }, parameterSets: [], activeParameterSetId: undefined,
      }],
    };
    // Even an item carrying dinaParams must not be consulted for 'gdina' --
    // a slip/guess pair is not a valid pilot for a saturated model.
    const pilotItem = { ...item, psychometrics: { statisticalModelType: "gdina", dinaParams: { slip: 0.1, guess: 0.2 } } };
    const db = makeDb({ evidenceModels: [gdinaNoCalibration], items: [pilotItem] });
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Pilot parameters are not yet supported for the 'gdina' family/);
  });

  it("delivers a raw-score (CTT/sum/threshold) item with no parameter set at all, tagged 'not-applicable'", async () => {
    const rawScoreEvidenceModel = {
      ...evidenceModel,
      statisticalModels: [{ id: "sm1", type: "sum", active: true, structureConfig: {}, parameterSets: [] }],
    };
    const db = makeDb({ evidenceModels: [rawScoreEvidenceModel] });
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(200);
    const response = res.body.responses[0];
    expect(response.parameterSource).toBe("not-applicable");
    expect(response.parameterSetId).toBeFalsy();
    expect(response.activated).toBe(true);
  });

  it("accepts a structured work product object as rawAnswer, passed through as-is", async () => {
    const db = makeDb();
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: { selected: "opt_a" } });

    expect(res.status).toBe(200);
    expect(res.body.responses[0].activated).toBe(true);
  });

  it("still processes a legacy questionId request identically (the old path is untouched)", async () => {
    const db = makeDb({
      evidenceModels: [{ id: "em1", observations: [], evidences: [] }],
    });
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", questionId: "q1", rawAnswer: "opt_a", scoredValue: 1 });

    expect(res.status).toBe(200);
    const response = res.body.responses[0];
    expect(response.questionId).toBe("q1");
    expect(response.scoredValue).toBe(1);
    expect(response).not.toHaveProperty("activated");
    // The legacy path never touches assemblyProgress at all -- it returns
    // res.json(session) unchanged, not the item path's spread.
    expect(response).not.toHaveProperty("assemblyProgress");
    expect(res.body).not.toHaveProperty("assemblyProgress");
  });
});

// ---------------------------------------------------------------------
// Day 34 (Week 7): wiring Evidence Accumulation into the item-based
// /submit path, immediately after the response above is scored.
// ---------------------------------------------------------------------
describe("POST /:id/submit — Evidence Accumulation wired in (Day 34)", () => {
  // The base fixtures above have no competencyId/competencies/
  // competencyModels at all -- accumulateEvidence() resolves through that
  // chain, so this fixture set adds the minimum needed for it to actually
  // resolve a Student Model Variable and produce a real posterior, rather
  // than a (still crash-free) refusal.
  function makeDbWithCompetency(overrides = {}) {
    return makeDb({
      evidenceModels: [{ ...evidenceModel, competencyId: "c1", competencyModelVersion: 1 }],
      competencies: [{ id: "c1", modelId: "cm1" }],
      competencyModels: [{
        id: "cm1",
        versionNumber: 1,
        smVariables: [{
          id: "smv1",
          type: "continuous",
          priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } },
        }],
      }],
      ...overrides,
    });
  }

  it("a submit updates and returns the session's SMV posterior -- the D34 exit check", async () => {
    const db = makeDbWithCompetency();
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(200);
    const posterior = res.body.studentModel.smvPosteriors.smv1;
    expect(posterior).toBeTruthy();
    expect(Number.isFinite(posterior.estimate)).toBe(true);
    expect(Number.isFinite(posterior.precision)).toBe(true);
    expect(posterior.responsesUsed).toBe(1);
  });

  it("does not crash and still scores the response when accumulation cannot resolve an SMV (no competencyModels declared)", async () => {
    const db = makeDb(); // the plain fixture -- no competencies/competencyModels
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(200);
    expect(res.body.responses[0].activated).toBe(true);
    expect(res.body.studentModel?.smvPosteriors ?? {}).toEqual({});
    expect(res.body.assemblyProgress).toEqual([]);
  });

  it("surfaces Assembly Model progress toward the stopping criterion, without acting on it", async () => {
    const db = makeDbWithCompetency({
      assemblyModels: [{
        id: "am1",
        competencyModelId: "cm1",
        targetsBySMV: [{ smvId: "smv1", requiredSEM: 5 }], // deliberately loose: one response should already meet it
      }],
    });
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(200);
    expect(res.body.assemblyProgress).toEqual([{
      smvId: "smv1",
      assemblyModelId: "am1",
      estimate: res.body.studentModel.smvPosteriors.smv1.estimate,
      precision: res.body.studentModel.smvPosteriors.smv1.precision,
      requiredSEM: 5,
      stoppingCriterionMet: true,
    }]);
    // Purely informational: the session is not auto-completed or altered
    // by having met the target. Stopping is W11 scope.
    expect(res.body.isCompleted).toBe(false);
  });

  it("persists the posterior across successive submits within the same session", async () => {
    const db = makeDbWithCompetency({
      tasks: [makeTask({ id: "t1" }), makeTask({ id: "t2" })],
      sessions: [makeSession({ taskIds: ["t1", "t2"] })],
    });
    const app = buildApp(db);

    await request(app).post("/api/sessions/s1/submit").send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });
    const res2 = await request(app).post("/api/sessions/s1/submit").send({ taskId: "t2", itemId: "item1", rawAnswer: "opt_a" });

    expect(res2.status).toBe(200);
    expect(res2.body.studentModel.smvPosteriors.smv1.responsesUsed).toBe(2);
  });
});

// ---------------------------------------------------------------------
// An adversarial review of Week 6's whole delivery pipeline (Day 30)
// pinned seven real defects here as "BEHAVIOUR (suspected bug)" tests.
// All seven were fixed in production code the same day; these are now the
// regression tests for those fixes, not documentation of a known gap.
// ---------------------------------------------------------------------
describe("POST /:id/submit — item path, fixes from the Day 30 adversarial review", () => {
  it("FIXED: an item-based response no longer makes a LATER legacy questionId submit fail after the Evidence Model is recalibrated", async () => {
    // The review's most serious finding: validateEntity("sessions", ...)
    // used to re-validate EVERY historical response against the CURRENT db
    // on every write, so a stale provenance pointer left by an earlier
    // item-based response 400'd a later, unrelated legacy request. Fixed
    // by only re-checking the most-recently-appended response -- each
    // response is provenance-checked once, at the moment it's added.
    const db = makeDb({
      sessions: [makeSession({ taskIds: ["t1", "t2"] })],
      tasks: [makeTask(), makeTask({ id: "t2" })],
      evidenceModels: [structuredClone(evidenceModel)],
    });
    const app = buildApp(db);

    const first = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });
    expect(first.status).toBe(200);

    // A normal authoring action: POST /api/evidence-models/:id/recalibrate
    // pushes a new parameter set and flips activeParameterSetId in place.
    const sm = db.evidenceModels[0].statisticalModels[0];
    sm.parameterSets.push({
      parameterSetId: "ps2",
      parameters: { o1: { a: 1.2, b: 0.1 } },
      packageVersion: "pilot-2",
      converged: true,
      sampleSize: 900,
      calibratedAt: "2026-06-01T00:00:00.000Z",
    });
    sm.activeParameterSetId = "ps2";

    const legacy = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t2", questionId: "q1", rawAnswer: "x", scoredValue: 1 });

    expect(legacy.status).toBe(200);
    expect(legacy.body.responses[1].scoredValue).toBe(1);
  });

  it("FIXED: a failed recordItemUsage is now surfaced as response.exposureNote, not silently swallowed", async () => {
    const noPsychometrics = { ...operationalItem };
    delete noPsychometrics.psychometrics;

    const db = makeDb({
      items: [noPsychometrics],
      evidenceModels: [operationalEvidenceModel],
      taskModels: [operationalTaskModel],
    });
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(200);
    expect(res.body.responses[0].activated).toBe(true);
    expect(res.body.responses[0].exposureNote).toMatch(/Exposure update failed validation/);
    expect(db.items[0].exposureControl.usageCount).toBe(0);
  });

  it("FIXED: the item path now refuses an item that doesn't belong to the submitted task's Task Model", async () => {
    const db = makeDb({
      sessions: [makeSession({ taskIds: ["t1", "t2"] })],
      tasks: [makeTask(), makeTask({ id: "t2", taskModelId: "tm-unrelated" })],
    });
    db.taskModels.push({
      id: "tm-unrelated",
      versionNumber: 1,
      status: "operational",
      locked: true,
      evidenceModelIds: [],
      expectedObservations: [],
    });
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t2", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/belongs to Task Model 'tm1', not this task's 'tm-unrelated'/);
    expect(db.tasks[1].generatedObservationIds).not.toContain("o1");
  });

  it("FIXED: resubmitting the same taskId is refused with 409, not silently duplicated", async () => {
    const db = makeDb({
      sessions: [makeSession({ taskIds: ["t1", "t2"] })],
      tasks: [makeTask(), makeTask({ id: "t2" })],
      items: [operationalItem],
      evidenceModels: [operationalEvidenceModel],
      taskModels: [operationalTaskModel],
    });
    const app = buildApp(db);

    const payload = { taskId: "t1", itemId: "item1", rawAnswer: "opt_a" };
    const first = await request(app).post("/api/sessions/s1/submit").send(payload);
    const retry = await request(app).post("/api/sessions/s1/submit").send(payload);

    expect(first.status).toBe(200);
    expect(retry.status).toBe(409);
    expect(retry.body.error).toMatch(/already has a recorded response/);
    expect(db.sessions[0].responses).toHaveLength(1);
    expect(db.sessions[0].currentTaskIndex).toBe(1);
    expect(db.items[0].exposureControl.usageCount).toBe(1);

    // t2 is still reachable.
    const next = await request(app).get("/api/sessions/s1/next-task");
    expect(next.body.taskId).toBe("t2");
  });

  it("FIXED: an item with no observationId now returns a graceful 400, not a 500", async () => {
    const noObservation = { ...item, status: "draft" };
    delete noObservation.observationId;
    const db = makeDb({ items: [noObservation] });
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/has no observationId/);
  });

  it("FIXED: a task record with no generatedObservationIds array no longer 500s on the item path", async () => {
    const db = makeDb();
    delete db.tasks[0].generatedObservationIds;
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(200);
    expect(db.tasks[0].generatedObservationIds).toContain("o1");
  });

  it("FIXED: a suspended (over-exposed) item is refused delivery outright, rather than scored with a frozen counter", async () => {
    const overExposed = {
      ...operationalItem,
      status: "suspended",
      exposureControl: { ...operationalItem.exposureControl, usageCount: 5 },
    };
    const db = makeDb({
      items: [overExposed],
      evidenceModels: [operationalEvidenceModel],
      taskModels: [operationalTaskModel],
    });
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/is 'suspended' and cannot be delivered/);
    expect(db.items[0].exposureControl.usageCount).toBe(5);
  });

  it("FIXED: a multi-select (array) rawAnswer is wrapped correctly and can now match a declared pattern", async () => {
    const multiSelectItem = {
      ...item,
      scoring: {
        method: "dichotomous",
        maxScore: 1,
        evidenceActivationMap: [
          { responsePattern: { selected: ["opt_a", "opt_b"] }, activatesObservable: true, rationale: "Either is acceptable." },
        ],
      },
    };
    const db = makeDb({ items: [multiSelectItem] });
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: ["opt_a"] });

    expect(res.status).toBe(200);
    expect(res.body.responses[0].activated).toBe(true);
  });
});

describe("POST /:id/submit — ITEM_DELIVERY_ENABLED rollback flag", () => {
  it(
    "falls back to the legacy path when ITEM_DELIVERY_ENABLED=false, even if itemId is sent",
    async () => {
      vi.resetModules();
      process.env.ITEM_DELIVERY_ENABLED = "false";
      try {
        const { loadDB: freshLoadDB, saveDB: freshSaveDB } = await import("../../../src/utils/db-server.js");
        const { default: freshRouter } = await import("../sessionRoutes.js");

        const db = makeDb();
        freshLoadDB.mockReturnValue(db);
        freshSaveDB.mockImplementation(() => {});
        const app = express();
        app.use(express.json());
        app.use("/api/sessions", freshRouter);

        const res = await request(app)
          .post("/api/sessions/s1/submit")
          .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

        // The legacy path has no `db.items` awareness at all, so it just
        // records whatever was sent verbatim -- proving the flag genuinely
        // routes around the new code, not just relabels it.
        expect(res.status).toBe(200);
        const response = res.body.responses[0];
        expect(response).not.toHaveProperty("observableId");
        expect(response).not.toHaveProperty("activated");
        expect(response.rawAnswer).toBe("opt_a");
      } finally {
        delete process.env.ITEM_DELIVERY_ENABLED;
      }
    },
    20000
  );
});

describe("GET /:id/next-task — persist the measurement stop (D58)", () => {
  function chainForStopping(amOverrides = {}, sessionOverrides = {}) {
    return makeDb({
      competencyModels: [{ id: "cm1", versionNumber: 1, smVariables: [{ id: "smv-theta", type: "continuous" }] }],
      competencies: [{ id: "c1", modelId: "cm1" }],
      evidenceModels: [{ ...operationalEvidenceModel, competencyId: "c1" }],
      assemblyModels: [{
        id: "am1",
        competencyModelId: "cm1",
        status: "confirmed",
        targetsBySMV: [{ smvId: "smv-theta", requiredSEM: 0.3 }],
        stoppingRules: { maxItems: 1 },
        ...amOverrides,
      }],
      sessions: [makeSession({
        taskIds: ["t1", "t2"],
        currentTaskIndex: 1,
        selectionStrategy: "fixed",
        responses: [{
          taskId: "t1",
          itemId: "item1",
          itemVersion: 1,
          taskModelVersion: 1,
          evidenceModelId: "em1",
          evidenceModelVersion: 1,
          parameterSetId: "ps1",
          parameterSource: "calibrated",
          activated: true,
        }],
        ...sessionOverrides,
      })],
      tasks: [makeTask({ itemId: "item1" }), makeTask({ id: "t2", itemId: "item2" })],
    });
  }

  it("persists stopped on the session when maxItems is reached before the task list ends", async () => {
    const db = chainForStopping();
    const app = buildApp(db);

    const res = await request(app).get("/api/sessions/s1/next-task");

    expect(res.body.taskId).toBeUndefined();
    expect(res.body.stopped).toMatchObject({
      rule: "maxItems",
      assemblyModelId: "am1",
    });
    expect(res.body.stopped.reason).toMatch(/maxItems/);
    expect(res.body.stopped.stoppedAt).toEqual(expect.any(String));
    expect(db.sessions[0].stopped).toEqual(res.body.stopped);
    expect(db.sessions[0].status).toBe("in_progress");
    expect(saveDB).toHaveBeenCalled();
  });

  it("a later next-task returns the persisted stop even if the Assembly Model is gone", async () => {
    const persisted = {
      rule: "targetsMet",
      assemblyModelId: "am-gone",
      reason: "Every reported Assembly Model target is met (1 of 1) at 1 response(s).",
      stoppedAt: "2026-09-13T06:00:00.000Z",
    };
    const db = makeDb({
      assemblyModels: [],
      sessions: [makeSession({
        taskIds: ["t1", "t2"],
        selectionStrategy: "fixed",
        stopped: persisted,
      })],
      tasks: [makeTask(), makeTask({ id: "t2" })],
    });
    const app = buildApp(db);

    const res = await request(app).get("/api/sessions/s1/next-task");

    expect(res.body.stopped).toEqual(persisted);
    expect(res.body.taskId).toBeUndefined();
    expect(saveDB).not.toHaveBeenCalled();
  });

  it("D60: /submit after a persisted stop is refused, so posteriors cannot drift from the stop record", async () => {
    const persisted = {
      rule: "targetsMet",
      assemblyModelId: "am1",
      reason: "Every declared Assembly Model target is scored and met (1 of 1) at 1 response(s).",
      stoppedAt: "2026-09-13T06:00:00.000Z",
    };
    const db = makeDb({
      sessions: [makeSession({
        taskIds: ["t1", "t2"],
        currentTaskIndex: 1,
        selectionStrategy: "fixed",
        responses: [{
          taskId: "t1",
          itemId: "item1",
          itemVersion: 1,
          taskModelVersion: 1,
          evidenceModelId: "em1",
          evidenceModelVersion: 1,
          parameterSetId: "ps1",
          parameterSource: "calibrated",
          activated: true,
        }],
        stopped: persisted,
      })],
      tasks: [makeTask({ itemId: "item1" }), makeTask({ id: "t2", itemId: "item2" })],
      items: [item, { ...item, id: "item2" }],
    });
    const app = buildApp(db);

    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .send({ taskId: "t2", itemId: "item2", rawAnswer: "opt_a" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already met a stopping rule/);
    expect(res.body.stopped).toEqual(persisted);
    expect(db.sessions[0].responses).toHaveLength(1);
    expect(saveDB).not.toHaveBeenCalled();
  });

  it("D60: play / pause do not clear a persisted stop, so later next-task cannot re-open", async () => {
    const persisted = {
      rule: "maxItems",
      assemblyModelId: "am1",
      reason: "Stopping rule maxItems (1) reached: 1 response(s) recorded.",
      stoppedAt: "2026-09-13T06:00:00.000Z",
    };
    const db = makeDb({
      sessions: [makeSession({
        taskIds: ["t1", "t2"],
        status: "paused",
        stopped: persisted,
      })],
      tasks: [makeTask(), makeTask({ id: "t2" })],
    });
    const app = buildApp(db);

    const play = await request(app).post("/api/sessions/s1/play");
    expect(play.status).toBe(200);
    expect(play.body.stopped).toEqual(persisted);
    expect(db.sessions[0].stopped).toEqual(persisted);

    const next = await request(app).get("/api/sessions/s1/next-task");
    expect(next.body.stopped).toEqual(persisted);
    expect(next.body.taskId).toBeUndefined();
  });
});
