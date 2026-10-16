// server/routes/__tests__/taskModelLifecycle.test.js
//
// Covers the Task Model route's update path.
//
// This exists because of a real dead end: PUT /:id returned 409 for ANY
// request against a locked record, and confirmation sets locked = true.
// So `confirmed → operational → archived` -- which lifecycleMatrix
// declares, and which TaskModelList renders buttons for -- could never be
// performed through the only route the client calls. Activation and
// archival were both unreachable, and every button press came back with
// "Confirmed TaskModel cannot be modified. Clone instead."
//
// The fix has to preserve immutability while allowing the transition, so
// these tests pin BOTH halves: the status moves, and a structural edit
// smuggled into the same request is discarded rather than applied.
//
// loadDB/saveDB and the auth middleware are mocked: this exercises
// taskModelsRoutes.js's own transition logic, not persistence or JWTs.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Both exports must be stubbed: taskModelsRoutes.js imports authorizeRole
// for the force-deactivate route, and a missing export would make the
// router throw at registration rather than fail a test.
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

import { loadDB, saveDB } from "../../../src/utils/db-server.js";
import taskModelsRouter from "../taskModelsRoutes.js";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/taskModels", taskModelsRouter);
  return app;
}

// Operational, not merely confirmed: activating a TaskModel now requires
// every bound Evidence Model to be live. Tests that care about the
// evidence gate itself override this.
function makeEvidenceModel(overrides = {}) {
  return {
    id: "em1",
    name: "EM One",
    status: "operational",
    locked: true,
    versionNumber: 1,
    competencyId: "c1",
    observables: [{ id: "o1", statement: "Solves" }],
    ...overrides,
  };
}

function makeTaskModel(overrides = {}) {
  return {
    id: "tm1",
    name: "Multi-step equation",
    description: "Solve and justify.",
    status: "confirmed",
    locked: true,
    versionNumber: 1,
    evidenceModelIds: ["em1"],
    primaryEvidenceModelId: "em1",
    expectedObservations: [
      { observationId: "o1", evidenceModelId: "em1", required: true, weight: 1 },
    ],
    taskStructure: {
      presentationMode: "interactive",
      responseFormat: "selected",
      stimulusPolicy: "static",
    },
    blueprintConstraints: { difficultyRange: { min: 0, max: 1 }, exposurePolicy: {} },
    taskCompositionType: "atomic",
    subTaskIds: [],
    actions: ["select"],
    accessibilityAssumptions: { languageLoad: "below target grade band" },
    equivalenceGroupId: "grp-1",
    ...overrides,
  };
}

/** A confirmed Item instantiating tm1 v1 — what activation now requires. */
function makeItem(overrides = {}) {
  return {
    id: "it1",
    taskModelId: "tm1",
    taskModelVersion: 1,
    evidenceModelId: "em1",
    observationId: "o1",
    status: "confirmed",
    locked: true,
    ...overrides,
  };
}

// Items default to one confirmed instantiation: a TaskModel can no longer
// be activated without one, so every activation test would otherwise be
// testing the item rule rather than what it means to test.
function seed(taskModel, items = [makeItem()], evidenceModels = [makeEvidenceModel()], sessions = []) {
  const db = {
    taskModels: [taskModel],
    evidenceModels,
    items,
    sessions,
    tasks: [{ id: "t1", taskModelId: "tm1" }],
  };
  loadDB.mockReturnValue(db);
  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PUT /api/taskModels/:id — locked models", () => {
  it("promotes a confirmed model to operational", async () => {
    const db = seed(makeTaskModel());

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ status: "operational" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("operational");
    expect(res.body.locked).toBe(true);
    expect(db.taskModels[0].status).toBe("operational");
    expect(saveDB).toHaveBeenCalled();
  });

  it("archives an operational model", async () => {
    seed(makeTaskModel({ status: "operational" }));

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ status: "archived" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("archived");
  });

  it("discards a structural edit smuggled in alongside the transition", async () => {
    const db = seed(makeTaskModel());

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({
        status: "operational",
        name: "Renamed behind the lock",
        evidenceModelIds: ["em-other"],
        expectedObservations: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Multi-step equation");
    expect(res.body.evidenceModelIds).toEqual(["em1"]);
    expect(db.taskModels[0].expectedObservations).toHaveLength(1);
  });

  it("still refuses an edit that carries no transition", async () => {
    seed(makeTaskModel());

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ name: "Renamed" });

    expect(res.status).toBe(409);
    expect(saveDB).not.toHaveBeenCalled();
  });

  it("refuses a transition the lifecycle matrix does not declare", async () => {
    seed(makeTaskModel());

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ status: "draft" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid lifecycle transition/);
  });

  it("blocks activation when accessibility assumptions are empty", async () => {
    seed(makeTaskModel({ accessibilityAssumptions: {} }));

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ status: "operational" });

    expect(res.status).toBe(400);
    expect(res.body.details.some((d) => /accessibility/.test(d))).toBe(true);
  });
});

