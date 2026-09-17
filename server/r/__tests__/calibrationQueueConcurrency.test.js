// server/r/__tests__/calibrationQueueConcurrency.test.js
// D87 exit check: more jobs than workers → excess stays queued;
// worker count pinned (not availableCores()); depth alarm fires.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  computeQueueMetrics,
  maxConcurrentJobs,
  maybeEmitQueueDepthAlarm,
  __testing__ as queueLimitsTesting,
} from "../calibrationQueueLimits.js";
import {
  processQueuedJobs,
  getCalibrationQueueMetrics,
  __testing__ as workerTesting,
} from "../calibrationWorker.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const dbState = { current: {} };
vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: () => dbState.current,
  saveDB: (next) => {
    dbState.current = next;
  },
}));

function validRequest(jobId) {
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
    options: { seed: 20261225, maxIterations: 50 },
  };
}

function queued(id) {
  return {
    id,
    kind: "irt-parameters",
    status: "queued",
    evidenceModelId: "em1",
    statisticalModelId: "sm1",
    requestedBy: "admin1",
    requestedAt: "2026-12-25T09:00:00Z",
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

const okBody = (jobId) => ({
  contractVersion: "1.0",
  jobId,
  converged: true,
  packageVersion: "mirt 1.47",
  sampleSize: 2,
  calibratedAt: "2026-12-25T09:03:11Z",
  parameters: { item_a: { a: 1, b: 0, c: 0 }, item_b: { a: 1, b: 0, c: 0 } },
});

beforeEach(() => {
  dbState.current = world([]);
  workerTesting.resetDispatcher();
  queueLimitsTesting.resetQueueDepthAlarm();
  delete process.env.CALIBRATION_MAX_CONCURRENT;
  delete process.env.CALIBRATION_QUEUE_DEPTH_ALARM;
  delete process.env.R_WORKERS;
});

afterEach(() => {
  workerTesting.resetDispatcher();
  queueLimitsTesting.resetQueueDepthAlarm();
});

describe("queue metrics + alarm", () => {
  it("defaults max concurrent to 1 (matches R workers)", () => {
    expect(queueLimitsTesting.DEFAULT_MAX_CONCURRENT).toBe(1);
    expect(maxConcurrentJobs()).toBe(1);
  });

  it("flags depth alarm when queued >= threshold", () => {
    process.env.CALIBRATION_QUEUE_DEPTH_ALARM = "2";
    const alarmed = computeQueueMetrics([
      { status: "queued" },
      { status: "queued" },
    ]);
    expect(alarmed.depthAlarm).toBe(true);
    expect(alarmed.running).toBe(0);
  });

  it("emits the depth alarm once per crossing", () => {
    const warns = [];
    process.env.CALIBRATION_QUEUE_DEPTH_ALARM = "2";
    const metrics = computeQueueMetrics([{ status: "queued" }, { status: "queued" }]);
    const first = maybeEmitQueueDepthAlarm(metrics, { warn: (m) => warns.push(m) });
    const second = maybeEmitQueueDepthAlarm(metrics, { warn: (m) => warns.push(m) });
    expect(first).toBeTruthy();
    expect(second).toBe(first);
    expect(warns).toHaveLength(1);
    expect(warns[0]).toMatch(/depth alarm/);
  });
});

describe("D87 exit check — excess stays queued under concurrency bound", () => {
  it("with maxConcurrent=1, only one job runs while others remain queued", async () => {
    dbState.current = world([queued("a"), queued("b"), queued("c")]);

    let releaseA;
    const gateA = new Promise((r) => {
      releaseA = r;
    });
    let started = 0;

    const client = {
      postCalibration: async (_kind, request) => {
        started += 1;
        if (request.jobId === "a") {
          await gateA;
        }
        return { ok: true, status: 200, json: okBody(request.jobId), text: "" };
      },
    };

    const runPromise = processQueuedJobs({ client, maxConcurrent: 1 });

    // Wait until job a is running.
    for (let i = 0; i < 50; i++) {
      const m = getCalibrationQueueMetrics();
      if (m.running === 1) break;
      await new Promise((r) => setTimeout(r, 10));
    }

    const mid = getCalibrationQueueMetrics();
    expect(mid.running).toBe(1);
    expect(mid.queued).toBe(2);
    expect(mid.maxConcurrent).toBe(1);
    expect(started).toBe(1);
    expect(dbState.current.calibrationJobs.find((j) => j.id === "a").status).toBe("running");
    expect(dbState.current.calibrationJobs.find((j) => j.id === "b").status).toBe("queued");
    expect(dbState.current.calibrationJobs.find((j) => j.id === "c").status).toBe("queued");

    releaseA();
    const processed = await runPromise;
    expect(processed).toHaveLength(3);
    expect(getCalibrationQueueMetrics().queued).toBe(0);
    expect(getCalibrationQueueMetrics().running).toBe(0);
  });

  it("a second concurrent dispatcher is refused while the first holds the lock", async () => {
    dbState.current = world([queued("slow")]);
    let release;
    const gate = new Promise((r) => {
      release = r;
    });

    const client = {
      postCalibration: async (_kind, request) => {
        await gate;
        return { ok: true, status: 200, json: okBody(request.jobId), text: "" };
      },
    };

    const first = processQueuedJobs({ client, maxConcurrent: 1 });
    await new Promise((r) => setTimeout(r, 20));
    const second = await processQueuedJobs({ client, maxConcurrent: 1 });
    expect(second).toEqual([]);

    release();
    await first;
  });
});

describe("R worker pin (source contract)", () => {
  it("api.R pins workers from R_WORKERS and does not use availableCores for worker count", () => {
    const api = fs.readFileSync(path.join(ROOT, "r-backend/app/api.R"), "utf8");
    expect(api).toMatch(/R_WORKERS/);
    expect(api).toMatch(/workerSource/);
    // availableCores must not set workers — detectCores is diagnostic only.
    expect(api).toMatch(/availableCoresReported/);
    expect(api).not.toMatch(/plan\s*\(\s*multisession/);
    expect(api).not.toMatch(/workers\s*=\s*max\s*\(\s*2/);
  });

  it("compose sets cpus 2.0 / memory 4G and R_WORKERS=1", () => {
    const compose = fs.readFileSync(path.join(ROOT, "docker-compose.yml"), "utf8");
    expect(compose).toMatch(/cpus:\s*"2\.0"/);
    expect(compose).toMatch(/memory:\s*4G/);
    expect(compose).toMatch(/R_WORKERS=1/);
    expect(compose).toMatch(/CALIBRATION_MAX_CONCURRENT=1/);
  });
});
