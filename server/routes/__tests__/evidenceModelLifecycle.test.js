// server/routes/__tests__/evidenceModelLifecycle.test.js
//
// Covers the evidence model lifecycle route and the calibration window
// that guards recalibration, parameter-set activation and the decision
// rule.
//
// These exist because of a real dead end: /activate was one-way, so a
// model that went operational could never come back. Its decision rule
// and parameters were frozen with no supported route to reopen them,
// while the UI kept the controls enabled and every press came back with
// "Recalibration allowed only after confirmation" -- a message that is
// actively misleading on a model well past confirmation.
//
// loadDB/saveDB and the auth middleware are mocked: this exercises
// evidenceModels.js's own transition logic, not persistence or JWTs.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: "u1", role: "admin" };
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

/** A confirmed, fully calibrated model — the one state that passes every gate. */
function makeModel(overrides = {}) {
  return {
    id: "em1",
    name: "Numerical Reasoning",
    competencyId: "c1",
    competencyModelVersion: 1,
    versionNumber: 1,
    status: "confirmed",
    locked: true,
    observables: [{ id: "o1", statement: "Computes the answer." }],
    statisticalModels: [
      {
        id: "sm1",
        type: "irt",
        subtype: "2pl",
        active: true,
        structureConfig: { observableIds: ["o1"] },
        parameterSets: [{
          parameterSetId: "ps1",
          parameters: { o1: { a: 1.2, b: 0.3 } },
          // Provenance (Day 19): mandatory on every parameter set as of
          // this session, regardless of `strict` -- see
          // src/utils/schema.js's per-parameterSet provenance checks.
          packageVersion: "mirt-1.42.1",
          converged: true,
          sampleSize: 480,
          calibratedAt: "2026-06-01T00:00:00.000Z",
        }],
        activeParameterSetId: "ps1",
      },
    ],
    decisionRule: {
      type: "posterior_threshold",
      threshold: 0.35,
      direction: "above",
      justification: "Cut from the June 2026 standard setting on this calibration scale.",
    },
    ...overrides,
  };
}

/* An evidence model cannot go operational unless a CONFIRMED task model
   delivers its observables, so the happy-path fixture carries one. */
const boundTaskModel = () => ({
  id: "tm1",
  name: "Fractions Task",
  status: "confirmed",
  evidenceModelIds: ["em1"],
});

function makeDB(model, taskModels) {
  return {
    evidenceModels: [model],
    taskModels: taskModels === undefined ? [boundTaskModel()] : taskModels,
    competencies: [{ id: "c1", modelId: "cm1", variableType: "continuous" }],
    competencyModels: [{ id: "cm1", versionNumber: 1, status: "confirmed", locked: true }],
  };
}

