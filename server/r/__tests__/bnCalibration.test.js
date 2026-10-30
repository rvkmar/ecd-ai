import { describe, expect, it } from "vitest";
import { bnNetworkErrors } from "../bnNetwork.js";
import { rPathForJobKind, validateCalibrationRequest } from "../calibrationContract.js";
import { assessLiveResponseMatrix } from "../liveResponseMatrix.js";
import { ingestCalibrationJob } from "../calibrationIngest.js";
import { runScheduledCalibrationEnqueue } from "../scheduledCalibrationEnqueue.js";

function network(extra = {}) {
  return {
    latents: [
      { id: "smvA", states: ["not_mastered", "mastered"], parentId: null },
      { id: "smvB", states: ["low", "high"], parentId: "smvA" },
    ],
    observables: [
      { id: "o1", parentId: "smvA" },
      { id: "o2", parentId: "smvB" },
    ],
    ...extra,
  };
}

function request(modelExtra = {}) {
  return {
    contractVersion: "1.0",
    jobId: "job-bn",
    model: {
      family: "bn",
      itemIds: ["o1", "o2"],
      network: network(),
      ...modelExtra,
    },
    responseMatrix: {
      personIds: ["p1", "p2"],
      itemIds: ["o1", "o2"],
      data: [
        [1, 0],
        [0, 1],
      ],
    },
    options: { seed: 14612 },
  };
}

function session(id, studentId, responses) {
  return {
    id,
    studentId,
    status: "completed",
    isCompleted: true,
    responses,
  };
}

function bnDb(sessions, plan) {
  return {
    competencies: [{ id: "comp1", modelId: "cm1" }],
    competencyModels: [
      {
        id: "cm1",
        smVariables: [
          { id: "smvA", type: "binary", scale: { states: ["not_mastered", "mastered"] } },
          { id: "smvB", type: "binary", scale: { states: ["low", "high"] } },
        ],
      },
    ],
    evidenceModels: [
      {
        id: "em1",
        competencyId: "comp1",
        calibrationPlan: plan,
        statisticalModels: [
          {
            id: "sm1",
            type: "bayesian_network",
            active: true,
            parameterSets: [],
            structureConfig: {
              latentNodes: ["smvA", "smvB"],
              observableIds: ["o1", "o2", "o3"],
              edges: [
                { from: "smvA", to: "smvB" },
                { from: "smvA", to: "o1" },
                { from: "smvB", to: "o2" },
                { from: "smvB", to: "o3" },
              ],
            },
          },
        ],
      },
    ],
    sessions,
    calibrationJobs: [],
    analysisArtefacts: [],
  };
}

function scored(observableId, activated) {
  return {
    itemId: observableId,
    observableId,
    evidenceModelId: "em1",
    activated,
    timestamp: "2026-10-30T12:00:00.000Z",
  };
}

describe("bn calibration contract", () => {
  it("posts bn-parameters to /calibrate/bn", () => {
    expect(rPathForJobKind("bn-parameters")).toBe("/calibrate/bn");
  });

  it("accepts a tree and refuses a cycle or a missing network", () => {
    expect(validateCalibrationRequest(request())).toEqual([]);
    expect(bnNetworkErrors({ family: "bn", itemIds: ["o1", "o2"] }).join(" ")).toMatch(/model.network/);
    const cyclic = request();
    cyclic.model.network.latents[0].parentId = "smvB";
    expect(validateCalibrationRequest(cyclic).join(" ")).toMatch(/cycle/);
  });
});

