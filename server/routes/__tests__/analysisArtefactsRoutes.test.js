// server/routes/__tests__/analysisArtefactsRoutes.test.js
// D76: analysisArtefacts collection surface — round-trip, filters,
// role gates, and immutability (mutate refused).

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";
import { validateEntity } from "../../../src/utils/schema.js";
import { analysisArtefactReadiness } from "../../../src/utils/analysisArtefactReadiness.js";
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

async function artefactsApp() {
  const { default: router } = await import("../analysisArtefactsRoutes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/analysisArtefacts", router);
  return app;
}

function seedDb() {
  dbState.current = {
    calibrationJobs: [
      {
        id: "job_dif",
        kind: "dif-analysis",
        status: "succeeded",
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
        requestedBy: "admin1",
        requestedAt: "2026-09-16T09:00:00Z",
        startedAt: "2026-09-16T09:00:01Z",
        finishedAt: "2026-09-16T09:03:11Z",
        request: { contractVersion: "1.0", jobId: "job_dif" },
        response: {
          contractVersion: "1.0",
          jobId: "job_dif",
          converged: true,
          packageVersion: "difR 6.1.0",
          sampleSize: 800,
          calibratedAt: "2026-09-16T09:03:11Z",
          parameters: { "Item.5": { flag: true, etsClass: "C" } },
        },
        error: null,
        attempts: 1,
        maxAttempts: 3,
        ingestedParameterSetId: null,
        ingestedAnalysisArtefactId: null,
      },
    ],
    analysisArtefacts: [],
    evidenceModels: [
      {
        id: "em1",
        competencyId: "c1",
        statisticalModels: [{ id: "sm1", type: "irt", active: true, parameterSets: [] }],
      },
    ],
    taskModels: [],
  };
}

beforeEach(() => {
  seedDb();
});

describe("analysisArtefacts HTTP surface (D76)", () => {
  it("round-trips an ingested artefact with full provenance", async () => {
    const job = dbState.current.calibrationJobs[0];
    const result = ingestCalibrationJob(job, dbState.current);
    expect(result.ok).toBe(true);
    expect(result.analysisArtefact.id).toBeTruthy();
    expect(result.analysisArtefact.jobId).toBe("job_dif");
    expect(result.analysisArtefact.scope.evidenceModelId).toBe("em1");
    expect(result.analysisArtefact.packageVersion).toBe("difR 6.1.0");
    expect(result.analysisArtefact.sampleSize).toBe(800);
    expect(result.analysisArtefact.payload.parameters["Item.5"].flag).toBe(true);
    expect(dbState.current.analysisArtefacts).toHaveLength(1);
    expect(dbState.current.evidenceModels[0].analysisArtefacts || []).toHaveLength(0);

    const app = await artefactsApp();
    const list = await request(app)
      .get("/api/analysisArtefacts")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(result.analysisArtefact.id);
    expect(list.body[0].jobId).toBe("job_dif");
    expect(list.body[0].packageVersion).toBe("difR 6.1.0");

    const one = await request(app)
      .get(`/api/analysisArtefacts/${result.analysisArtefact.id}`)
      .set("Authorization", `Bearer ${tokenFor("district")}`);
    expect(one.status).toBe(200);
    expect(one.body.scope.evidenceModelId).toBe("em1");
  });

  it("filters by evidenceModelId and kind", async () => {
    const job = dbState.current.calibrationJobs[0];
    ingestCalibrationJob(job, dbState.current);
    const app = await artefactsApp();

    const hit = await request(app)
      .get("/api/analysisArtefacts?evidenceModelId=em1&kind=dif-analysis")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(hit.status).toBe(200);
    expect(hit.body).toHaveLength(1);

    const miss = await request(app)
      .get("/api/analysisArtefacts?evidenceModelId=em-other")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(miss.status).toBe(200);
    expect(miss.body).toHaveLength(0);
  });

  it("refuses PUT, PATCH, DELETE, and POST", async () => {
    const job = dbState.current.calibrationJobs[0];
    const { analysisArtefact } = ingestCalibrationJob(job, dbState.current);
    const app = await artefactsApp();
    const auth = { Authorization: `Bearer ${tokenFor("admin")}` };
    const id = analysisArtefact.id;

    const put = await request(app).put(`/api/analysisArtefacts/${id}`).set(auth).send({ kind: "equating" });
    expect(put.status).toBe(405);
    expect(put.body.error).toMatch(/immutable/i);

    const patch = await request(app)
      .patch(`/api/analysisArtefacts/${id}`)
      .set(auth)
      .send({ packageVersion: "tampered" });
    expect(patch.status).toBe(405);

    const del = await request(app).delete(`/api/analysisArtefacts/${id}`).set(auth);
    expect(del.status).toBe(405);

    const post = await request(app).post("/api/analysisArtefacts").set(auth).send({ id: "aa-x" });
    expect(post.status).toBe(405);

    expect(dbState.current.analysisArtefacts[0].kind).toBe("dif-analysis");
    expect(dbState.current.analysisArtefacts[0].packageVersion).toBe("difR 6.1.0");
  });

  it("schema refuses mutating an existing artefact in place", () => {
    const job = dbState.current.calibrationJobs[0];
    const { analysisArtefact } = ingestCalibrationJob(job, dbState.current);
    const stored = dbState.current.analysisArtefacts[0];
    const attempt = { ...stored, packageVersion: "tampered 9.9.9" };
    const { valid, errors } = validateEntity("analysisArtefacts", attempt, dbState.current, {
      strict: false,
    });
    expect(valid).toBe(false);
    expect(errors.join(" ")).toMatch(/immutable/);
    expect(analysisArtefact.packageVersion).toBe("difR 6.1.0");
  });

  it("gates teacher and student out of the collection", async () => {
    const app = await artefactsApp();
    for (const role of ["teacher", "student"]) {
      const res = await request(app)
        .get("/api/analysisArtefacts")
        .set("Authorization", `Bearer ${tokenFor(role)}`);
      expect(res.status).toBe(403);
    }
  });
});

describe("analysisArtefact readiness mirror agrees with validateEntity", () => {
  it("passes and fails the same fixtures", () => {
    const job = dbState.current.calibrationJobs[0];
    const { analysisArtefact } = ingestCalibrationJob(job, dbState.current);
    // Strip aliases — readiness/schema operate on the stored collection shape.
    const record = dbState.current.analysisArtefacts[0];
    expect(analysisArtefact.id).toBe(record.id);

    const schema = validateEntity("analysisArtefacts", record, dbState.current, { strict: false });
    const mirror = analysisArtefactReadiness(record, dbState.current);
    expect(schema.valid).toBe(true);
    expect(mirror.ready).toBe(true);

    const broken = { ...record, packageVersion: "" };
    const schemaBad = validateEntity("analysisArtefacts", broken, dbState.current, {
      strict: false,
    });
    const mirrorBad = analysisArtefactReadiness(broken, dbState.current);
    expect(schemaBad.valid).toBe(false);
    expect(mirrorBad.ready).toBe(false);
  });
});