async function buildApp(model, taskModels) {
  vi.resetModules();
  const db = makeDB(model, taskModels);
  const { loadDB, saveDB } = await import("../../../src/utils/db-server.js");
  loadDB.mockReturnValue(db);
  saveDB.mockImplementation(() => {});
  const { default: router } = await import("../evidenceModels.js");
  const app = express();
  app.use(express.json());
  app.use("/api/evidenceModels", router);
  return { app, db, saveDB };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* =====================================================
   TRANSITIONS
===================================================== */

describe("PATCH /api/evidenceModels/:id/lifecycle", () => {

  it("activates a ready confirmed model", async () => {
    const { app, db, saveDB } = await buildApp(makeModel());

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "operational" });

    expect(res.status).toBe(200);
    expect(db.evidenceModels[0].status).toBe("operational");
    expect(db.evidenceModels[0].operationalMeta.activatedAt).toBeTruthy();
    expect(saveDB).toHaveBeenCalled();
  });

  it("deactivates an operational model back to suspended", async () => {
    const { app, db } = await buildApp(makeModel({ status: "operational" }));

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "suspended", reason: "Drift review" });

    expect(res.status).toBe(200);
    expect(db.evidenceModels[0].status).toBe("suspended");
    expect(db.evidenceModels[0].operationalMeta.suspendedAt).toBeTruthy();
    expect(db.evidenceModels[0].operationalMeta.suspensionReason).toBe("Drift review");
  });

  it("reactivates a suspended model and counts the reactivation", async () => {
    const { app, db } = await buildApp(
      makeModel({ status: "suspended", operationalMeta: { activatedAt: "2026-01-01T00:00:00.000Z" } })
    );

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "operational" });

    expect(res.status).toBe(200);
    expect(db.evidenceModels[0].status).toBe("operational");
    expect(db.evidenceModels[0].operationalMeta.reactivationCount).toBe(1);
  });

  it("refuses a transition the lifecycle matrix does not allow", async () => {
    const { app, db } = await buildApp(makeModel({ status: "confirmed" }));

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "suspended" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid transition from confirmed to suspended/);
    expect(db.evidenceModels[0].status).toBe("confirmed");
  });

  it("refuses to reactivate out of archived — archived is terminal", async () => {
    const { app } = await buildApp(makeModel({ status: "archived" }));

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "operational" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid transition/);
  });

  it("requires nextStatus", async () => {
    const { app } = await buildApp(makeModel());

    const res = await request(app).patch("/api/evidenceModels/em1/lifecycle").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nextStatus is required/);
  });

  it("404s for a model that does not exist", async () => {
    const { app } = await buildApp(makeModel());

    const res = await request(app)
      .patch("/api/evidenceModels/nope/lifecycle")
      .send({ nextStatus: "operational" });

    expect(res.status).toBe(404);
  });

});

/* =====================================================
   REVIEW STAGE
   The six stored statuses are draft, reviewed, confirmed, operational,
   suspended, archived. The first cut of this route implemented handlers
   for only three of them, so PATCH { nextStatus: "reviewed" } passed
   canTransition(), matched no branch, and returned HTTP 200 "moved from
   draft to reviewed" having changed nothing at all.
===================================================== */

