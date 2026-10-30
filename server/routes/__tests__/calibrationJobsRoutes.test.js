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

  it("exposes queue-metrics to admin/district (D87)", async () => {
    dbState.current.calibrationJobs = [
      {
        id: "j1",
        kind: "irt-parameters",
        status: "queued",
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
        requestedBy: "admin1",
        requestedAt: "2026-12-25T09:00:00Z",
        startedAt: null,
        finishedAt: null,
        request: validRequest(),
        response: null,
        error: null,
        attempts: 1,
        maxAttempts: 3,
        ingestedParameterSetId: null,
      },
    ];
    const app = await jobsApp();
    const res = await request(app)
      .get("/api/calibrationJobs/queue-metrics")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(res.status).toBe(200);
    expect(res.body.queued).toBe(1);
    expect(res.body.running).toBe(0);
    expect(res.body.maxConcurrent).toBe(1);
    expect(res.body).toHaveProperty("depthAlarm");
    expect(res.body.rWorkersExpected).toBe(1);

    const student = await request(app)
      .get("/api/calibrationJobs/queue-metrics")
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

  it("freezes an adopted report template snapshot on the job", async () => {
    dbState.current.psychometricReportTemplates = [
      {
        id: "prt-irt",
        name: "Xcalibre classic",
        kind: "xcalibre-irt",
        audience: "psychometrician",
        chapters: ["cover", "irt-plots", "credits"],
        flags: { tooHard: 0.15 },
        nQuantiles: 5,
        skinId: "xcalibre-classic",
        status: "operational",
        locked: true,
      },
    ];
    const app = await jobsApp();
    const res = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "irt-parameters",
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
        templateId: "prt-irt",
        request: validRequest(),
      });
    expect(res.status).toBe(201);
    expect(res.body.templateId).toBe("prt-irt");
    expect(res.body.request.reportTemplate.name).toBe("Xcalibre classic");
    expect(res.body.request.reportTemplate.chapters).toContain("irt-plots");
    expect(res.body.request.options.flags.tooHard).toBe(0.15);

    dbState.current.psychometricReportTemplates[0].name = "rewritten later";
    const stored = dbState.current.calibrationJobs[0];
    expect(stored.request.reportTemplate.name).toBe("Xcalibre classic");
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
    expect(ps.status).toBe("candidate");
    expect(dbState.current.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBeUndefined();
  });

  it("keeps report HTML and person scores off the parameter set", async () => {
    const app = await jobsApp();
    const personScores = {
      method: "EAP",
      personIds: ["stud-1", "stud-2"],
      theta: [0.2, -0.1],
      se: [0.3, 0.4],
    };
    const reportHtml = `<html>${"r".repeat(2000)}</html>`;
    dbState.current.calibrationJobs = [
      {
        id: "job_fat",
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
          jobId: "job_fat",
          converged: true,
          packageVersion: "mirt 1.41",
          sampleSize: 4,
          calibratedAt: "2026-11-20T09:03:11Z",
          parameters: { item_a: { a: 1.1, b: -0.2, c: 0 } },
          standardErrors: { item_a: { a: 0.1, b: 0.05 } },
          fitStatistics: { global: { RMSEA: 0.04 }, itemFit: { item_a: { S_X2: 1.2 } }, personScores },
          reportHtml,
        },
        error: null,
        attempts: 1,
        maxAttempts: 3,
        ingestedParameterSetId: null,
      },
    ];

    const res = await request(app)
      .post("/api/calibrationJobs/job_fat/ingest")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(res.status).toBe(200);
    const ps = dbState.current.evidenceModels[0].statisticalModels[0].parameterSets[0];
    expect(ps.reportHtml).toBeUndefined();
    expect(ps.fitStatistics.personScores).toBeUndefined();
    expect(ps.fitStatistics.global.RMSEA).toBe(0.04);
    expect(ps.fitStatistics.itemFit.item_a.S_X2).toBe(1.2);
    expect(ps.parameters.item_a.a).toBe(1.1);
    expect(ps.standardErrors.item_a.a).toBe(0.1);
    expect(ps.calibrationJobId).toBe("job_fat");
    expect(JSON.stringify(ps)).not.toMatch(/stud-1/);
    expect(dbState.current.calibrationJobs[0].response.reportHtml).toBe(reportHtml);
    expect(dbState.current.calibrationJobs[0].response.fitStatistics.personScores.personIds).toEqual([
      "stud-1",
      "stud-2",
    ]);
  });

  it("copies live session ids and the Q-matrix id onto the parameter set", async () => {
    const app = await jobsApp();
    dbState.current.calibrationJobs = [
      {
        id: "job_live",
        kind: "dina-parameters",
        status: "succeeded",
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
        responseSource: "sessions",
        qMatrixId: "qm-live",
        sourceSessionIds: ["sess-a", "sess-b"],
        sourceSessionCount: 2,
        sourceSessionIdsHash: "abc123",
        requestedBy: "admin1",
        requestedAt: "2026-11-20T09:00:00Z",
        startedAt: "2026-11-20T09:00:01Z",
        finishedAt: "2026-11-20T09:03:11Z",
        request: {
          ...validRequest(),
          model: { family: "dina", itemIds: ["item_a", "item_b"] },
          qMatrix: {
            id: "qm-live",
            attributeIds: ["attr-1"],
            itemIds: ["item_a", "item_b"],
            data: [[1], [1]],
          },
          provenance: {
            source: "completed-sessions",
            qMatrixId: "qm-live",
            sourceSessionIds: ["sess-a", "sess-b"],
            sourceSessionCount: 2,
            sourceSessionIdsHash: "abc123",
          },
        },
        response: {
          contractVersion: "1.0",
          jobId: "job_live",
          converged: true,
          packageVersion: "GDINA 2.9.4",
          sampleSize: 2,
          calibratedAt: "2026-11-20T09:03:11Z",
          parameters: { item_a: { slip: 0.1, guess: 0.2 }, item_b: { slip: 0.1, guess: 0.2 } },
        },
        error: null,
        attempts: 1,
        maxAttempts: 3,
        ingestedParameterSetId: null,
      },
    ];
    dbState.current.evidenceModels[0].statisticalModels[0].type = "dina";

    const res = await request(app)
      .post("/api/calibrationJobs/job_live/ingest")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(res.status).toBe(200);
    const ps = res.body.parameterSet;
    expect(ps.qMatrixId).toBe("qm-live");
    expect(ps.responseSource).toBe("sessions");
    expect(ps.sourceSessionIds).toEqual(["sess-a", "sess-b"]);
    expect(ps.sourceSessionCount).toBe(2);
    expect(ps.sourceSessionIdsHash).toBe("abc123");
    expect(ps.calibrationJobId).toBe("job_live");
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

function completedSessions(activated) {
  return Array.from({ length: 10 }, (_, i) => ({
    id: `s${i}`,
    studentId: `stud-${i}`,
    status: "completed",
    isCompleted: true,
    responses: [
      { itemId: "item-a", evidenceModelId: "em1", activated, timestamp: "2026-10-16T00:00:00.000Z" },
      { itemId: "item-b", evidenceModelId: "em1", activated, timestamp: "2026-10-16T00:00:00.000Z" },
    ],
  }));
}

describe("session item analysis enqueue", () => {
  it("refuses when every response has activated null and lists the student ids", async () => {
    dbState.current.sessions = completedSessions(null);
    const app = await jobsApp();
    const res = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ source: "sessions", evidenceModelId: "em1", statisticalModelId: "sm1" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("UNSCORED");
    expect(res.body.sampleSize).toBe(10);
    expect(res.body.studentIds).toHaveLength(10);
    expect(dbState.current.calibrationJobs).toHaveLength(0);
  });

  it("enqueues item analysis with the real student ids and leaves LSAT7 as a fixture", async () => {
    dbState.current.sessions = completedSessions(true);
    const app = await jobsApp();
    const res = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ source: "sessions", evidenceModelId: "em1", statisticalModelId: "sm1" });
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("item-analysis");
    expect(res.body.request.fixture).toBeUndefined();
    expect(res.body.request.provenance.sampleSize).toBe(10);
    expect(res.body.request.responseMatrix.personIds).toEqual(
      Array.from({ length: 10 }, (_, i) => `stud-${i}`)
    );
    const fixture = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        fixture: "lsat7",
        kind: "irt-parameters",
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
      });
    expect(fixture.status).toBe(201);
    expect(fixture.body.kind).toBe("irt-parameters");
    expect(fixture.body.request.responseMatrix.personIds).toHaveLength(1000);
    expect(fixture.body.responseSource).toBe("fixture");
    expect(fixture.body.fixtureName).toBe("lsat7");
  });

  it("builds an IRT matrix from finished sessions and stamps the session ids", async () => {
    dbState.current.sessions = [
      {
        id: "sess-a",
        studentId: "stud-a",
        status: "completed",
        isCompleted: true,
        responses: [
          { itemId: "item-a", evidenceModelId: "em1", activated: true, timestamp: "2026-10-20T00:00:00.000Z" },
          { itemId: "item-b", evidenceModelId: "em1", activated: false, timestamp: "2026-10-20T00:00:00.000Z" },
          { itemId: "item-c", evidenceModelId: "em1", activated: true, timestamp: "2026-10-20T00:00:00.000Z" },
        ],
      },
      {
        id: "sess-b",
        studentId: "stud-b",
        status: "completed",
        isCompleted: true,
        responses: [
          { itemId: "item-a", evidenceModelId: "em1", activated: false, timestamp: "2026-10-20T00:00:00.000Z" },
          { itemId: "item-c", evidenceModelId: "em1", activated: false, timestamp: "2026-10-20T00:00:00.000Z" },
        ],
      },
    ];
    const app = await jobsApp();
    const res = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        source: "sessions",
        kind: "irt-parameters",
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
      });
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("irt-parameters");
    expect(res.body.responseSource).toBe("sessions");
    expect(res.body.sourceSessionIds).toEqual(["sess-a", "sess-b"]);
    expect(res.body.request.model.subtype).toBe("2PL");
    expect(res.body.request.responseMatrix.data).toEqual([
      [1, 0, 1],
      [0, null, 0],
    ]);
    expect(res.body.request.qMatrix).toBeUndefined();
  });

  it("refuses a fixture source that does not name a fixture", async () => {
    const app = await jobsApp();
    const res = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ source: "fixture", kind: "irt-parameters", evidenceModelId: "em1", statisticalModelId: "sm1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/named fixture/);
    expect(dbState.current.calibrationJobs).toHaveLength(0);
  });
});

