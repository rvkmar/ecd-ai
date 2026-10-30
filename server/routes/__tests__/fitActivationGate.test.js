import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: "u1", username: "ada", role: "admin" };
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

const passingIrtFit = {
  global: { RMSEA: 0.04, SRMSR: 0.03 },
  itemFit: {
    a: { "p.S_X2": 0.2 },
    b: { "p.S_X2": 0.4 },
  },
  personFit: { proportionMisfit: 0.02, cutoff: -2 },
  localDependence: { maxAbsQ3: 0.12 },
};

const failingIrtFit = {
  global: { RMSEA: 0.09, SRMSR: 0.08 },
  itemFit: {
    a: { "p.S_X2": 0.01 },
    b: { "p.S_X2": 0.01 },
  },
  personFit: { proportionMisfit: 0.2, cutoff: -2 },
  localDependence: { maxAbsQ3: 0.4 },
};

function parameterSet(id, fitStatistics) {
  return {
    parameterSetId: id,
    parameters: { o1: { a: 1, b: 0 } },
    packageVersion: "mirt 1.47",
    converged: true,
    sampleSize: 200,
    calibratedAt: "2026-06-01T00:00:00.000Z",
    ...(fitStatistics === undefined ? {} : { fitStatistics }),
  };
}

function makeModel() {
  return {
    id: "em1",
    name: "Numerical Reasoning",
    competencyId: "c1",
    competencyModelVersion: 1,
    versionNumber: 1,
    status: "confirmed",
    locked: true,
    statisticalModels: [
      {
        id: "sm1",
        type: "irt",
        subtype: "2pl",
        active: true,
        parameterSets: [parameterSet("ps1")],
        activeParameterSetId: "ps1",
      },
    ],
  };
}

function makeDB(model) {
  return {
    evidenceModels: [model],
    competencies: [{ id: "c1", modelId: "cm1", variableType: "continuous" }],
    competencyModels: [{ id: "cm1", versionNumber: 1, status: "confirmed" }],
  };
}