describe("review stage", () => {

  it("moves a draft to reviewed AND actually persists it", async () => {
    const { app, db } = await buildApp(makeModel({ status: "draft", locked: false }));

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "reviewed" });

    expect(res.status).toBe(200);
    expect(db.evidenceModels[0].status).toBe("reviewed");
    expect(db.evidenceModels[0].reviewMeta.submittedForReviewAt).toBeTruthy();
  });

  it("leaves a reviewed model unlocked so the reviewer's findings can be acted on", async () => {
    const { app, db } = await buildApp(makeModel({ status: "draft", locked: false }));

    await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "reviewed" });

    expect(db.evidenceModels[0].locked).toBe(false);
  });

  it("returns a reviewed model to draft on reviewer rejection", async () => {
    const { app, db } = await buildApp(makeModel({ status: "reviewed", locked: false }));

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "draft" });

    expect(res.status).toBe(200);
    expect(db.evidenceModels[0].status).toBe("draft");
    expect(db.evidenceModels[0].locked).toBe(false);
    expect(db.evidenceModels[0].reviewMeta.returnedToDraftAt).toBeTruthy();
  });

  it("refuses confirmation through this route — /confirm owns that gate", async () => {
    const { app, db } = await buildApp(makeModel({ status: "reviewed", locked: false }));

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "confirmed" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/\/confirm/);
    expect(db.evidenceModels[0].status).toBe("reviewed");
  });

  it("blocks calibration while under review", async () => {
    const { app } = await buildApp(makeModel({ status: "reviewed", locked: false }));

    const res = await request(app)
      .post("/api/evidenceModels/em1/recalibrate")
      .send({
        statisticalModelId: "sm1",
        parameters: {},
        calibrationMethod: "x",
        sampleSize: 1,
        packageVersion: "mirt 1.47",
        converged: true,
      });

    expect(res.status).toBe(400);
  });

  it("D90: refuses recalibrate when provenance fields are omitted (no invented defaults)", async () => {
    const { app, db } = await buildApp(makeModel());

    const res = await request(app)
      .post("/api/evidenceModels/em1/recalibrate")
      .send({
        statisticalModelId: "sm1",
        parameters: { o1: { a: 1.1, b: 0.2 } },
        calibrationMethod: "mirt 2PL",
        sampleSize: 900,
        // deliberately omit packageVersion + converged
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/packageVersion|converged/);
    expect(db.evidenceModels[0].statisticalModels[0].parameterSets).toHaveLength(1);
    expect(db.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBe("ps1");
  });

  it(
    "never reports a move it did not make",
    async () => {
      // The regression guard for the silent no-op. Every status the matrix
      // permits must either change `status` or return a non-200.
      const STATUSES = ["draft", "reviewed", "confirmed", "operational", "suspended", "archived"];

      for (const from of STATUSES) {
        for (const to of STATUSES) {
          if (from === to) continue;

          const { app, db } = await buildApp(
            makeModel({ status: from, locked: !["draft", "reviewed"].includes(from) })
          );  // default fixture carries a confirmed task model

          const res = await request(app)
            .patch("/api/evidenceModels/em1/lifecycle")
            .send({ nextStatus: to });

          if (res.status === 200) {
            expect(
              db.evidenceModels[0].status,
              `${from} -> ${to} returned 200 but stored status is "${db.evidenceModels[0].status}"`
            ).toBe(to);
          }
        }
      }
    },
    // 30 (from, to) pairs, each via buildApp()'s vi.resetModules() + a cold
    // dynamic re-import of evidenceModels.js (which transitively pulls in
    // schema.js -- now ~4300 lines after seven days of this week's schema
    // additions). Same root cause and same fix as routeAuth.test.js's
    // sessionRoutes timeout: a slow-import timing issue on this memory-
    // constrained sandbox, not a behavioral flake, so a longer budget is
    // correct rather than a retry.
    30000
  );

  it("refuses a status that is not in the lifecycle at all", async () => {
    const { app, db } = await buildApp(makeModel());

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "retired" });

    expect(res.status).toBe(400);
    expect(db.evidenceModels[0].status).toBe("confirmed");
  });

});

/* =====================================================
   READINESS GATE
===================================================== */

describe("activation readiness", () => {

  it("blocks activation when no parameter set is active", async () => {
    const model = makeModel();
    model.statisticalModels[0].activeParameterSetId = null;
    const { app, db } = await buildApp(model);

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "operational" });

    expect(res.status).toBe(400);
    expect(res.body.errors.join(" ")).toMatch(/active parameter set/i);
    expect(db.evidenceModels[0].status).toBe("confirmed");
  });

  it("rejects a legacy { cutScore } decision rule instead of waving it through", async () => {
    // The old gate was `!model.decisionRule`, so this shape -- which
    // schema.js does not recognise at all -- passed activation and then
    // failed on the next full update.
    const { app } = await buildApp(makeModel({ decisionRule: { cutScore: 5 } }));

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "operational" });

    expect(res.status).toBe(400);
    expect(res.body.errors.join(" ")).toMatch(/type/i);
  });

  it("rejects an empty decision rule object", async () => {
    const { app } = await buildApp(makeModel({ decisionRule: {} }));

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "operational" });

    expect(res.status).toBe(400);
  });

  it("re-runs readiness on reactivation, not just first activation", async () => {
    const model = makeModel({ status: "suspended" });
    model.statisticalModels[0].activeParameterSetId = null;
    const { app } = await buildApp(model);

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "operational" });

    expect(res.status).toBe(400);
  });

});

/* =====================================================
   DELIVERY BINDING
   An evidence model observes nothing by itself; a task model is what
   puts its observables in front of a learner. Activating one that no
   task model delivers declares "this is scoring live sessions" about a
   model no session can reach.
===================================================== */