describe("PUT /api/taskModels/:id — unlocked models", () => {
  it("saves a draft that has not reached the later wizard steps", async () => {
    // The wizard auto-saves on every Next. A draft leaving the evidence
    // step legitimately has no observables, structure or blueprint yet;
    // strict validation used to reject it with a 400 listing fields the
    // author had not reached.
    seed(
      makeTaskModel({
        status: "draft",
        locked: false,
        expectedObservations: [],
        taskStructure: { presentationMode: "", responseFormat: "", stimulusPolicy: "" },
        blueprintConstraints: { difficultyRange: {}, exposurePolicy: {} },
        taskCompositionType: "",
        actions: [],
      })
    );

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ description: "Refined intent." });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe("Refined intent.");
  });

  it("locks the model when the wizard confirms through this route", async () => {
    seed(makeTaskModel({ status: "reviewed", locked: false }));

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ ...makeTaskModel({ status: "reviewed", locked: false }), status: "confirmed" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmed");
    expect(res.body.locked).toBe(true);
    expect(res.body.compositeLibrary.ok).toBe(true);
    expect(res.body.compositeLibrary.itemCount).toBe(1);
  });

  it("rejects a confirmation whose observable weights do not total 1", async () => {
    const reviewed = makeTaskModel({
      status: "reviewed",
      locked: false,
      expectedObservations: [
        { observationId: "o1", evidenceModelId: "em1", required: true, weight: 1 },
        { observationId: "o1b", evidenceModelId: "em1", required: false, weight: 1 },
      ],
    });
    seed(reviewed);

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ ...reviewed, status: "confirmed" });

    expect(res.status).toBe(400);
  });
});

describe("PUT /api/taskModels/:id — missing records", () => {
  it("returns 404 when the collection itself is absent", () => {
    // `db.taskModels?.findIndex(...)` yields undefined, and
    // `undefined === -1` is false -- so the guard fell through to
    // `db.taskModels[undefined]` and threw a 500 on a fresh database.
    loadDB.mockReturnValue({ evidenceModels: [] });

    return request(makeApp())
      .put("/api/taskModels/tm-missing")
      .send({ status: "reviewed" })
      .expect(404);
  });

  it("returns 404 for an unknown id", () => {
    seed(makeTaskModel());

    return request(makeApp())
      .put("/api/taskModels/nope")
      .send({ status: "operational" })
      .expect(404);
  });
});

