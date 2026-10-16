// server/routes/__tests__/itemLifecycle.test.js
//
// Covers the Item Bank routes.
//
// This exists because of a chain of dead ends that made the Item Bank
// unusable end to end:
//
//   * POST / validated STRICTLY, so every create failed on
//     "Explicit evidenceActivationMap is required" -- a rule about
//     scoring, applied to a brand-new empty draft. No item could be
//     created by any payload.
//   * PUT /:id used `db.items?.findIndex(...)`; `undefined === -1` is
//     false, so on a database with no items array the guard passed and
//     `db.items[undefined]` threw a 500.
//   * PUT /:id returned 409 for ANY request against a locked record, and
//     confirmation locks -- so a confirmed item could not be promoted
//     through the route the client calls.
//   * schema.js's lifecycle guard compared indices in a flat status list
//     and rejected reviewed -> draft, confirmed -> archived,
//     operational -> archived and suspended -> operational, all four of
//     which lifecycleMatrix declares.
//   * simulateItemEvidence() required `taskModel.status === "confirmed"`
//     literally, so activating a Task Model made every item bound to it
//     unconfirmable.
//   * /calibrate required confirmed and then, unreachably, refused
//     operational and suspended -- so a live item could never be
//     calibrated from the data that calibration needs.
//   * clone required `status === "confirmed"`, so an operational item
//     was neither editable nor cloneable.
//
// loadDB/saveDB and the auth middleware are mocked: this exercises the
// router's own logic, not persistence or JWTs.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

let currentRole = "admin";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: "u1", role: currentRole };
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
import itemsRouter from "../itemsRoutes.js";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/items", itemsRouter);
  return app;
}

const observable = {
  id: "o1",
  statement: "Selects the correct equation",
  type: "selected_response",
  evidenceRule: { direction: "supports", strengthLevel: 4 },
};

function makeEvidenceModel(overrides = {}) {
  return {
    id: "em1",
    name: "EM One",
    status: "operational",
    locked: true,
    versionNumber: 1,
    competencyId: "c1",
    observables: [observable],
    statisticalModels: [{ id: "sm1", type: "irt", subtype: "2pl", active: true }],
    ...overrides,
  };
}

function makeTaskModel(overrides = {}) {
  return {
    id: "tm1",
    name: "TM One",
    status: "operational",
    locked: true,
    versionNumber: 1,
    evidenceModelIds: ["em1"],
    primaryEvidenceModelId: "em1",
    expectedObservations: [
      { observationId: "o1", evidenceModelId: "em1", required: true, weight: 1 },
    ],
    blueprintConstraints: {},
    ...overrides,
  };
}