describe("task model binding gate", () => {

  it("blocks activation when no task model references the evidence model", async () => {
    const { app, db } = await buildApp(makeModel(), []);

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "operational" });

    expect(res.status).toBe(400);
    expect(res.body.errors.join(" ")).toMatch(/No confirmed task model/);
    expect(db.evidenceModels[0].status).toBe("confirmed");
  });

  it("does not accept a DRAFT task model as a binding", async () => {
    const { app } = await buildApp(makeModel(), [
      { id: "tm1", status: "draft", evidenceModelIds: ["em1"] },
    ]);

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "operational" });

    expect(res.status).toBe(400);
    expect(res.body.errors.join(" ")).toMatch(/none of them is confirmed/);
  });

  it("accepts confirmed, operational or suspended task models", async () => {
    for (const status of ["confirmed", "operational", "suspended"]) {
      const { app, db } = await buildApp(makeModel(), [
        { id: "tm1", status, evidenceModelIds: ["em1"] },
      ]);

      const res = await request(app)
        .patch("/api/evidenceModels/em1/lifecycle")
        .send({ nextStatus: "operational" });

      expect(res.status, `task model status ${status}`).toBe(200);
      expect(db.evidenceModels[0].status).toBe("operational");
    }
  });

  it("ignores a task model bound to a different evidence model", async () => {
    const { app } = await buildApp(makeModel(), [
      { id: "tm2", status: "confirmed", evidenceModelIds: ["em-other"] },
    ]);

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "operational" });

    expect(res.status).toBe(400);
  });

  it("applies the gate on REACTIVATION too, not just first activation", async () => {
    // The task model could have been archived or unlinked while the
    // evidence model sat suspended.
    const { app } = await buildApp(makeModel({ status: "suspended" }), []);

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "operational" });

    expect(res.status).toBe(400);
    expect(res.body.errors.join(" ")).toMatch(/task model/i);
  });

  it("does not block deactivation or archiving", async () => {
    const { app, db } = await buildApp(makeModel({ status: "operational" }), []);

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "suspended" });

    expect(res.status).toBe(200);
    expect(db.evidenceModels[0].status).toBe("suspended");
  });

  it("tolerates a db with no taskModels collection at all", async () => {
    const { app } = await buildApp(makeModel(), undefined);
    // buildApp's default supplies one; explicitly strip it instead
    const { app: bare } = await buildApp(makeModel(), null);

    const res = await request(bare)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "operational" });

    expect(res.status).toBe(400);
    expect(app).toBeTruthy();
  });

});

/* =====================================================
   CALIBRATION WINDOW
===================================================== */

