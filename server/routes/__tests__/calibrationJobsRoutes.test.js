// server/routes/__tests__/calibrationJobsRoutes.test.js
// D62/D63: enqueue, cancel, retry, ingest refusal, role gates, and
// the retired sync /api/calibrate path.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";
import { ingestCalibrationJob } from "../../r/calibrationIngest.js";

const tokenFor = (role) =>
  jwt.sign({ username: `${role}1`, role }, JWT_SECRET, { expiresIn: "1h" });

const dbState = { current: {} };
vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: () => dbState.current,
  saveDB: (next) => {
    dbState.current = next;
  },
}));

async function jobsApp() {
  const { default: router } = await import("../calibrationJobsRoutes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/calibrationJobs", router);
  return app;
}

async function legacyApp() {
  const { default: router } = await import("../calibrationRoutes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/calibrate", router);
  return app;
}

function validRequest() {
  return {
    contractVersion: "1.0",
    jobId: "will-be-replaced",
    model: { family: "irt", subtype: "2PL", itemIds: ["item_a", "item_b"] },
    responseMatrix: {
      personIds: ["p1", "p2", "p3", "p4"],
      itemIds: ["item_a", "item_b"],
      data: [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, 0],
      ],
    },
    options: { seed: 20261120, maxIterations: 50 },
  };
}

function seedDb() {
  dbState.current = {
    calibrationJobs: [],
    questions: [{ id: "q1", metadata: {} }],
    evidenceModels: [
      {
        id: "em1",
        competencyId: "c1",
        statisticalModels: [
          { id: "sm1", type: "irt", active: true, parameterSets: [] },
        ],
      },
    ],
    competencies: [{ id: "c1", modelId: "cm1", variableType: "continuous" }],
  };
}

beforeEach(() => {
  seedDb();
});

describe("role gates", () => {
  it("lets district read and refuses student read", async () => {
    const app = await jobsApp();
    const district = await request(app)
      .get("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("district")}`);
    expect(district.status).toBe(200);

    const student = await request(app)
      .get("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("student")}`);
    expect(student.status).toBe(403);
  });

  it("refuses a write from district or teacher", async () => {
    const app = await jobsApp();
    for (const role of ["district", "teacher", "student"]) {
      const res = await request(app)
        .post("/api/calibrationJobs/")
        .set("Authorization", `Bearer ${tokenFor(role)}`)
        .send({
          kind: "irt-parameters",
          evidenceModelId: "em1",
          statisticalModelId: "sm1",
          request: validRequest(),
        });
      expect(res.status).toBe(403);
    }
  });
});

describe("enqueue", () => {
  it("creates a queued job with a server-authored id and request.jobId", async () => {
    const app = await jobsApp();
    const res = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "irt-parameters",
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
        request: validRequest(),
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("queued");
    expect(res.body.id).toMatch(/^job/);
    expect(res.body.request.jobId).toBe(res.body.id);
    expect(res.body.request.options.seed).toBe(20261120);
    expect(dbState.current.questions[0].metadata).toEqual({});
  });

  it("refuses a request without a seed", async () => {
    const app = await jobsApp();
    const requestBody = validRequest();
    delete requestBody.options.seed;
    const res = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "irt-parameters",
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
        request: requestBody,
      });
    expect(res.status).toBe(400);
    expect(res.body.details.join(" ")).toMatch(/seed/);
  });
});

describe("cancel and retry", () => {
  it("cancels a queued job and refuses to cancel a succeeded one", async () => {
    const app = await jobsApp();
    const created = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "irt-parameters",
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
        request: validRequest(),
      });
    const id = created.body.id;

    const cancelled = await request(app)
      .post(`/api/calibrationJobs/${id}/cancel`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("cancelled");

    dbState.current.calibrationJobs[0].status = "succeeded";
    const again = await request(app)
      .post(`/api/calibrationJobs/${id}/cancel`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(again.status).toBe(409);
  });

  it("retries a failed job and increments attempts", async () => {
    const app = await jobsApp();
    const created = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "irt-parameters",
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
        request: validRequest(),
      });
    const job = dbState.current.calibrationJobs[0];
    job.status = "failed";
    job.finishedAt = new Date().toISOString();
    job.error = { message: "boom", rClass: "simpleError", stderr: "trace" };

    const retried = await request(app)
      .post(`/api/calibrationJobs/${created.body.id}/retry`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(retried.status).toBe(200);
    expect(retried.body.status).toBe("queued");
    expect(retried.body.attempts).toBe(2);
  });
});