describe("model criticism sidecars", () => {
  it("omits person rows and the Q3 matrix from detail and serves them back", async () => {
    dbState.current.calibrationJobs = [
      {
        id: "job-fit",
        kind: "irt-parameters",
        status: "succeeded",
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
        requestedBy: "admin1",
        requestedAt: "2026-10-30T09:00:00Z",
        request: validRequest(),
        response: {
          contractVersion: "1.0",
          jobId: "job-fit",
          converged: true,
          packageVersion: "mirt 1.47",
          sampleSize: 6,
          calibratedAt: "2026-10-30T09:01:00Z",
          parameters: { item_a: { a: 1, b: 0, c: 0 }, item_b: { a: 1, b: 0, c: 0 } },
          fitStatistics: {
            personFit: {
              statistic: "Zh",
              cutoff: -2,
              rule: "Zh < cutoff",
              nPersons: 6,
              nFinite: 6,
              nMisfit: 1,
              proportionMisfit: 1 / 6,
            },
            localDependence: {
              statistic: "Q3",
              threshold: 0.2,
              maxAbsQ3: 0.4,
              nPairs: 1,
              nFlaggedPairs: 1,
              flaggedPairs: [{ itemId1: "item_a", itemId2: "item_b", q3: 0.4 }],
            },
          },
          personFitRows: ["s1", "s2", "s3", "s4", "s5", "s6"].map((personId, i) => ({
            personId,
            Zh: i === 0 ? -2.5 : 0.1,
            misfit: i === 0,
          })),
          q3Matrix: {
            itemIds: ["item_a", "item_b"],
            values: [
              [1, 0.4],
              [0.4, 1],
            ],
          },
        },
        error: null,
        attempts: 1,
        maxAttempts: 3,
        ingestedParameterSetId: null,
      },
    ];
    const app = await jobsApp();
    const admin = { Authorization: `Bearer ${tokenFor("admin")}` };
    const detail = await request(app).get("/api/calibrationJobs/job-fit").set(admin);
    expect(detail.status).toBe(200);
    expect(detail.body.response.personFitRows).toBeUndefined();
    expect(detail.body.response.q3Matrix).toBeUndefined();
    expect(detail.body.hasPersonFit).toBe(true);
    expect(detail.body.hasQ3).toBe(true);
    expect(detail.body.response.fitStatistics.personFit.nMisfit).toBe(1);
    expect(detail.body.response.fitStatistics.localDependence.maxAbsQ3).toBe(0.4);

    const flags = await request(app).get("/api/calibrationJobs/job-fit/person-fit").set(admin);
    expect(flags.status).toBe(200);
    expect(flags.body.rows[0].personId).toBe("s1");
    expect(flags.body.nMisfit).toBe(1);

    const district = await request(app)
      .get("/api/calibrationJobs/job-fit/person-fit")
      .set("Authorization", `Bearer ${tokenFor("district")}`);
    expect(district.status).toBe(200);
    expect(district.body.rows[0].personId).toBe("row-1");
    expect(district.body.personIdRedacted).toBe(true);

    const matrix = await request(app).get("/api/calibrationJobs/job-fit/q3").set(admin);
    expect(matrix.status).toBe(200);
    expect(matrix.body.itemIds).toEqual(["item_a", "item_b"]);
    expect(matrix.body.values[0][1]).toBe(0.4);
  });
});

