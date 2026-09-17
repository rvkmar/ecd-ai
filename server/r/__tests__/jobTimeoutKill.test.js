// server/r/__tests__/jobTimeoutKill.test.js
// D86 exit check: a deliberately non-terminating job is killed at its
// timeout, the worker is reclaimed, and the next queued job starts.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { jobTimeoutMsForKind, DEFAULT_JOB_TIMEOUT_MS } from "../jobTimeouts.js";
import { killRBackend } from "../killRBackend.js";
import { postCalibration } from "../rClient.js";
import { processJobById, processQueuedJobs } from "../calibrationWorker.js";

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
    options: { seed: 20261224, maxIterations: 50 },
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

function queued(id, kind = "irt-parameters") {
  return {
    id,
    kind,
    status: "queued",
    evidenceModelId: "em1",
    statisticalModelId: "sm1",
    requestedBy: "admin1",
    requestedAt: "2026-12-24T09:00:00Z",
    startedAt: null,
    finishedAt: null,
    request: validRequest(id),
    response: null,
    error: null,
    attempts: 1,
    maxAttempts: 3,
    ingestedParameterSetId: null,
  };
}

beforeEach(() => {
  dbState.current = world([]);
  delete process.env.R_JOB_TIMEOUT_MS;
  delete process.env.R_BACKEND_KILL_COMMAND;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("jobTimeoutMsForKind", () => {
  it("defaults to 15 minutes", () => {
    expect(DEFAULT_JOB_TIMEOUT_MS).toBe(15 * 60 * 1000);
    expect(jobTimeoutMsForKind("unknown-kind")).toBe(DEFAULT_JOB_TIMEOUT_MS);
  });

  it("gives dina-parameters more headroom than item-analysis", () => {
    expect(jobTimeoutMsForKind("dina-parameters")).toBe(30 * 60 * 1000);
    expect(jobTimeoutMsForKind("item-analysis")).toBe(10 * 60 * 1000);
    expect(jobTimeoutMsForKind("dina-parameters")).toBeGreaterThan(
      jobTimeoutMsForKind("item-analysis")
    );
  });

  it("honours explicit override over the kind map", () => {
    expect(jobTimeoutMsForKind("dina-parameters", 1234)).toBe(1234);
  });
});

describe("killRBackend", () => {
  it("uses an injected killer (tests never need docker)", async () => {
    const calls = [];
    const result = await killRBackend({
      reason: "job-timeout",
      kind: "irt-parameters",
      jobId: "j1",
      killer: async (info) => {
        calls.push(info);
        return "killed-for-test";
      },
    });
    expect(result.ok).toBe(true);
    expect(result.method).toBe("injected");
    expect(result.detail).toBe("killed-for-test");
    expect(calls[0].jobId).toBe("j1");
  });
});

describe("postCalibration timeout kills R", () => {
  it("aborts a hung fetch, kills R, and reports Timeout with rKilled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init) => {
        return new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) return;
          const onAbort = () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          };
          if (signal.aborted) onAbort();
          else signal.addEventListener("abort", onAbort, { once: true });
        });
      })
    );

    const kills = [];
    const result = await postCalibration("irt-parameters", validRequest("hang-job"), {
      timeoutMs: 40,
      killer: async (info) => {
        kills.push(info);
        return "mock-kill";
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error.rClass).toBe("Timeout");
    expect(result.error.rKilled).toBe(true);
    expect(result.error.killMethod).toBe("injected");
    expect(result.error.message).toMatch(/timed out after 40ms/);
    expect(result.error.message).toMatch(/kill succeeded/);
    expect(kills).toHaveLength(1);
    expect(kills[0].jobId).toBe("hang-job");
  });
});

describe("D86 exit check — kill, reclaim, next job starts", () => {
  it("times out a hung job with kill, then processes the next queued job", async () => {
    dbState.current = world([queued("hang"), queued("next")]);

    const kills = [];
    let hangCalls = 0;
    const okResponse = {
      contractVersion: "1.0",
      jobId: "next",
      converged: true,
      packageVersion: "mirt 1.47",
      sampleSize: 2,
      calibratedAt: "2026-12-24T09:03:11Z",
      parameters: { item_a: { a: 1, b: 0, c: 0 }, item_b: { a: 1, b: 0, c: 0 } },
    };

    const client = {
      postCalibration: async (kind, request, options = {}) => {
        if (request.jobId === "hang") {
          hangCalls += 1;
          // Mirror rClient: wait for timeoutMs then kill + Timeout error.
          await new Promise((r) => setTimeout(r, options.timeoutMs ?? 50));
          const kill = await killRBackend({
            reason: "job-timeout",
            kind,
            jobId: request.jobId,
            killer: async (info) => {
              kills.push(info);
              return "reclaimed";
            },
          });
          return {
            ok: false,
            status: 0,
            json: null,
            text: "",
            error: {
              message: `R request timed out after ${options.timeoutMs}ms; R process kill succeeded via ${kill.method}`,
              rClass: "Timeout",
              stderr: kill.detail,
              rKilled: true,
              killMethod: kill.method,
            },
          };
        }
        return { ok: true, status: 200, json: { ...okResponse, jobId: request.jobId }, text: "" };
      },
    };

    const processed = await processQueuedJobs({ client, timeoutMs: 50, killer: async () => "x" });

    expect(processed).toHaveLength(2);
    expect(hangCalls).toBe(1);
    expect(kills).toHaveLength(1);

    const hangJob = dbState.current.calibrationJobs.find((j) => j.id === "hang");
    const nextJob = dbState.current.calibrationJobs.find((j) => j.id === "next");

    expect(hangJob.status).toBe("failed");
    expect(hangJob.error.rClass).toBe("Timeout");
    expect(hangJob.error.rKilled).toBe(true);
    expect(hangJob.finishedAt).toBeTruthy();

    expect(nextJob.status).toBe("succeeded");
    expect(nextJob.response.packageVersion).toBe("mirt 1.47");
  });

  it("processJobById records Timeout with inspectable stderr after kill", async () => {
    dbState.current = world([queued("solo")]);
    const result = await processJobById("solo", {
      timeoutMs: 30,
      client: {
        postCalibration: async (_kind, request, options) => {
          await new Promise((r) => setTimeout(r, options.timeoutMs));
          return {
            ok: false,
            status: 0,
            json: null,
            text: "",
            error: {
              message: "R request timed out after 30ms; R process kill succeeded via injected",
              rClass: "Timeout",
              stderr: "reason=job-timeout kind=irt-parameters jobId=solo",
              rKilled: true,
              killMethod: "injected",
            },
          };
        },
      },
    });
    expect(result.ok).toBe(false);
    expect(dbState.current.calibrationJobs[0].error.rClass).toBe("Timeout");
    expect(dbState.current.calibrationJobs[0].error.stderr).toMatch(/jobId=solo/);
  });
});
