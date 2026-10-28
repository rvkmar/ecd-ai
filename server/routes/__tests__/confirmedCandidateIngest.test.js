// A confirmed evidence model with no active parameter set can take its
// first calibration. Ingest stores a candidate. The activate route is
// what moves the pointer. Confirm-time audits that are not about the
// parameter set (decision rule, assembly floors) do not block that write.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { ingestCalibrationJob } from "../../r/calibrationIngest.js";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: "u1", username: "admin1", role: "admin" };
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

function convergedJob() {
  return {
    id: "job-dina-1",
    kind: "dina-parameters",
    status: "succeeded",
    evidenceModelId: "em-plant",
    statisticalModelId: "sm-plant-dina",
    requestedBy: "admin1",
    response: {
      contractVersion: "1.0",
      jobId: "job-dina-1",
      converged: true,
      packageVersion: "GDINA 2.9.4",
      sampleSize: 300,
      calibratedAt: "2026-10-28T08:00:00.000Z",
      parameters: { "it-leaf": { slip: 0.1, guess: 0.2 } },
    },
  };
}

function makeDb() {
  return {
    evidenceModels: [{
      id: "em-plant",
      name: "Plant parts",
      status: "confirmed",
      locked: true,
      competencyId: "c-plant",
      versionNumber: 1,
      observables: [{ id: "obs-plant-name", statement: "Names the part." }],
      statisticalModels: [{
        id: "sm-plant-dina",
        type: "dina",
        active: true,
        structureConfig: { qMatrixId: "qm-plant" },
        parameterSets: [],
      }],
    }],
    competencies: [{ id: "c-plant", name: "Plant parts", modelId: "cm-plant" }],
    assemblyModels: [{
      id: "am-plant",
      name: "Plant part naming assembly",
      targetsBySMV: [{
        smvId: "c-plant",
        requiredClassificationAccuracy: 0.8,
      }],
    }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("confirmed model with no active parameter set", () => {
  it("ingests a candidate and then activates it", async () => {
    const db = makeDb();
    const { loadDB, saveDB } = await import("../../../src/utils/db-server.js");
    loadDB.mockReturnValue(db);
    saveDB.mockImplementation(() => {});

    const ingest = ingestCalibrationJob(convergedJob(), db, { parameterSetId: "ps-candidate" });
    expect(ingest.ok).toBe(true);
    expect(ingest.parameterSet.status).toBe("candidate");
    expect(ingest.parameterSet.parameterSetId).toBe("ps-candidate");

    const sm = db.evidenceModels[0].statisticalModels[0];
    expect(sm.activeParameterSetId).toBeUndefined();
    expect(sm.parameterSets).toHaveLength(1);

    const { default: router } = await import("../evidenceModels.js");
    const app = express();
    app.use(express.json());
    app.use("/api/evidenceModels", router);

    const activated = await request(app)
      .post("/api/evidenceModels/em-plant/activate-parameter-set")
      .send({ statisticalModelId: "sm-plant-dina", parameterSetId: "ps-candidate" });

    expect(activated.status).toBe(200);
    expect(sm.activeParameterSetId).toBe("ps-candidate");
    expect(sm.parameterSets[0].status).toBe("active");
    expect(sm.parameterSets[0].activatedBy).toBe("admin1");
    expect(saveDB).toHaveBeenCalled();
  });

  it("still refuses a parameter set that did not converge", () => {
    const db = makeDb();
    const job = convergedJob();
    job.response = { ...job.response, converged: false };
    const ingest = ingestCalibrationJob(job, db, { parameterSetId: "ps-bad" });
    expect(ingest.ok).toBe(false);
    expect(ingest.error).toMatch(/converged: false/);
    expect(db.evidenceModels[0].statisticalModels[0].parameterSets).toEqual([]);
  });
});