describe("bn live source", () => {
  it("builds a latent-tree request from finished sessions", () => {
    const sessions = [
      session("s1", "stud-1", [scored("o1", true), scored("o2", false), scored("o3", true)]),
      session("s2", "stud-2", [scored("o1", false), scored("o2", true)]),
    ];
    const assessed = assessLiveResponseMatrix(bnDb(sessions), {
      evidenceModelId: "em1",
      statisticalModelId: "sm1",
      kind: "bn-parameters",
    });
    expect(assessed.ok, assessed.message).toBe(true);
    expect(assessed.request.model.family).toBe("bn");
    expect(assessed.request.model.itemIds).toEqual(["o1", "o2", "o3"]);
    expect(assessed.request.model.network.latents.map((node) => node.id)).toEqual(["smvA", "smvB"]);
    expect(assessed.request.model.network.latents[1].parentId).toBe("smvA");
    expect(assessed.request.responseMatrix.data).toEqual([
      [1, 0, 1],
      [0, 1, null],
    ]);
    expect(assessed.request.bundles).toBeUndefined();
    expect(
      validateCalibrationRequest({ ...assessed.request, contractVersion: "1.0", jobId: "job-live" })
    ).toEqual([]);
  });

  it("is a calibrationPlan family option on scheduled enqueue", () => {
    const sessions = [
      session("s1", "stud-1", [scored("o1", true), scored("o2", true), scored("o3", false)]),
      session("s2", "stud-2", [scored("o1", false), scored("o2", false), scored("o3", true)]),
    ];
    const db = bnDb(sessions, {
      scheduledEnqueue: {
        enabled: true,
        jobs: [{ kind: "bn-parameters", source: "sessions", minSampleSize: 2 }],
      },
    });
    const result = runScheduledCalibrationEnqueue(db, { now: new Date("2026-10-30T12:00:00.000Z") });
    expect(result.errors).toEqual([]);
    expect(result.enqueued).toHaveLength(1);
    expect(result.enqueued[0].kind).toBe("bn-parameters");
    expect(db.calibrationJobs[0].request.model.family).toBe("bn");
    expect(db.calibrationJobs[0].request.model.network.observables).toHaveLength(3);
    expect(db.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBeUndefined();
  });
});

describe("bn ingest", () => {
  it("stores a candidate CPT and puts person posteriors on an artefact", () => {
    const db = bnDb([]);
    const job = {
      id: "job-bn",
      kind: "bn-parameters",
      status: "succeeded",
      evidenceModelId: "em1",
      statisticalModelId: "sm1",
      response: {
        contractVersion: "1.0",
        jobId: "job-bn",
        converged: true,
        packageVersion: "base-R 4.5 bn-em",
        sampleSize: 20,
        calibratedAt: "2026-10-30T00:00:00.000Z",
        parameters: {
          _kind: "bayesian-cpt",
          _tree: true,
          _prior: { smvA: { not_mastered: 0.4, mastered: 0.6 } },
          _latentIds: ["smvA", "smvB"],
          smvB: {
            not_mastered: { low: 0.8, high: 0.2 },
            mastered: { low: 0.2, high: 0.8 },
          },
          o1: { levels: { not_mastered: 0.2, mastered: 0.8 } },
          o2: { levels: { low: 0.25, high: 0.9 } },
          o3: { levels: { low: 0.3, high: 0.85 } },
        },
        fitStatistics: {
          bnFit: {
            logLik: -40.5,
            aic: 100,
            bic: 120,
            nParameters: 8,
            meanAbsResidual: 0.02,
            maxAbsResidual: 0.04,
            residuals: [{ id: "o1", observed: 0.5, expected: 0.52, absResidual: 0.02 }],
          },
        },
        bnPersonPosteriors: [
          { personId: "stud-1", marginals: { smvA: { mastered: 0.8 } } },
          { personId: "stud-2", marginals: { smvA: { mastered: 0.3 } } },
        ],
      },
    };
    db.calibrationJobs.push(job);
    const result = ingestCalibrationJob(job, db, { parameterSetId: "ps-bn" });
    expect(result.ok, result.error).toBe(true);
    const stored = result.parameterSet;
    expect(stored.parameters._kind).toBe("bayesian-cpt");
    expect(stored.parameters.o1.levels.mastered).toBe(0.8);
    expect(stored.parameters.smvB.mastered.high).toBe(0.8);
    expect(stored.fitStatistics.bnFit.logLik).toBe(-40.5);
    expect(stored.fitStatistics.bnFit.aic).toBe(100);
    expect(stored.bnPersonPosteriors).toBeUndefined();
    expect(JSON.stringify(stored)).not.toMatch(/stud-1/);
    expect(stored.analysisArtefactId).toBe(result.analysisArtefact.id);
    expect(stored.status).toBe("candidate");
    expect(result.analysisArtefact.kind).toBe("bn-parameters");
    expect(result.analysisArtefact.payload.bnPersonPosteriors).toHaveLength(2);
    expect(db.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBeUndefined();
  });
});
