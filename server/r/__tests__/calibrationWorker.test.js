// server/r/__tests__/calibrationWorker.test.js
// D62: a job survives restart (running -> failed, inspectable); a
// mocked R call can succeed or fail with stderr.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { recoverRunningJobs, processJobById } from "../calibrationWorker.js";

const dbState = { current: {} };
vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: () => dbState.current,
  saveDB: (next) => {
    dbState.current = next;
  },
}));

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
    options: { seed: 20261120, maxIterations: 50 },
  };
}

function world(jobs) {
  return {
    calibrationJobs: jobs,
    evidenceModels: [
      {
        id: "em1",
        statisticalModels: [{ id: "sm1", type: "irt", parameterSets: [] }],
      },
    ],
  };
}

beforeEach(() => {
  dbState.current = world([]);
});

describe("restart recovery", () => {
  it("marks a running job failed with an inspectable reason", () => {
    dbState.current = world([
      {
        id: "job1",
        kind: "irt-parameters",
        status: "running",
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
        requestedBy: "admin1",
        requestedAt: "2026-11-20T09:00:00Z",
        startedAt: "2026-11-20T09:00:01Z",
        finishedAt: null,
        request: validRequest("job1"),
        response: null,
        error: null,
        attempts: 1,
        maxAttempts: 3,
        ingestedParameterSetId: null,
      },
    ]);

    const recovered = recoverRunningJobs();
    expect(recovered).toHaveLength(1);
    const job = dbState.current.calibrationJobs[0];
    expect(job.status).toBe("failed");
    expect(job.error.rClass).toBe("RestartRecovery");
    expect(job.error.message).toMatch(/restarted/);
    expect(job.error).toHaveProperty("stderr");
    expect(job.finishedAt).toBeTruthy();
  });

  it("leaves a queued job queued so it can run after boot", () => {
    dbState.current = world([
      {
        id: "job2",
        kind: "irt-parameters",
        status: "queued",
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
        requestedBy: "admin1",
        requestedAt: "2026-11-20T09:00:00Z",
        startedAt: null,
        finishedAt: null,
        request: validRequest("job2"),
        response: null,
        error: null,
        attempts: 1,
        maxAttempts: 3,
        ingestedParameterSetId: null,
      },
    ]);
    recoverRunningJobs();
    expect(dbState.current.calibrationJobs[0].status).toBe("queued");
  });
});

describe("processJobById", () => {
  function queuedJob() {
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
    };
  }

  it("stores a succeeded ADR 0002 response", async () => {
    dbState.current = world([queuedJob()]);
    const response = {
      contractVersion: "1.0",
      jobId: "job1",
      converged: true,
      packageVersion: "mirt 1.41",
      sampleSize: 2,
      calibratedAt: "2026-11-20T09:03:11Z",
      parameters: { item_a: { a: 1, b: 0, c: 0 }, item_b: { a: 1, b: 0, c: 0 } },
    };
    const result = await processJobById("job1", {
      client: { postCalibration: async () => ({ ok: true, status: 200, json: response, text: "" }) },
    });
    expect(result.ok).toBe(true);
    expect(dbState.current.calibrationJobs[0].status).toBe("succeeded");
    expect(dbState.current.calibrationJobs[0].response.packageVersion).toBe("mirt 1.41");
  });

  it("stores stderr on a failed R call", async () => {
    dbState.current = world([queuedJob()]);
    const result = await processJobById("job1", {
      client: {
        postCalibration: async () => ({
          ok: false,
          status: 500,
          json: null,
          text: "mirt exploded",
          error: { message: "R crashed", rClass: "simpleError", stderr: "Error in mirt(...)" },
        }),
      },
    });
    expect(result.ok).toBe(false);
    const job = dbState.current.calibrationJobs[0];
    expect(job.status).toBe("failed");
    expect(job.error.stderr).toMatch(/mirt/);
    expect(job.error.message).toBe("R crashed");
  });

  it("treats a non-converged but contract-valid response as succeeded (ingest will refuse)", async () => {
    dbState.current = world([queuedJob()]);
    const response = {
      contractVersion: "1.0",
      jobId: "job1",
      converged: false,
      error: { message: "did not converge", rClass: "NotConverged", stderr: "EM cycles" },
    };
    const result = await processJobById("job1", {
      client: { postCalibration: async () => ({ ok: true, status: 200, json: response, text: "" }) },
    });
    expect(result.ok).toBe(true);
    expect(dbState.current.calibrationJobs[0].status).toBe("succeeded");
    expect(dbState.current.calibrationJobs[0].response.converged).toBe(false);
  });
});