async function buildApp(model) {
  vi.resetModules();
  const db = makeDB(model);
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

describe("POST /api/evidenceModels/:id/activate-parameter-set fit gate", () => {
  it("activates a set whose fit is inside the default thresholds", async () => {
    const model = makeModel();
    model.statisticalModels[0].parameterSets.push(parameterSet("ps2", passingIrtFit));
    const { app, db, saveDB } = await buildApp(model);

    const res = await request(app)
      .post("/api/evidenceModels/em1/activate-parameter-set")
      .send({ statisticalModelId: "sm1", parameterSetId: "ps2" });

    expect(res.status).toBe(200);
    expect(res.body.fitGate.status).toBe("pass");
    const sm = db.evidenceModels[0].statisticalModels[0];
    expect(sm.activeParameterSetId).toBe("ps2");
    expect(sm.parameterSets.find((ps) => ps.parameterSetId === "ps2").fitGate.status).toBe("pass");
    expect(saveDB).toHaveBeenCalled();
  });

  it("refuses activation and lists the checks that failed", async () => {
    const model = makeModel();
    model.statisticalModels[0].parameterSets.push(parameterSet("ps2", failingIrtFit));
    const { app, db, saveDB } = await buildApp(model);

    const res = await request(app)
      .post("/api/evidenceModels/em1/activate-parameter-set")
      .send({ statisticalModelId: "sm1", parameterSetId: "ps2" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/fit thresholds were not met/);
    expect(res.body.details.join(" ")).toMatch(/RMSEA/);
    expect(res.body.details.join(" ")).toMatch(/SRMSR/);
    expect(res.body.fitGate.failedChecks.map((check) => check.id)).toEqual(
      expect.arrayContaining(["irt.rmsea", "irt.srmsr", "irt.itemFit"])
    );
    expect(db.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBe("ps1");
    expect(saveDB).not.toHaveBeenCalled();
  });

  it("activates on an explicit override and records the reason, user, and failing checks", async () => {
    const model = makeModel();
    model.statisticalModels[0].parameterSets.push(parameterSet("ps2", failingIrtFit));
    const { app, db } = await buildApp(model);

    const res = await request(app)
      .post("/api/evidenceModels/em1/activate-parameter-set")
      .send({
        statisticalModelId: "sm1",
        parameterSetId: "ps2",
        fitOverride: { reason: "Pilot sample accepted by the committee" },
      });

    expect(res.status).toBe(200);
    const chosen = db.evidenceModels[0].statisticalModels[0].parameterSets.find(
      (ps) => ps.parameterSetId === "ps2"
    );
    expect(chosen.status).toBe("active");
    expect(chosen.fitGate.status).toBe("override");
    expect(chosen.fitGate.override.reason).toBe("Pilot sample accepted by the committee");
    expect(chosen.fitGate.override.by).toBe("ada");
    expect(chosen.fitGate.override.failedChecks.map((check) => check.id)).toContain("irt.rmsea");
    expect(chosen.activatedBy).toBe("ada");
  });

  it("rejects an override that has no reason", async () => {
    const model = makeModel();
    model.statisticalModels[0].parameterSets.push(parameterSet("ps2", failingIrtFit));
    const { app, db, saveDB } = await buildApp(model);

    const res = await request(app)
      .post("/api/evidenceModels/em1/activate-parameter-set")
      .send({
        statisticalModelId: "sm1",
        parameterSetId: "ps2",
        fitOverride: { reason: "   " },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-empty reason/);
    expect(res.body.details.length).toBeGreaterThan(0);
    expect(db.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBe("ps1");
    expect(saveDB).not.toHaveBeenCalled();
  });

  it("leaves an already-active set in place when its fit would now fail", async () => {
    const model = makeModel();
    model.statisticalModels[0].parameterSets[0].fitStatistics = failingIrtFit;
    const { app, db, saveDB } = await buildApp(model);

    const res = await request(app)
      .post("/api/evidenceModels/em1/activate-parameter-set")
      .send({ statisticalModelId: "sm1", parameterSetId: "ps1" });

    expect(res.status).toBe(200);
    expect(res.body.fitGate.status).toBe("grandfathered");
    expect(res.body.message).toMatch(/already active/);
    const stored = db.evidenceModels[0].statisticalModels[0].parameterSets[0];
    expect(stored.fitGate).toBeUndefined();
    expect(db.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBe("ps1");
    expect(saveDB).not.toHaveBeenCalled();
  });

  it("activates a set that has no fit statistics and records that the gate was not applied", async () => {
    const model = makeModel();
    model.statisticalModels[0].parameterSets.push(parameterSet("ps2"));
    const { app, db } = await buildApp(model);

    const res = await request(app)
      .post("/api/evidenceModels/em1/activate-parameter-set")
      .send({ statisticalModelId: "sm1", parameterSetId: "ps2" });

    expect(res.status).toBe(200);
    expect(res.body.fitGate.status).toBe("not_evaluated");
    expect(db.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBe("ps2");
    const chosen = db.evidenceModels[0].statisticalModels[0].parameterSets.find(
      (ps) => ps.parameterSetId === "ps2"
    );
    expect(chosen.fitGate.status).toBe("not_evaluated");
    expect(chosen.fitGate.failedChecks).toEqual([]);
  });
});

describe("POST /api/evidenceModels/:id/recalibrate fit gate", () => {
  it("does not store a recalibration whose fit fails", async () => {
    const { app, db } = await buildApp(makeModel());

    const res = await request(app).post("/api/evidenceModels/em1/recalibrate").send({
      statisticalModelId: "sm1",
      parameters: { o1: { a: 1.1, b: 0.2 } },
      calibrationMethod: "mirt 2PL",
      sampleSize: 200,
      packageVersion: "mirt 1.47",
      converged: true,
      fitStatistics: failingIrtFit,
    });

    expect(res.status).toBe(400);
    expect(res.body.fitGate.failedChecks.map((check) => check.id)).toContain("irt.rmsea");
    expect(db.evidenceModels[0].statisticalModels[0].parameterSets).toHaveLength(1);
    expect(db.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBe("ps1");
  });

  it("stores a passing recalibration with the gate result", async () => {
    const { app, db } = await buildApp(makeModel());

    const res = await request(app).post("/api/evidenceModels/em1/recalibrate").send({
      statisticalModelId: "sm1",
      parameters: { o1: { a: 1.1, b: 0.2 } },
      calibrationMethod: "mirt 2PL",
      sampleSize: 200,
      packageVersion: "mirt 1.47",
      converged: true,
      fitStatistics: passingIrtFit,
      fitOverride: { reason: "not needed" },
    });

    expect(res.status).toBe(200);
    const added = db.evidenceModels[0].statisticalModels[0].parameterSets.at(-1);
    expect(added.fitGate.status).toBe("pass");
    expect(added.fitGate.override).toBeNull();
  });

  it("does not activate a predicted recalibration when fit statistics are absent", async () => {
    const { app, db, saveDB } = await buildApp(makeModel());

    const res = await request(app).post("/api/evidenceModels/em1/recalibrate").send({
      statisticalModelId: "sm1",
      parameters: { o1: { a: 1, b: 0.4 } },
      calibrationMethod: "lltm-predicted",
      parameterStatus: "predicted",
      origin: "predicted",
      sampleSize: 400,
      packageVersion: "eRm 1.0.4",
      converged: true,
      fitOverride: { reason: "The covariate model looks fine" },
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Predicted parameters cannot be activated/);
    expect(res.body.fitGate.status).toBe("predicted");
    expect(res.body.fitGate.status).not.toBe("not_evaluated");
    expect(db.evidenceModels[0].statisticalModels[0].parameterSets).toHaveLength(1);
    expect(db.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBe("ps1");
    expect(saveDB).not.toHaveBeenCalled();
  });
});

describe("predicted parameter sets are not eligible for activation", () => {
  it("refuses a converged predicted set that would otherwise pass the fit gate", async () => {
    const model = makeModel();
    model.statisticalModels[0].parameterSets.push({
      ...parameterSet("ps-pred", passingIrtFit),
      parameterStatus: "predicted",
      origin: "predicted",
      sourceModel: "eRm::LLTM",
    });
    const { app, db, saveDB } = await buildApp(model);

    const res = await request(app)
      .post("/api/evidenceModels/em1/activate-parameter-set")
      .send({
        statisticalModelId: "sm1",
        parameterSetId: "ps-pred",
        fitOverride: { reason: "Ship the prediction" },
      });

    expect(res.status).toBe(400);
    expect(res.body.fitGate.status).toBe("predicted");
    expect(db.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBe("ps1");
    expect(saveDB).not.toHaveBeenCalled();
  });
});