describe("evidence/task-form coherence does not deadlock the wizard", () => {
  // Reported from a live walkthrough: binding an IRT-backed evidence
  // model in Step 2 and pressing Next returned
  //   "IRT/Rasch evidence requires selected or hybrid response format"
  // for taskStructure.responseFormat -- a field authored in Step 4, which
  // could only be reached by getting past Step 2. Circular deadlock, and
  // the wizard could not be completed at all for IRT, CTT,
  // bayesian_network or threshold evidence.
  //
  // The whole coherence layer is now gated on strict validation, so it
  // applies at the promotion gate rather than on draft autosave.

  const irtEvidence = makeEvidenceModel({
    statisticalModels: [
      { id: "sm1", type: "irt", subtype: "2pl", active: true, structureConfig: {} },
    ],
  });

  function seedIrt(taskModel) {
    const db = {
      taskModels: [taskModel],
      evidenceModels: [irtEvidence],
      items: [makeItem()],
    };
    loadDB.mockReturnValue(db);
    return db;
  }

  it("saves the Step 2 autosave with taskStructure still blank", async () => {
    seedIrt(
      makeTaskModel({
        status: "draft",
        locked: false,
        expectedObservations: [],
        taskStructure: { presentationMode: "", responseFormat: "", stimulusPolicy: "" },
        taskCompositionType: "",
        actions: [],
      })
    );

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ evidenceModelIds: ["em1"], primaryEvidenceModelId: "em1" });

    expect(res.status).toBe(200);
  });

  it("saves a draft whose response format is incompatible", async () => {
    // Step 4 is where the author picks it; blocking the save is not how
    // they should find out it is wrong.
    seedIrt(
      makeTaskModel({
        status: "draft",
        locked: false,
        taskStructure: {
          presentationMode: "interactive",
          responseFormat: "constructed",
          stimulusPolicy: "parameterized",
        },
      })
    );

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ description: "Refined." });

    expect(res.status).toBe(200);
  });

  it("refuses that same model at the promotion gate", async () => {
    const model = makeTaskModel({
      status: "draft",
      locked: false,
      taskStructure: {
        presentationMode: "interactive",
        responseFormat: "constructed",
        stimulusPolicy: "parameterized",
      },
    });
    seedIrt(model);

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ ...model, status: "reviewed" });

    expect(res.status).toBe(400);
    expect(res.body.details.some((d) => /selected or hybrid/.test(d))).toBe(true);
  });

  it("lets a compatible model through the gate", async () => {
    const model = makeTaskModel({
      status: "draft",
      locked: false,
      taskStructure: {
        presentationMode: "interactive",
        responseFormat: "selected",
        stimulusPolicy: "parameterized",
      },
    });
    seedIrt(model);

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ ...model, status: "reviewed" });

    expect(res.status).toBe(200);
  });

  it("still rejects a static stimulus policy behind IRT evidence", async () => {
    const model = makeTaskModel({
      status: "draft",
      locked: false,
      taskStructure: {
        presentationMode: "interactive",
        responseFormat: "selected",
        stimulusPolicy: "static",
      },
    });
    seedIrt(model);

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ ...model, status: "reviewed" });

    expect(res.status).toBe(400);
    expect(res.body.details.some((d) => /static stimulusPolicy/.test(d))).toBe(true);
  });
});

describe("a TaskModel cannot be activated without Items referencing it", () => {
  // A TaskModel is a blueprint; delivery happens through Items. One with
  // nothing instantiating it would be live in name only — a session that
  // selected it would have nothing to present.

  it("refuses activation when the item bank is empty", async () => {
    seed(makeTaskModel(), []);

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ status: "operational" });

    expect(res.status).toBe(400);
    expect(res.body.details.some((d) => /no Item instantiates/.test(d))).toBe(true);
  });

  it("does not count a draft item", async () => {
    seed(makeTaskModel(), [makeItem({ status: "draft", locked: false })]);

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ status: "operational" });

    expect(res.status).toBe(400);
    expect(res.body.details.some((d) => /none is confirmed/.test(d))).toBe(true);
  });

  it("activates on a single confirmed item", async () => {
    seed(makeTaskModel(), [makeItem()]);

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ status: "operational" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("operational");
  });

  it("will not let a new version ride on the previous version's items", async () => {
    // A clone starts with zero items: every existing item still declares
    // taskModelVersion 1, and the item validator rejects a mismatch.
    seed(makeTaskModel({ versionNumber: 2 }), [makeItem({ taskModelVersion: 1 })]);

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ status: "operational" });

    expect(res.status).toBe(400);
    expect(res.body.details.some((d) => /version 2/.test(d))).toBe(true);
  });

  it("activates the new version once migrated items exist", async () => {
    seed(makeTaskModel({ versionNumber: 2 }), [makeItem({ taskModelVersion: 2 })]);

    await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ status: "operational" })
      .expect(200);
  });

  it("leaves the safety valve open — suspension and archival never require items", async () => {
    // If this rule extended to `suspended`, emptying the item bank would
    // block the very transition used to take a broken TaskModel out of
    // service.
    seed(makeTaskModel({ status: "operational" }), []);
    await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ status: "suspended" })
      .expect(200);

    seed(makeTaskModel({ status: "operational" }), []);
    await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ status: "archived" })
      .expect(200);
  });

  it("does not require items to CONFIRM — they are authored afterwards", async () => {
    seed(makeTaskModel({ status: "reviewed", locked: false }), []);

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ ...makeTaskModel({ status: "reviewed", locked: false }), status: "confirmed" });

    expect(res.status).toBe(200);
  });
});

