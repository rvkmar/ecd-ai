// src/utils/__tests__/calibrationJobs.test.js
// D62/D63: schema, lifecycle, and the readiness mirror agreeing with
// the server ingest/enqueue gates.

import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";
import { validateCalibrationJobLifecycle } from "../../../server/utils/lifecycleValidation.js";
import { validateCalibrationRequest } from "../../../server/r/calibrationContract.js";
import { ingestRefusal } from "../../../server/r/calibrationIngest.js";
import { enqueueReadiness, ingestReadiness, ingestArtefactReadiness } from "../calibrationJobReadiness.js";
import { CALIBRATION_JOB_KIND_VALUES } from "../ecdVocabulary.js";
import { CALIBRATION_JOB_STATUS } from "../../../server/utils/lifecycleMatrix.js";

function validRequest(jobId = "job1") {
  return {
    contractVersion: "1.0",
    jobId,
    model: { family: "irt", subtype: "2PL", itemIds: ["item_a", "item_b"] },
    responseMatrix: {
      personIds: ["p1", "p2"],
      itemIds: ["item_a", "item_b"],
      data: [
        [1, 0],
        [0, 1],
      ],
    },
    options: { seed: 20261120 },
  };
}

function validResponse(jobId = "job1") {
  return {
    contractVersion: "1.0",
    jobId,
    converged: true,
    packageVersion: "mirt 1.41",
    sampleSize: 2,
    calibratedAt: "2026-11-20T09:03:11Z",
    parameters: { item_a: { a: 1, b: 0, c: 0 }, item_b: { a: 1, b: 0.2, c: 0 } },
  };
}

function makeJob(overrides = {}) {
  return {
    id: "job1",
    kind: "irt-parameters",
    status: "queued",
    evidenceModelId: "em1",
    statisticalModelId: "sm1",
    requestedBy: "admin1",
    requestedAt: "2026-11-20T09:00:00Z",
    startedAt: null,
    finishedAt: null,
    request: validRequest("job1"),
    response: null,
    error: null,
    attempts: 1,
    maxAttempts: 3,
    ingestedParameterSetId: null,
    retainUntil: "2027-05-20T09:00:00Z",
    ...overrides,
  };
}

function db() {
  return {
    evidenceModels: [
      {
        id: "em1",
        competencyId: "c1",
        statisticalModels: [{ id: "sm1", type: "irt", active: true, parameterSets: [] }],
      },
    ],
    calibrationJobs: [],
    competencies: [{ id: "c1", modelId: "cm1", variableType: "continuous" }],
  };
}

function serverEnqueueOk(job, world) {
  const { valid } = validateEntity("calibrationJobs", job, world);
  const life = validateCalibrationJobLifecycle(job, world);
  const req = validateCalibrationRequest(job.request);
  return valid && life.length === 0 && req.length === 0;
}

describe("calibration job vocabulary and status machine", () => {
  it("declares the three parameter kinds plus the five analysis kinds", () => {
    expect(CALIBRATION_JOB_KIND_VALUES).toEqual(
      expect.arrayContaining([
        "irt-parameters",
        "dina-parameters",
        "ctt-statistics",
        "dif-analysis",
        "equating",
        "item-analysis",
        "test-information",
        "attribute-profile-summary",
      ])
    );
    expect(CALIBRATION_JOB_KIND_VALUES).toHaveLength(8);
  });

  it("declares the five job states", () => {
    expect(CALIBRATION_JOB_STATUS).toEqual(
      expect.arrayContaining(["queued", "running", "succeeded", "failed", "cancelled"])
    );
  });
});

describe("calibrationJobs schema", () => {
  it("accepts a well-formed queued job", () => {
    const { valid, errors } = validateEntity("calibrationJobs", makeJob(), db());
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it("rejects an unknown kind", () => {
    const { errors } = validateEntity("calibrationJobs", makeJob({ kind: "not-a-kind" }), db());
    expect(errors.join(" ")).toMatch(/Invalid calibration job kind/);
  });

  it("rejects a draft-style authored status", () => {
    const { errors } = validateEntity("calibrationJobs", makeJob({ status: "draft" }), db());
    expect(errors.join(" ")).toMatch(/Invalid calibration job status/);
  });
});

describe("enqueue readiness mirror agrees with the server", () => {
  it("agrees on a valid queued job", () => {
    const job = makeJob();
    const world = db();
    expect(enqueueReadiness(job, world).ready).toBe(true);
    expect(serverEnqueueOk(job, world)).toBe(true);
  });

  it("agrees that a missing seed is not ready", () => {
    const job = makeJob({
      request: { ...validRequest("job1"), options: {} },
    });
    const world = db();
    expect(enqueueReadiness(job, world).ready).toBe(false);
    expect(serverEnqueueOk(job, world)).toBe(false);
  });

  it("agrees that a dangling evidenceModelId is not ready", () => {
    const job = makeJob({ evidenceModelId: "em-missing" });
    const world = db();
    expect(enqueueReadiness(job, world).ready).toBe(false);
    expect(serverEnqueueOk(job, world)).toBe(false);
  });
});

describe("ingest readiness mirror agrees with the server", () => {
  function succeeded(overrides = {}) {
    return makeJob({
      status: "succeeded",
      startedAt: "2026-11-20T09:00:01Z",
      finishedAt: "2026-11-20T09:03:11Z",
      response: validResponse("job1"),
      ...overrides,
    });
  }

  it("agrees a converged succeeded job is ingestible", () => {
    const job = succeeded();
    const world = db();
    expect(ingestReadiness(job).ready).toBe(true);
    expect(ingestRefusal(job, world)).toBeNull();
  });

  it("agrees a non-converged fixture is refused", () => {
    const job = succeeded({
      response: {
        contractVersion: "1.0",
        jobId: "job1",
        converged: false,
        error: { message: "did not converge", rClass: "NotConverged", stderr: "EM" },
      },
    });
    const world = db();
    expect(ingestReadiness(job).ready).toBe(false);
    expect(ingestReadiness(job).checks.find((c) => c.id === "converged").ok).toBe(false);
    expect(ingestRefusal(job, world)).toMatch(/converged: false/);
  });

  it("agrees an already-ingested job is refused", () => {
    const job = succeeded({ ingestedParameterSetId: "ps1" });
    const world = db();
    expect(ingestReadiness(job).ready).toBe(false);
    expect(ingestRefusal(job, world)).toMatch(/Already ingested/);
  });

  it("agrees an analysis kind does not ingest into parameterSets", () => {
    const job = succeeded({ kind: "dif-analysis" });
    const world = db();
    expect(ingestReadiness(job).ready).toBe(false);
    expect(ingestReadiness(job).checks.find((c) => c.id === "kindIngests").ok).toBe(false);
    expect(ingestArtefactReadiness(job).ready).toBe(true);
    expect(ingestRefusal(job, world)).toBeNull();
  });
});