describe("HTML technical report", () => {
  it("omits reportHtml from list/detail and serves it at /:id/report", async () => {
    dbState.current.calibrationJobs = [
      {
        id: "job-html",
        kind: "irt-parameters",
        status: "succeeded",
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
        requestedBy: "admin1",
        requestedAt: "2026-10-27T09:00:00Z",
        request: validRequest(),
        response: {
          contractVersion: "1.0",
          jobId: "job-html",
          converged: true,
          packageVersion: "mirt 1.47",
          sampleSize: 4,
          calibratedAt: "2026-10-27T09:01:00Z",
          parameters: { item_a: { a: 1, b: 0, c: 0 } },
          reportHtml: "<html><body>Xcalibre-class report</body></html>",
        },
        error: null,
        attempts: 1,
        maxAttempts: 3,
        ingestedParameterSetId: null,
      },
    ];
    const app = await jobsApp();
    const auth = { Authorization: `Bearer ${tokenFor("admin")}` };
    const list = await request(app).get("/api/calibrationJobs").set(auth);
    expect(list.status).toBe(200);
    expect(list.body[0].response.reportHtml).toBeUndefined();
    expect(list.body[0].hasReport).toBe(true);

    const one = await request(app).get("/api/calibrationJobs/job-html").set(auth);
    expect(one.status).toBe(200);
    expect(one.body.response.reportHtml).toBeUndefined();
    expect(one.body.hasReport).toBe(true);

    const report = await request(app).get("/api/calibrationJobs/job-html/report").set(auth);
    expect(report.status).toBe(200);
    expect(report.body.html).toMatch(/Xcalibre-class report/);
    expect(report.body.html).toMatch(/Software and packages/);
    expect(report.body.html).toMatch(/mirt 1.47/);
  });
});