describe("a TaskModel cannot be activated before its Evidence Models are live", () => {
  // Everything a task produces is scored against its bound Evidence
  // Models, and those are only live once OPERATIONAL. A merely `confirmed`
  // model is structurally frozen but not activated; a `suspended` one has
  // been deliberately pulled, usually over its calibration. Delivering
  // against either means collecting responses nothing can score.
  //
  // The chain activates bottom-up: Evidence Model → operational, then the
  // TaskModel confirmed and its Items confirmed, then the TaskModel
  // activated.

  it("refuses while the bound model is only confirmed", async () => {
    seed(makeTaskModel(), [makeItem()], [makeEvidenceModel({ status: "confirmed" })]);

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ status: "operational" });

    expect(res.status).toBe(400);
    expect(res.body.details.some((d) => /must be operational first/.test(d))).toBe(true);
    expect(res.body.details.some((d) => /EM One \(confirmed\)/.test(d))).toBe(true);
  });

  it("refuses while the bound model is suspended", async () => {
    seed(makeTaskModel(), [makeItem()], [makeEvidenceModel({ status: "suspended" })]);

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ status: "operational" });

    expect(res.status).toBe(400);
    expect(res.body.details.some((d) => /suspended/.test(d))).toBe(true);
  });

  it("requires EVERY bound model to be live, not just the primary", async () => {
    const secondary = makeEvidenceModel({
      id: "em2",
      name: "Secondary",
      status: "confirmed",
      observables: [{ id: "o2", statement: "Explains." }],
    });

    seed(
      makeTaskModel({ evidenceModelIds: ["em1", "em2"] }),
      [makeItem()],
      [makeEvidenceModel(), secondary]
    );

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ status: "operational" });

    expect(res.status).toBe(400);
    expect(res.body.details.some((d) => /Secondary \(confirmed\)/.test(d))).toBe(true);
  });

  it("reports the evidence gate and the item gate together", async () => {
    // One failed attempt should show the whole remaining chain, not send
    // the author round the loop twice.
    seed(makeTaskModel(), [], [makeEvidenceModel({ status: "confirmed" })]);

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ status: "operational" });

    expect(res.body.details.some((d) => /must be operational first/.test(d))).toBe(true);
    expect(res.body.details.some((d) => /no Item instantiates/.test(d))).toBe(true);
  });

  it("still CONFIRMS against a merely confirmed evidence model", async () => {
    // Confirming a TaskModel against confirmed evidence is the normal
    // authoring order; only activation demands a live model.
    const model = makeTaskModel({ status: "reviewed", locked: false });
    seed(model, [], [makeEvidenceModel({ status: "confirmed" })]);

    await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ ...model, status: "confirmed" })
      .expect(200);
  });

  it("never blocks suspension or archival on evidence state", async () => {
    seed(makeTaskModel({ status: "operational" }), [], [makeEvidenceModel({ status: "suspended" })]);
    await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ status: "suspended" })
      .expect(200);
  });
});

/* =====================================================
   DEACTIVATION UNDER A LIVE SESSION
===================================================== */