function makeItem(overrides = {}) {
  return {
    id: "it1",
    taskModelId: "tm1",
    taskModelVersion: 1,
    observationId: "o1",
    evidenceModelId: "em1",
    evidenceModelVersion: 1,
    stimulus: { layout: "single", blocks: [{ id: "b1", type: "text", text: "…" }] },
    interaction: { type: "mcq", responseComponents: [{ id: "r1", label: "Option A", value: "A", isCorrect: true }], config: {} },
    scoring: {
      method: "dichotomous",
      maxScore: 1,
      evidenceActivationMap: [
        {
          responsePattern: { equalsCorrect: true },
          score: 1,
          activatesObservable: true,
          rationale: "The correct selection is the observable.",
        },
      ],
    },
    learningDomain: "cognitive",
    cognitiveDemand: { bloomLevel: "apply" },
    metadata: { subject: "Maths" },
    psychometrics: {
      statisticalModelType: "irt",
      calibrationStatus: "pilot",
      irtParams: { a: 1, b: 0 },
    },
    equivalenceGroupId: "grp1",
    exposureControl: {
      usageCount: 0,
      maxUsageBeforeRetire: 100,
      reactivationCount: 0,
      maxReactivations: 0,
    },
    status: "draft",
    locked: false,
    versionNumber: 1,
    parentItemId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeDB(overrides = {}) {
  return {
    taskModels: [makeTaskModel()],
    evidenceModels: [makeEvidenceModel()],
    items: [],
    sessions: [],
    tasks: [],
    ...overrides,
  };
}

beforeEach(() => {
  currentRole = "admin";
  vi.clearAllMocks();
});

/* ------------------------------------------------------------ CREATE */

describe("POST /api/items", () => {
  it("creates a bare draft with nothing but a taskModelId", () => {
    const db = makeDB();
    loadDB.mockReturnValue(db);

    return request(makeApp())
      .post("/api/items")
      .send({ taskModelId: "tm1" })
      .expect(201)
      .then((res) => {
        expect(res.body.status).toBe("draft");
        expect(res.body.taskModelVersion).toBe(1);
        expect(saveDB).toHaveBeenCalled();
      });
  });

  it("derives evidenceModelId and version rather than trusting the payload", () => {
    const db = makeDB();
    loadDB.mockReturnValue(db);

    return request(makeApp())
      .post("/api/items")
      .send({
        taskModelId: "tm1",
        observationId: "o1",
        evidenceModelId: "SOMETHING_ELSE",
        evidenceModelVersion: 99,
      })
      .expect(201)
      .then((res) => {
        expect(res.body.evidenceModelId).toBe("em1");
        expect(res.body.evidenceModelVersion).toBe(1);
      });
  });

  it("keeps equivalenceGroupId, which the previous implementation dropped", () => {
    loadDB.mockReturnValue(makeDB());

    return request(makeApp())
      .post("/api/items")
      .send({ taskModelId: "tm1", equivalenceGroupId: "grp9" })
      .expect(201)
      .then((res) => expect(res.body.equivalenceGroupId).toBe("grp9"));
  });

  it("accepts an OPERATIONAL task model, not only a confirmed one", () => {
    loadDB.mockReturnValue(makeDB({ taskModels: [makeTaskModel({ status: "operational" })] }));

    return request(makeApp())
      .post("/api/items")
      .send({ taskModelId: "tm1" })
      .expect(201);
  });

  it("refuses a draft task model", () => {
    loadDB.mockReturnValue(
      makeDB({ taskModels: [makeTaskModel({ status: "draft", locked: false })] })
    );

    return request(makeApp())
      .post("/api/items")
      .send({ taskModelId: "tm1" })
      .expect(400);
  });

  it("refuses an undeclared observation", () => {
    loadDB.mockReturnValue(makeDB());

    return request(makeApp())
      .post("/api/items")
      .send({ taskModelId: "tm1", observationId: "nope" })
      .expect(400);
  });

  it("is closed to non-authoring roles", () => {
    currentRole = "student";
    loadDB.mockReturnValue(makeDB());

    return request(makeApp())
      .post("/api/items")
      .send({ taskModelId: "tm1" })
      .expect(403);
  });
});

/* ------------------------------------------------------------ UPDATE */

describe("PUT /api/items/:id", () => {
  it("404s rather than 500s on a database with no items array", () => {
    loadDB.mockReturnValue({ taskModels: [makeTaskModel()], evidenceModels: [makeEvidenceModel()] });

    return request(makeApp()).put("/api/items/missing").send({}).expect(404);
  });

  it("saves a half-built draft without demanding an activation map", () => {
    const db = makeDB({
      items: [
        makeItem({
          scoring: { method: "", maxScore: 1, evidenceActivationMap: [] },
          interaction: { type: "", responseComponents: [], config: {} },
          stimulus: { layout: "single", blocks: [] },
        }),
      ],
    });
    loadDB.mockReturnValue(db);

    return request(makeApp())
      .put("/api/items/it1")
      .send({ metadata: { subject: "Physics" } })
      .expect(200)
      .then((res) => expect(res.body.metadata.subject).toBe("Physics"));
  });

  it("discards derived and lifecycle fields smuggled into the body", () => {
    const db = makeDB({ items: [makeItem()] });
    loadDB.mockReturnValue(db);

    return request(makeApp())
      .put("/api/items/it1")
      .send({
        evidenceModelId: "hacked",
        evidenceModelVersion: 42,
        status: "confirmed",
        locked: true,
        versionNumber: 99,
      })
      .expect(200)
      .then((res) => {
        expect(res.body.evidenceModelId).toBe("em1");
        expect(res.body.status).toBe("draft");
        expect(res.body.locked).toBe(false);
        expect(res.body.versionNumber).toBe(1);
      });
  });

  it("lets a LOCKED record take a status-only transition", () => {
    const db = makeDB({
      items: [makeItem({ status: "confirmed", locked: true })],
    });
    loadDB.mockReturnValue(db);

    return request(makeApp())
      .put("/api/items/it1")
      .send({ status: "operational", metadata: { subject: "SMUGGLED" } })
      .expect(200)
      .then((res) => {
        expect(res.body.status).toBe("operational");
        // Immutability holds by construction: everything but status is
        // discarded for a locked record.
        expect(res.body.metadata.subject).toBe("Maths");
      });
  });

  it("still refuses a body-only edit of a locked record", () => {
    loadDB.mockReturnValue(
      makeDB({ items: [makeItem({ status: "confirmed", locked: true })] })
    );

    return request(makeApp())
      .put("/api/items/it1")
      .send({ metadata: { subject: "Physics" } })
      .expect(409);
  });
});

/* --------------------------------------------------------- LIFECYCLE */

describe("PATCH /api/items/:id/lifecycle", () => {
  const patch = (nextStatus, body = {}) =>
    request(makeApp())
      .patch("/api/items/it1/lifecycle")
      .send({ nextStatus, ...body });

  it("refuses to confirm a multiple-choice item with no correct option, a blank option, or a zero-score activating rule", () => {
    const bad = makeItem({
      status: "reviewed",
      interaction: {
        type: "mcq",
        responseComponents: [
          { id: "a", label: "Cell membrane", value: "Nucleus", isCorrect: false },
          { id: "b", label: " ", value: "", isCorrect: false },
        ],
        config: {},
      },
      scoring: {
        method: "dichotomous",
        maxScore: 1,
        evidenceActivationMap: [
          {
            responsePattern: { equalsCorrect: true },
            score: 0,
            activatesObservable: true,
            rationale: "The correct selection is the observable.",
          },
        ],
      },
    });
    loadDB.mockReturnValue(makeDB({ items: [bad] }));

    return patch("confirmed")
      .expect(400)
      .then((res) => {
        const text = JSON.stringify(res.body);
        expect(text).toMatch(/mark one option correct/);
        expect(text).toMatch(/blank label/);
        expect(text).toMatch(/score greater than 0/);
        expect(bad.status).toBe("reviewed");
        expect(bad.locked).toBe(false);
      });
  });

  it("confirms a complete reviewed item and locks it", () => {
    loadDB.mockReturnValue(makeDB({ items: [makeItem({ status: "reviewed" })] }));

    return patch("confirmed")
      .expect(200)
      .then((res) => {
        expect(res.body.status).toBe("confirmed");
        expect(res.body.locked).toBe(true);
      });
  });

  it("confirms against an OPERATIONAL task model", () => {
    loadDB.mockReturnValue(
      makeDB({
        taskModels: [makeTaskModel({ status: "operational" })],
        items: [makeItem({ status: "reviewed" })],
      })
    );

    return patch("confirmed").expect(200);
  });

  it("refuses to confirm an item whose interaction cannot elicit the observable", () => {
    loadDB.mockReturnValue(
      makeDB({
        items: [
          makeItem({
            status: "reviewed",
            interaction: { type: "numeric", responseComponents: [{ id: "r" }] },
          }),
        ],
      })
    );

    return patch("confirmed")
      .expect(400)
      .then((res) =>
        expect(JSON.stringify(res.body)).toMatch(/cannot elicit a 'selected_response'/)
      );
  });

  it("allows reviewer rejection (reviewed -> draft)", () => {
    loadDB.mockReturnValue(makeDB({ items: [makeItem({ status: "reviewed" })] }));

    return patch("draft")
      .expect(200)
      .then((res) => {
        expect(res.body.status).toBe("draft");
        expect(res.body.locked).toBe(false);
      });
  });

  it("allows confirmed -> archived without walking every intermediate state", () => {
    loadDB.mockReturnValue(
      makeDB({ items: [makeItem({ status: "confirmed", locked: true })] })
    );

    return patch("archived")
      .expect(200)
      .then((res) => expect(res.body.status).toBe("archived"));
  });

  it("allows suspended -> operational and counts the reactivation", () => {
    loadDB.mockReturnValue(
      makeDB({ items: [makeItem({ status: "suspended", locked: true })] })
    );

    return patch("operational")
      .expect(200)
      .then((res) => {
        expect(res.body.status).toBe("operational");
        expect(res.body.exposureControl.reactivationCount).toBe(1);
      });
  });

  it("enforces the reactivation ceiling", () => {
    loadDB.mockReturnValue(
      makeDB({
        items: [
          makeItem({
            status: "suspended",
            locked: true,
            exposureControl: {
              usageCount: 0,
              maxUsageBeforeRetire: 100,
              reactivationCount: 2,
              maxReactivations: 2,
            },
          }),
        ],
      })
    );

    return patch("operational")
      .expect(400)
      .then((res) => expect(JSON.stringify(res.body)).toMatch(/ceiling of 2/));
  });

  it("refuses activation while the Evidence Model is not live", () => {
    loadDB.mockReturnValue(
      makeDB({
        evidenceModels: [makeEvidenceModel({ status: "confirmed" })],
        items: [makeItem({ status: "confirmed", locked: true })],
      })
    );

    return patch("operational")
      .expect(400)
      .then((res) => expect(JSON.stringify(res.body)).toMatch(/not operational/));
  });

  it("refuses activation without an equivalence group", () => {
    loadDB.mockReturnValue(
      makeDB({
        items: [makeItem({ status: "confirmed", locked: true, equivalenceGroupId: "" })],
      })
    );

    return patch("operational")
      .expect(400)
      .then((res) => expect(JSON.stringify(res.body)).toMatch(/equivalenceGroupId/));
  });

  it("refuses an already-exhausted item rather than silently suspending it", () => {
    loadDB.mockReturnValue(
      makeDB({
        items: [
          makeItem({
            status: "confirmed",
            locked: true,
            exposureControl: { usageCount: 100, maxUsageBeforeRetire: 100 },
          }),
        ],
      })
    );

    return patch("operational")
      .expect(400)
      .then((res) => expect(JSON.stringify(res.body)).toMatch(/ceiling of 100/));
  });

  it("blocks suspension while a live session depends on the item", () => {
    loadDB.mockReturnValue(
      makeDB({
        items: [makeItem({ status: "operational", locked: true })],
        tasks: [{ id: "t1", taskModelId: "tm1" }],
        sessions: [{ id: "s1", taskIds: ["t1"], status: "in_progress", responses: [] }],
      })
    );

    return patch("suspended")
      .expect(400)
      .then((res) => expect(JSON.stringify(res.body)).toMatch(/live session/i));
  });

  it("lets an admin force past the live-session gate", () => {
    loadDB.mockReturnValue(
      makeDB({
        items: [makeItem({ status: "operational", locked: true })],
        tasks: [{ id: "t1", taskModelId: "tm1" }],
        sessions: [{ id: "s1", taskIds: ["t1"], status: "in_progress", responses: [] }],
      })
    );

    return patch("suspended", { force: true }).expect(200);
  });

  it("does not let a district user force", () => {
    currentRole = "district";
    loadDB.mockReturnValue(
      makeDB({ items: [makeItem({ status: "operational", locked: true })] })
    );

    return patch("suspended", { force: true }).expect(403);
  });

  it("rejects a transition the matrix does not declare", () => {
    loadDB.mockReturnValue(makeDB({ items: [makeItem({ status: "draft" })] }));
    return patch("operational").expect(400);
  });
});

/* ------------------------------------------------------------- CLONE */

describe("POST /api/items/:id/clone", () => {
  it("clones an OPERATIONAL item, not only a confirmed one", () => {
    const db = makeDB({
      items: [
        makeItem({
          status: "operational",
          locked: true,
          exposureControl: {
            usageCount: 97,
            maxUsageBeforeRetire: 100,
            reactivationCount: 1,
            maxReactivations: 3,
          },
          psychometrics: {
            statisticalModelType: "irt",
            calibrationStatus: "calibrated",
            irtParams: { a: 1.4, b: 0.9 },
          },
        }),
      ],
    });
    loadDB.mockReturnValue(db);

    return request(makeApp())
      .post("/api/items/it1/clone")
      .expect(201)
      .then((res) => {
        expect(res.body.status).toBe("draft");
        expect(res.body.parentItemId).toBe("it1");
        expect(res.body.versionNumber).toBe(2);
        // Exposure resets: the clone exists BECAUSE the original was used
        // up, so inheriting the count would retire it on activation.
        expect(res.body.exposureControl.usageCount).toBe(0);
        expect(res.body.exposureControl.maxUsageBeforeRetire).toBe(100);
        // Calibration belongs to the original's responses.
        expect(res.body.psychometrics.calibrationStatus).toBe("uncalibrated");
        expect(res.body.psychometrics.irtParams).toEqual({});
      });
  });

  it("refuses to clone an editable item", () => {
    loadDB.mockReturnValue(makeDB({ items: [makeItem()] }));
    return request(makeApp()).post("/api/items/it1/clone").expect(400);
  });

  it("refuses to clone an archived item", () => {
    loadDB.mockReturnValue(
      makeDB({ items: [makeItem({ status: "archived", locked: true })] })
    );
    return request(makeApp()).post("/api/items/it1/clone").expect(400);
  });
});

/* --------------------------------------------------------- CALIBRATE */

describe("POST /api/items/:id/calibrate", () => {
  it("calibrates an OPERATIONAL item -- the only state with response data", () => {
    loadDB.mockReturnValue(
      makeDB({ items: [makeItem({ status: "operational", locked: true })] })
    );

    return request(makeApp())
      .post("/api/items/it1/calibrate")
      .send({ a: 1.2, b: -0.4, c: 0.15, sampleSize: 900, method: "mmle" })
      .expect(200)
      .then((res) => {
        expect(res.body.calibrationStatus).toBe("calibrated");
        expect(res.body.irtParams.b).toBe(-0.4);
      });
  });

  it("records a zero-sample estimate as pilot, not calibrated", () => {
    loadDB.mockReturnValue(
      makeDB({ items: [makeItem({ status: "confirmed", locked: true })] })
    );

    return request(makeApp())
      .post("/api/items/it1/calibrate")
      .send({ a: 1, b: 0 })
      .expect(200)
      .then((res) => expect(res.body.calibrationStatus).toBe("pilot"));
  });

  it("refuses to write IRT parameters onto a non-parametric model", () => {
    loadDB.mockReturnValue(
      makeDB({
        evidenceModels: [
          makeEvidenceModel({ statisticalModels: [{ id: "sm", type: "ctt", active: true }] }),
        ],
        items: [
          makeItem({
            status: "confirmed",
            locked: true,
            scoring: {
              method: "dichotomous",
              maxScore: 1,
              evidenceActivationMap: [
                {
                  responsePattern: { equalsCorrect: true },
                  score: 1,
                  activatesObservable: true,
                  rationale: "…",
                },
              ],
            },
            psychometrics: { statisticalModelType: "ctt", irtParams: {} },
          }),
        ],
      })
    );

    return request(makeApp())
      .post("/api/items/it1/calibrate")
      .send({ a: 1, b: 0 })
      .expect(400)
      .then((res) => expect(JSON.stringify(res.body)).toMatch(/does not take item parameters/));
  });

  it("refuses a draft", () => {
    loadDB.mockReturnValue(makeDB({ items: [makeItem({ status: "draft" })] }));
    return request(makeApp())
      .post("/api/items/it1/calibrate")
      .send({ a: 1, b: 0 })
      .expect(400);
  });
});

/* ---------------------------------------------------------- EXPOSURE */

describe("POST /api/items/:id/record-usage", () => {
  it("increments the counter that nothing has ever incremented", () => {
    loadDB.mockReturnValue(
      makeDB({ items: [makeItem({ status: "operational", locked: true })] })
    );

    return request(makeApp())
      .post("/api/items/it1/record-usage")
      .send({})
      .expect(200)
      .then((res) => {
        expect(res.body.usageCount).toBe(1);
        expect(res.body.autoSuspended).toBe(false);
      });
  });

  it("auto-suspends on exhaustion", () => {
    loadDB.mockReturnValue(
      makeDB({
        items: [
          makeItem({
            status: "operational",
            locked: true,
            exposureControl: { usageCount: 99, maxUsageBeforeRetire: 100 },
          }),
        ],
      })
    );

    return request(makeApp())
      .post("/api/items/it1/record-usage")
      .send({})
      .expect(200)
      .then((res) => {
        expect(res.body.autoSuspended).toBe(true);
        expect(res.body.status).toBe("suspended");
      });
  });
});

/* ------------------------------------------------------------ DELETE */

describe("DELETE /api/items/:id", () => {
  it("deletes a draft and cleans up Task Model references", () => {
    const db = makeDB({
      taskModels: [
        makeTaskModel({
          itemMappings: [{ itemId: "it1", observationId: "o1" }],
          selectedItemIds: ["it1"],
        }),
      ],
      items: [makeItem()],
    });
    loadDB.mockReturnValue(db);

    return request(makeApp())
      .delete("/api/items/it1")
      .expect(204)
      .then(() => {
        expect(db.items).toHaveLength(0);
        expect(db.taskModels[0].itemMappings).toHaveLength(0);
        expect(db.taskModels[0].selectedItemIds).toHaveLength(0);
      });
  });

  it("refuses to delete a locked item", () => {
    loadDB.mockReturnValue(
      makeDB({ items: [makeItem({ status: "confirmed", locked: true })] })
    );
    return request(makeApp()).delete("/api/items/it1").expect(409);
  });

  it("refuses to orphan recorded responses", () => {
    loadDB.mockReturnValue(
      makeDB({
        items: [makeItem()],
        sessions: [{ id: "s1", taskIds: [], responses: [{ itemId: "it1" }] }],
      })
    );

    return request(makeApp())
      .delete("/api/items/it1")
      .expect(409)
      .then((res) => expect(JSON.stringify(res.body)).toMatch(/orphan/));
  });
});

/* ------------------------------------------------------------ FILTER */

describe("GET /api/items", () => {
  it("filters server-side by status, exposure and free text", async () => {
    const db = makeDB({
      items: [
        makeItem({ id: "a", status: "operational", metadata: { subject: "Maths" } }),
        makeItem({
          id: "b",
          status: "operational",
          exposureControl: { usageCount: 95, maxUsageBeforeRetire: 100 },
          metadata: { subject: "Physics" },
        }),
        makeItem({ id: "c", status: "draft" }),
      ],
    });
    loadDB.mockReturnValue(db);
    const app = makeApp();

    const byStatus = await request(app).get("/api/items?status=operational").expect(200);
    expect(byStatus.body.map((i) => i.id).sort()).toEqual(["a", "b"]);

    const byExposure = await request(app).get("/api/items?exposure=nearing").expect(200);
    expect(byExposure.body.map((i) => i.id)).toEqual(["b"]);

    const byText = await request(app).get("/api/items?q=physics").expect(200);
    expect(byText.body.map((i) => i.id)).toEqual(["b"]);
  });
});

/* --------------------------------------------------------- SIMULATE */

describe("GET /api/items/:id/simulate", () => {
  it("agrees with what the confirm transition would say", async () => {
    const broken = makeItem({
      status: "draft",
      scoring: { method: "dichotomous", maxScore: 1, evidenceActivationMap: [] },
    });
    loadDB.mockReturnValue(makeDB({ items: [broken] }));

    const sim = await request(makeApp()).get("/api/items/it1/simulate").expect(200);
    expect(sim.body.valid).toBe(false);
    expect(sim.body.errors.join(" ")).toMatch(/activation rule/i);
  });

  it("passes a complete item", async () => {
    loadDB.mockReturnValue(makeDB({ items: [makeItem({ status: "reviewed" })] }));

    const sim = await request(makeApp()).get("/api/items/it1/simulate").expect(200);
    expect(sim.body).toEqual({ valid: true, errors: [], checkedAs: "confirmed" });
  });
});