describe("calibration window", () => {

  const recalPayload = {
    statisticalModelId: "sm1",
    parameters: { o1: { a: 1.1, b: 0.2 } },
    calibratedBy: "qa@example.org",
    calibrationMethod: "mirt 2PL",
    sampleSize: 900,
    packageVersion: "mirt 1.47",
    converged: true,
  };

  it("allows recalibration while confirmed", async () => {
    const { app, db } = await buildApp(makeModel());

    const res = await request(app).post("/api/evidenceModels/em1/recalibrate").send(recalPayload);

    expect(res.status).toBe(200);
    expect(db.evidenceModels[0].statisticalModels[0].parameterSets).toHaveLength(2);
  });

  it("allows recalibration while suspended — that is what suspending is for", async () => {
    const { app } = await buildApp(makeModel({ status: "suspended" }));

    const res = await request(app).post("/api/evidenceModels/em1/recalibrate").send(recalPayload);

    expect(res.status).toBe(200);
  });

  it("blocks recalibration while operational and names the remedy", async () => {
    const { app, db } = await buildApp(makeModel({ status: "operational" }));

    const res = await request(app).post("/api/evidenceModels/em1/recalibrate").send(recalPayload);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/operational/);
    expect(res.body.error).toMatch(/[Dd]eactivate/);
    expect(db.evidenceModels[0].statisticalModels[0].parameterSets).toHaveLength(1);
  });

  it("blocks the decision rule while operational", async () => {
    const { app } = await buildApp(makeModel({ status: "operational" }));

    const res = await request(app)
      .post("/api/evidenceModels/em1/decision-rule")
      .send({ decisionRule: { type: "mastery", threshold: 0.8, direction: "above", justification: "calibration basis stated here." } });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/[Dd]eactivate/);
  });

  it("allows the decision rule again once deactivated", async () => {
    const { app, db } = await buildApp(makeModel({ status: "suspended" }));

    const res = await request(app)
      .post("/api/evidenceModels/em1/decision-rule")
      .send({ decisionRule: { threshold: 0.5 } });

    expect(res.status).toBe(200);
    // partial update must not clobber the fields it did not mention
    expect(db.evidenceModels[0].decisionRule.type).toBe("posterior_threshold");
    expect(db.evidenceModels[0].decisionRule.threshold).toBe(0.5);
  });

  it("blocks parameter-set activation while operational", async () => {
    const model = makeModel({ status: "operational" });
    model.statisticalModels[0].parameterSets.push({
      parameterSetId: "ps2",
      parameters: {},
      packageVersion: "mirt 1.47",
      converged: true,
      sampleSize: 100,
    });
    const { app } = await buildApp(model);

    const res = await request(app)
      .post("/api/evidenceModels/em1/activate-parameter-set")
      .send({ statisticalModelId: "sm1", parameterSetId: "ps2" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/[Dd]eactivate/);
  });

  it("D90: refuses to activate a parameter set without provenance", async () => {
    const model = makeModel();
    model.statisticalModels[0].parameterSets.push({
      parameterSetId: "ps2",
      parameters: { o1: { a: 1, b: 0 } },
      // omit packageVersion / converged / sampleSize
    });
    const { app, db } = await buildApp(model);

    const res = await request(app)
      .post("/api/evidenceModels/em1/activate-parameter-set")
      .send({ statisticalModelId: "sm1", parameterSetId: "ps2" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/converged|packageVersion|sampleSize/);
    expect(db.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBe("ps1");
  });

  it("still blocks everything on a draft, for the original reason", async () => {
    const { app } = await buildApp(makeModel({ status: "draft", locked: false }));

    const res = await request(app).post("/api/evidenceModels/em1/recalibrate").send(recalPayload);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/confirmed/);
  });

});

/* =====================================================
   /activate ALIAS
===================================================== */

describe("POST /api/evidenceModels/:id/activate (alias)", () => {

  it("still activates a confirmed model", async () => {
    const { app, db } = await buildApp(makeModel());

    const res = await request(app).post("/api/evidenceModels/em1/activate").send({});

    expect(res.status).toBe(200);
    expect(res.body.model.status).toBe("operational");
    expect(db.evidenceModels[0].status).toBe("operational");
  });

  it("now also reactivates a suspended model — it used to refuse", async () => {
    const { app, db } = await buildApp(makeModel({ status: "suspended" }));

    const res = await request(app).post("/api/evidenceModels/em1/activate").send({});

    expect(res.status).toBe(200);
    expect(db.evidenceModels[0].status).toBe("operational");
  });

});

/* =====================================================
   THE REVIEW GATE ON /confirm

   lifecycleMatrix.TRANSITIONS has always declared
   draft -> reviewed -> confirmed, but POST /:id/confirm used to
   accept a draft directly: the matrix said review was mandatory
   while the code said it was optional. These lock the resolution
   in — the wizard's final-step Save promotes to `reviewed`, and
   only a reviewed model can be confirmed.
===================================================== */