describe("a live session blocks deactivation, and Force Deactivate clears it", () => {
  // Pulling a Task Model out of delivery mid-session breaks that session:
  // the next task it asks for is gone.
  //
  // This is the ONLY gate on `suspended`/`archived`, and it is only safe
  // to have because Force Deactivate exists. Every other activation rule
  // deliberately leaves suspension ungated so a broken Task Model can
  // always be pulled — do not add a second gate here without a forced
  // path through it.

  const liveSession = (overrides = {}) => ({
    id: "s1",
    studentId: "stu1",
    taskIds: ["t1"],
    status: "in_progress",
    isCompleted: false,
    responses: [{ itemId: "it1", value: "a" }],
    ...overrides,
  });

  it("refuses deactivation and points at Force Deactivate", async () => {
    const db = seed(makeTaskModel({ status: "operational" }), [makeItem()],
      [makeEvidenceModel()], [liveSession()]);

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ status: "suspended" });

    expect(res.status).toBe(400);
    expect(res.body.details.some((d) => /1 session is still live/.test(d))).toBe(true);
    expect(res.body.details.some((d) => /Force Deactivate/.test(d))).toBe(true);
    expect(db.taskModels[0].status).toBe("operational");
  });

  it.each(["in_progress", "paused", "reopened"])(
    "treats a %s session as live",
    async (status) => {
      // "in_progress" is the canonical spelling (see src/utils/sessionStatus.js);
      // the Day 8 migration normalized any legacy "in-progress" records.
      seed(makeTaskModel({ status: "operational" }), [makeItem()],
        [makeEvidenceModel()], [liveSession({ status })]);

      const res = await request(makeApp())
        .put("/api/taskModels/tm1")
        .send({ status: "suspended" });

      expect(res.status).toBe(400);
    }
  );

  it.each(["submitted", "completed", "reviewed", "archived"])(
    "does not treat a %s session as live",
    async (status) => {
      seed(makeTaskModel({ status: "operational" }), [makeItem()],
        [makeEvidenceModel()], [liveSession({ status, isCompleted: true })]);

      await request(makeApp())
        .put("/api/taskModels/tm1")
        .send({ status: "suspended" })
        .expect(200);
    }
  );

  it("still finds the session when its task row is missing", async () => {
    // A dangling taskIds reference is exactly where a tasks-only lookup
    // silently reports "nothing depends on this".
    seed(makeTaskModel({ status: "operational" }), [makeItem()], [makeEvidenceModel()],
      [liveSession({ taskIds: ["gone"] })]);

    const res = await request(makeApp())
      .put("/api/taskModels/tm1")
      .send({ status: "suspended" });

    expect(res.status).toBe(400);
  });

  it("closes the sessions and deactivates in one call", async () => {
    const db = seed(makeTaskModel({ status: "operational" }), [makeItem()],
      [makeEvidenceModel()], [liveSession(), liveSession({ id: "s2", studentId: "stu2" })]);

    const res = await request(makeApp())
      .post("/api/taskModels/tm1/force-deactivate")
      .send({ reason: "calibration error" });

    expect(res.status).toBe(200);
    expect(res.body.closedSessions).toHaveLength(2);
    expect(db.taskModels[0].status).toBe("suspended");
    expect(db.taskModels[0].deactivation).toBeUndefined();
  });

  it("locks responses rather than deleting them", async () => {
    // The student did the work; whatever evidence was collected before the
    // closure stays scorable and still reports.
    const db = seed(makeTaskModel({ status: "operational" }), [makeItem()],
      [makeEvidenceModel()], [liveSession()]);

    await request(makeApp()).post("/api/taskModels/tm1/force-deactivate").send({});

    const session = db.sessions[0];
    expect(session.status).toBe("submitted");
    expect(session.autoFinished).toBe(true);
    expect(session.responses).toHaveLength(1);
    expect(session.responses[0].locked).toBe(true);
  });

  it("refuses to force-deactivate anything that is not operational", async () => {
    seed(makeTaskModel({ status: "confirmed" }));

    const res = await request(makeApp())
      .post("/api/taskModels/tm1/force-deactivate")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Only an operational/);
  });

  it("is not a way past the other lifecycle rules", async () => {
    const db = seed(
      makeTaskModel({ status: "operational", evidenceModelIds: [], primaryEvidenceModelId: "" }),
      [makeItem()], [makeEvidenceModel()], [liveSession()]
    );

    const res = await request(makeApp())
      .post("/api/taskModels/tm1/force-deactivate")
      .send({});

    expect(res.status).toBe(400);
    // A refused call must not leave the sessions closed behind it.
    expect(db.sessions[0].isCompleted).toBeFalsy();
  });

  it("reports dependants without changing anything", async () => {
    seed(makeTaskModel({ status: "operational" }), [makeItem()], [makeEvidenceModel()],
      [liveSession(), liveSession({ id: "s2", status: "completed", isCompleted: true })]);

    const res = await request(makeApp()).get("/api/taskModels/tm1/dependents");

    expect(res.status).toBe(200);
    expect(res.body.sessions).toMatchObject({ total: 2, live: 1 });
    expect(res.body.sessions.liveSessions[0].id).toBe("s1");
  });
});