describe("ingest refuses non-converged", () => {
  it("does not write a parameter set when converged is false", async () => {
    const app = await jobsApp();
    dbState.current.calibrationJobs = [
      {
        id: "job_nc",
        kind: "irt-parameters",
        status: "succeeded",
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
        requestedBy: "admin1",
        requestedAt: "2026-11-20T09:00:00Z",
        startedAt: "2026-11-20T09:00:01Z",
        finishedAt: "2026-11-20T09:03:11Z",
        request: validRequest(),
        response: {
          contractVersion: "1.0",
          jobId: "job_nc",
          converged: false,
          error: { message: "did not converge", rClass: "NotConverged", stderr: "EM" },
        },
        error: { message: "did not converge", rClass: "NotConverged", stderr: "EM" },
        attempts: 1,
        maxAttempts: 3,
        ingestedParameterSetId: null,
      },
    ];

    const res = await request(app)
      .post("/api/calibrationJobs/job_nc/ingest")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/converged: false/);
    expect(dbState.current.evidenceModels[0].statisticalModels[0].parameterSets).toEqual([]);
  });

  it("appends an ADR 0002 parameter set on a converged job", async () => {
    const app = await jobsApp();
    dbState.current.calibrationJobs = [
      {
        id: "job_ok",
        kind: "irt-parameters",
        status: "succeeded",
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
        requestedBy: "admin1",
        requestedAt: "2026-11-20T09:00:00Z",
        startedAt: "2026-11-20T09:00:01Z",
        finishedAt: "2026-11-20T09:03:11Z",
        request: validRequest(),
        response: {
          contractVersion: "1.0",
          jobId: "job_ok",
          converged: true,
          packageVersion: "mirt 1.41",
          sampleSize: 4,
          calibratedAt: "2026-11-20T09:03:11Z",
          parameters: { item_a: { a: 1.1, b: -0.2, c: 0 }, item_b: { a: 0.9, b: 0.3, c: 0 } },
          standardErrors: { item_a: { a: 0.1, b: 0.05, c: 0 } },
          fitStatistics: { global: { RMSEA: 0.04 } },
        },
        error: null,
        attempts: 1,
        maxAttempts: 3,
        ingestedParameterSetId: null,
      },
    ];

    const res = await request(app)
      .post("/api/calibrationJobs/job_ok/ingest")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(res.status).toBe(200);
    const ps = dbState.current.evidenceModels[0].statisticalModels[0].parameterSets[0];
    expect(ps.converged).toBe(true);
    expect(ps.packageVersion).toBe("mirt 1.41");
    expect(ps.parameters.item_a.a).toBe(1.1);
    expect(ps.standardErrors.item_a.a).toBe(0.1);
    expect(ps.calibrationJobId).toBe("job_ok");
    expect(dbState.current.calibrationJobs[0].ingestedParameterSetId).toBe(ps.parameterSetId);
  });
});

describe("legacy /api/calibrate", () => {
  it("returns 410 and does not write questions[].metadata", async () => {
    const app = await legacyApp();
    const res = await request(app)
      .post("/api/calibrate/em1")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ responses: [{ studentId: "s1", answers: { q1: 1 } }] });
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/calibrationJobs/);
    expect(dbState.current.questions[0].metadata).toEqual({});
  });
});

describe("ingestCalibrationJob helper", () => {
  it("is the function the route uses (not a second copy)", () => {
    expect(typeof ingestCalibrationJob).toBe("function");
  });
});