/* makeModel() is built for the lifecycle route, which never runs strict
   schema validation -- it carries no claimStatement, no warrants and only a
   bare observable. POST /:id/confirm DOES validate strict, so the green path
   needs a genuinely complete model: claim, a fully-specified warrant, an
   observable linked to it with a complete evidenceRule, and exactly one
   active statistical model. */
function strictValidModel(overrides = {}) {
  return makeModel({
    status: "reviewed",
    locked: false,
    claimStatement:
      "The student can reason about proportional relationships in numerical contexts.",
    warrants: [
      {
        id: "w1",
        reasoningStatement:
          "Correct computation indicates command of the underlying proportion.",
        cognitiveAttribute: "proportional_reasoning",
        performanceCondition: "Multi-step numerical items without a calculator.",
        limitationClause:
          "Arithmetic slips can mask reasoning the student actually possesses.",
      },
    ],
    observables: [
      {
        id: "o1",
        statement: "Computes the answer.",
        type: "response_accuracy",
        warrantId: "w1",
        evidenceRule: {
          direction: "supports",
          strengthLevel: 3,
          activationCondition: "Response scored correct.",
          justification:
            "A correct response on this item type is positive evidence for the claim.",
        },
      },
    ],
    evaluationProcedures: [
      {
        id: "ep1",
        observableId: "o1",
        workProductId: "wp_o1",
        workProductType: "mcq_selection",
        method: "key",
        description: "Answer key maps the selected option to a dichotomous observable.",
        artifactRef: "inline:key/o1",
        artifact: { kind: "key", correctPatterns: [{ selected: "opt_a" }] },
      },
    ],
    fairnessNotes:
      "Residual language-load risk accepted for Grade 10 numerical stems after orientation screen.",
    difReviewChecklist: [
      { id: "dif1", prompt: "Gender DIF reviewed?", status: "pass" },
      { id: "dif2", prompt: "Language-load reviewed?", status: "pass" },
      { id: "dif3", prompt: "Access reviewed?", status: "na" },
    ],
    ...overrides,
  });
}

describe("POST /api/evidenceModels/:id/confirm — review gate", () => {

  it("refuses to confirm a draft", async () => {
    const { app, db, saveDB } = await buildApp(
      makeModel({ status: "draft", locked: false })
    );

    const res = await request(app).post("/api/evidenceModels/em1/confirm");

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Only reviewed models can be confirmed/);
    expect(db.evidenceModels[0].status).toBe("draft");
    expect(db.evidenceModels[0].locked).toBe(false);
    expect(saveDB).not.toHaveBeenCalled();
  });

  it("confirms and locks a reviewed model", async () => {
    const { app, db } = await buildApp(strictValidModel());

    const res = await request(app).post("/api/evidenceModels/em1/confirm");

    expect(res.status).toBe(200);
    expect(db.evidenceModels[0].status).toBe("confirmed");
    expect(db.evidenceModels[0].locked).toBe(true);
  });

  it("still refuses a model that is already confirmed", async () => {
    const { app } = await buildApp(makeModel());

    const res = await request(app).post("/api/evidenceModels/em1/confirm");

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already confirmed/);
  });
});

/* =====================================================
   PUT MUST NOT DEMOTE A MODEL UNDER REVIEW

   The wizard PUTs silently on every Next, including while a
   reviewer re-walks the steps from the list's Review button.
   Forcing status:"draft" there would demote the model behind the
   reviewer's back and put Lock & Confirm out of reach.
===================================================== */

describe("PUT /api/evidenceModels/:id — status preservation", () => {

  it("keeps a reviewed model reviewed across an auto-save", async () => {
    const reviewed = strictValidModel({ status: "reviewed", locked: false });
    const { app, db } = await buildApp(reviewed);

    const res = await request(app)
      .put("/api/evidenceModels/em1")
      .send({ ...reviewed, name: "Renamed" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("reviewed");
    expect(db.evidenceModels[0].status).toBe("reviewed");
  });

  it("keeps a draft a draft", async () => {
    /* schema.js: "Draft evidence model cannot contain parameterSets" -- that
       rule fires even in non-strict mode, so a draft fixture has to strip the
       calibration payload makeModel() carries for the operational tests. */
    const draft = makeModel({
      status: "draft",
      locked: false,
      statisticalModels: [
        {
          id: "sm1",
          type: "irt",
          subtype: "2pl",
          active: true,
          structureConfig: { observableIds: ["o1"] },
        },
      ],
    });

    const { app, db } = await buildApp(draft);

    const res = await request(app)
      .put("/api/evidenceModels/em1")
      .send({ ...draft, name: "Renamed" });

    expect(res.status).toBe(200);
    expect(db.evidenceModels[0].status).toBe("draft");
  });
});

/* =====================================================
   TAKING AN EVIDENCE MODEL DOWN UNDER A LIVE TASK MODEL
===================================================== */

describe("PATCH /:id/lifecycle — suspension is blocked by live task models", () => {
  // An operational task model is in delivery. Suspending the evidence
  // model beneath it would leave that task collecting responses that
  // nothing can score — its scoring model is paused.
  //
  // Deliberately a REFUSAL rather than a cascade: suspending evidence is
  // usually a calibration decision, and silently deactivating every task
  // running on it would be a far larger operational change than the author
  // asked for, made invisibly. The refusal names the remedy instead.
  //
  // This is the same rule as the activation gate in
  // server/utils/lifecycleValidation.js, read from the other end — that one
  // stops a task going live while its evidence is down. Keep them in step.

  // makeModel() defaults to `confirmed`; suspension and archival are only
  // reachable from `operational`, so every fixture in this block overrides
  // it. Without that the transition fails at canTransition() with a 400
  // and never reaches the guard under test.
  const liveTask = (overrides = {}) => ({
    id: "tm1",
    name: "Fractions Task",
    versionNumber: 1,
    status: "operational",
    evidenceModelIds: ["em1"],
    ...overrides,
  });

  it("refuses with 409 and does not move the model", async () => {
    const { app, db, saveDB } = await buildApp(makeModel({ status: "operational" }), [liveTask()]);

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "suspended", reason: "recalibrating" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Fractions Task/);
    expect(res.body.error).toMatch(/Deactivate it first/);
    expect(db.evidenceModels[0].status).toBe("operational");
    expect(saveDB).not.toHaveBeenCalled();
  });

  it("succeeds once the task model has been deactivated", async () => {
    const { app, db } = await buildApp(makeModel({ status: "operational" }), [liveTask({ status: "suspended" })]);

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "suspended", reason: "recalibrating" });

    expect(res.status).toBe(200);
    expect(db.evidenceModels[0].status).toBe("suspended");
    expect(db.evidenceModels[0].operationalMeta.suspensionReason).toBe("recalibrating");
  });

  it.each(["confirmed", "suspended", "archived", "draft"])(
    "is not blocked by a %s task model",
    async (status) => {
      const { app } = await buildApp(makeModel({ status: "operational" }), [liveTask({ status })]);

      await request(app)
        .patch("/api/evidenceModels/em1/lifecycle")
        .send({ nextStatus: "suspended" })
        .expect(200);
    }
  );

  it("names every live task model, not just the first", async () => {
    const { app } = await buildApp(makeModel({ status: "operational" }), [
      liveTask(),
      liveTask({ id: "tm2", name: "Fraction Comparison" }),
    ]);

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "suspended" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Fractions Task/);
    expect(res.body.error).toMatch(/Fraction Comparison/);
    expect(res.body.error).toMatch(/2 task models are still operational/);
  });

  it("guards archival too — permanent, so if suspension is unsafe this is more so", async () => {
    const { app, db } = await buildApp(makeModel({ status: "operational" }), [liveTask()]);

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "archived" });

    expect(res.status).toBe(409);
    expect(db.evidenceModels[0].status).toBe("operational");
  });
});
