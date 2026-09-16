// server/r/__tests__/testInformationPipeline.test.js
// D78: known-2pl-testinfo enqueue → process → (succeeded + converged) →
// analysisArtefact ingest.
//
// Two layers:
//   1. Always-run formula path — hand-verified I(θ) at θ∈{−1,0,1} from
//      the committed fixture; Node analytic Fisher (irtEngine parity)
//      builds the contract response. Proves the node pipeline without R.
//   2. Live path when R_BACKEND_URL is set — worker posts to R
//      /calibrate/test-information. Asserts checkpoints match hand
//      values within 1e-6 and KR-20 matches the fixture / JS .kr20.
//
// Authority: irt-parameters → parameterSets may set activeParameterSetId;
// test-information → analysisArtefacts informs only.
// Reliability: KR-20 is classical (same .kr20 as CTT/item-analysis);
// I(θ)/marginalReliability are IRT — both stated in diagnostics.

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";
import { processJobById } from "../calibrationWorker.js";
import { postCalibration, getRHealth } from "../rClient.js";
import { applyNamedCalibrationFixture } from "../calibrationFixtures.js";
import { validateCalibrationRequest, CALIBRATION_CONTRACT_VERSION } from "../calibrationContract.js";

const tokenFor = (role) =>
  jwt.sign({ username: `${role}1`, role }, JWT_SECRET, { expiresIn: "1h" });

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(here, "../fixtures/known-2pl-testinfo.json");
const SAMPLE_PATH = path.resolve(
  here,
  "../../../samples/sample-calibration-job-known-2pl-testinfo.json"
);
const R_TWIN_PATH = path.resolve(
  here,
  "../../../r-backend/app/tests/fixtures/known-2pl-testinfo.json"
);

function loadKnown2plTestinfoFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
}

function logistic(z) {
  return 1 / (1 + Math.exp(-z));
}

function itemInformation(theta, item) {
  const a = item.a ?? 1;
  const b = item.b ?? 0;
  const c = item.c ?? 0;
  const p = c + (1 - c) * logistic(a * (theta - b));
  const safeP = Math.max(Math.min(p, 1 - 1e-12), 1e-12);
  const q = 1 - safeP;
  const L = (safeP - c) / (1 - c || 1);
  return a * a * (q / safeP) * (L * L);
}

function testInformation(theta, items) {
  return items.reduce((sum, item) => sum + itemInformation(theta, item), 0);
}

function kr20(matrix) {
  const k = matrix[0]?.length ?? 0;
  if (k < 2) return NaN;
  const n = matrix.length;
  const p = Array.from({ length: k }, (_, j) => matrix.reduce((s, row) => s + row[j], 0) / n);
  const totals = matrix.map((row) => row.reduce((a, b) => a + b, 0));
  const meanT = totals.reduce((a, b) => a + b, 0) / n;
  const varT = totals.reduce((s, t) => s + (t - meanT) ** 2, 0) / (n - 1);
  if (!(varT > 0)) return NaN;
  const sumPQ = p.reduce((s, pj) => s + pj * (1 - pj), 0);
  return (k / (k - 1)) * (1 - sumPQ / varT);
}

function buildTestInformationCurve(parametersById, { thetaMin = -3, thetaMax = 3, thetaStep = 0.1 } = {}) {
  const items = Object.entries(parametersById).map(([id, p]) => ({
    id,
    a: p.a,
    b: p.b,
    c: p.c ?? 0,
  }));
  const theta = [];
  for (let t = thetaMin; t <= thetaMax + 1e-12; t += thetaStep) {
    theta.push(Number(t.toFixed(10)));
  }
  for (const cp of [-1, 0, 1]) {
    if (!theta.some((t) => Math.abs(t - cp) < 1e-12)) theta.push(cp);
  }
  theta.sort((a, b) => a - b);

  const information = theta.map((th) => testInformation(th, items));
  const conditionalSEM = information.map((ii) =>
    Number.isFinite(ii) && ii >= 1e-12 ? 1 / Math.sqrt(ii) : null
  );
  const checkpoints = {};
  for (const cp of [-1, 0, 1]) {
    const idx = theta.findIndex((t) => Math.abs(t - cp) < 1e-12);
    const ii = information[idx];
    checkpoints[String(cp)] = {
      information: ii,
      conditionalSEM: Number.isFinite(ii) && ii >= 1e-12 ? 1 / Math.sqrt(ii) : null,
    };
  }
  return { theta, information, conditionalSEM, checkpoints, sourceParameters: parametersById };
}

const dbState = { current: {} };
vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: () => dbState.current,
  saveDB: (next) => {
    dbState.current = next;
  },
}));

async function jobsApp() {
  const { default: router } = await import("../../routes/calibrationJobsRoutes.js");
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/api/calibrationJobs", router);
  return app;
}

function seedDb() {
  dbState.current = {
    calibrationJobs: [],
    analysisArtefacts: [],
    questions: [{ id: "q1", metadata: {} }],
    evidenceModels: [
      {
        id: "em-irt",
        competencyId: "c1",
        statisticalModels: [
          { id: "sm-irt", type: "irt", subtype: "2PL", active: true, parameterSets: [] },
        ],
      },
    ],
    competencies: [{ id: "c1", modelId: "cm1", variableType: "continuous" }],
  };
}

function known2plFormulaStub(jobId) {
  const fix = loadKnown2plTestinfoFixture();
  const curve = buildTestInformationCurve(fix.parameters);
  const matrix = fix.responseMatrix.data;
  return {
    contractVersion: CALIBRATION_CONTRACT_VERSION,
    jobId,
    converged: true,
    packageVersion: "analytic-2PL Fisher (contract formula path)",
    sampleSize: matrix.length,
    calibratedAt: "2026-09-16T00:00:00Z",
    parameters: {
      theta: curve.theta,
      information: curve.information,
      conditionalSEM: curve.conditionalSEM,
      sourceParameters: fix.parameters,
      checkpoints: curve.checkpoints,
    },
    fitStatistics: {
      kr20: kr20(matrix),
      nItems: fix.itemIds.length,
      nPersons: matrix.length,
    },
    diagnostics: {
      note: "D78 contract-path formula stub. Live R owns the same analytic Fisher on known parameters.",
      method: "analytic-2PL-Fisher (irtEngine.js parity)",
      formula:
        "I(θ)=Σ a²P(1−P) when c=0; matches irtEngine.js itemInformation / testInformation.",
      authority:
        "Operational IRT readiness and activeParameterSetId come only from irt-parameters → parameterSets. test-information writes analysisArtefacts and informs only.",
      reliabilityNote:
        "fitStatistics.kr20 is classical KR-20 on the response matrix (same as ctt-statistics / item-analysis). I(θ) and marginalReliability are IRT quantities.",
      knownParameterPath: true,
    },
  };
}

beforeEach(() => {
  seedDb();
});

describe("known-2pl-testinfo fixture commits hand-verified I(θ)", () => {
  it("ships twin JSON under server/r and r-backend tests", () => {
    const nodeFix = loadKnown2plTestinfoFixture();
    expect(fs.existsSync(R_TWIN_PATH)).toBe(true);
    const twin = JSON.parse(fs.readFileSync(R_TWIN_PATH, "utf8"));
    expect(twin.handInformation).toEqual(nodeFix.handInformation);
    expect(twin.parameters).toEqual(nodeFix.parameters);
  });

  it("handInformation matches analytic Fisher at −1, 0, 1 (≥6 dp)", () => {
    const fix = loadKnown2plTestinfoFixture();
    const items = Object.entries(fix.parameters).map(([id, p]) => ({ id, ...p }));
    for (const key of ["-1", "0", "1"]) {
      const th = Number(key);
      const computed = testInformation(th, items);
      expect(computed).toBeCloseTo(fix.handInformation[key], 6);
      expect(String(fix.handInformation[key])).toMatch(/\.\d{6,}/);
    }
  });

  it("handKr20 matches JS KR-20 on the committed matrix", () => {
    const fix = loadKnown2plTestinfoFixture();
    expect(kr20(fix.responseMatrix.data)).toBeCloseTo(fix.handKr20, 6);
  });

  it("builds an ADR 0002 test-information request the contract accepts", () => {
    const body = applyNamedCalibrationFixture({ fixture: "known-2pl-testinfo" }).request;
    expect(validateCalibrationRequest(body)).toEqual([]);
    expect(body.model.family).toBe("test-information");
    expect(body.model.parameters["Item.A"]).toEqual({ a: 1, b: 0, c: 0 });
    expect(body.options.sourceParameters["Item.B"].a).toBe(1.5);
  });

  it("keeps the committed sample job body in lockstep with the fixture name", () => {
    const sample = JSON.parse(fs.readFileSync(SAMPLE_PATH, "utf8"));
    expect(sample.fixture).toBe("known-2pl-testinfo");
    expect(sample.kind).toBe("test-information");
  });

  it("refuses known-2pl-testinfo bound to a DINA statistical model", async () => {
    dbState.current.evidenceModels[0].statisticalModels.push({
      id: "sm-dina",
      type: "dina",
      active: true,
      parameterSets: [],
    });
    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "test-information",
        fixture: "known-2pl-testinfo",
        evidenceModelId: "em-irt",
        statisticalModelId: "sm-dina",
      });
    expect(enqueue.status).toBe(400);
    expect(JSON.stringify(enqueue.body)).toMatch(/does not apply to statistical model type/);
  });
});

describe("known-2pl-testinfo contract-path pipeline (always runs)", () => {
  it("enqueues, processes via formula stub, ingests analysis artefact with hand checkpoints", async () => {
    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "test-information",
        fixture: "known-2pl-testinfo",
        evidenceModelId: "em-irt",
        statisticalModelId: "sm-irt",
      });

    expect(enqueue.status).toBe(201);
    expect(enqueue.body.status).toBe("queued");
    expect(enqueue.body.kind).toBe("test-information");
    expect(enqueue.body.request.model.family).toBe("test-information");
    expect(enqueue.body.request.responseMatrix.data).toHaveLength(10);

    const jobId = enqueue.body.id;
    const stub = known2plFormulaStub(jobId);
    const processed = await processJobById(jobId, {
      client: { postCalibration: async () => ({ ok: true, status: 200, json: stub, text: "" }) },
    });

    expect(processed.ok).toBe(true);
    expect(processed.job.status).toBe("succeeded");
    expect(processed.job.response.converged).toBe(true);

    const fix = loadKnown2plTestinfoFixture();
    for (const key of ["-1", "0", "1"]) {
      expect(stub.parameters.checkpoints[key].information).toBeCloseTo(
        fix.handInformation[key],
        6
      );
    }
    expect(stub.fitStatistics.kr20).toBeCloseTo(fix.handKr20, 6);

    const ingested = await request(app)
      .post(`/api/calibrationJobs/${jobId}/ingest`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);

    expect(ingested.status).toBe(200);
    expect(ingested.body.parameterSet).toBeNull();
    const artefact = ingested.body.analysisArtefact;
    expect(artefact.calibrationJobId).toBe(jobId);
    expect(artefact.kind).toBe("test-information");
    expect(artefact.parameters.checkpoints["-1"].information).toBeCloseTo(
      fix.handInformation["-1"],
      6
    );
    expect(artefact.parameters.checkpoints["0"].information).toBeCloseTo(
      fix.handInformation["0"],
      6
    );
    expect(artefact.parameters.checkpoints["1"].information).toBeCloseTo(
      fix.handInformation["1"],
      6
    );
    expect(artefact.fitStatistics.kr20).toBeCloseTo(fix.handKr20, 6);

    const diag = JSON.stringify(artefact.diagnostics || {});
    expect(diag).toMatch(/authority/i);
    expect(diag).toMatch(/reliability/i);
    expect(diag).toMatch(/Fisher|irtEngine|formula/i);

    expect(dbState.current.analysisArtefacts).toHaveLength(1);
    expect(dbState.current.calibrationJobs[0].ingestedAnalysisArtefactId).toBe(
      artefact.analysisArtefactId || artefact.id
    );
    expect(dbState.current.evidenceModels[0].analysisArtefacts || []).toHaveLength(0);
    expect(dbState.current.evidenceModels[0].statisticalModels[0].parameterSets).toHaveLength(0);
    expect(dbState.current.questions[0].metadata).toEqual({});
  });

  it("refuses artefact ingest when test-information converged is false", async () => {
    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "test-information",
        fixture: "known-2pl-testinfo",
        evidenceModelId: "em-irt",
        statisticalModelId: "sm-irt",
      });
    expect(enqueue.status).toBe(201);

    const jobId = enqueue.body.id;
    const stub = {
      contractVersion: CALIBRATION_CONTRACT_VERSION,
      jobId,
      converged: false,
      error: {
        message: "Test information curve was not identified",
        rClass: "NotConverged",
        stderr: "",
      },
    };
    await processJobById(jobId, {
      client: { postCalibration: async () => ({ ok: true, status: 200, json: stub, text: "" }) },
    });

    const ingested = await request(app)
      .post(`/api/calibrationJobs/${jobId}/ingest`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(ingested.status).toBe(409);
    expect(ingested.body.error).toMatch(/converged: false/);
    expect(dbState.current.analysisArtefacts || []).toHaveLength(0);
    expect(dbState.current.evidenceModels[0].analysisArtefacts || []).toHaveLength(0);
  });
});

describe("lsat7-test-information fixture (structural)", () => {
  it("is the published LSAT7 matrix under family test-information", () => {
    const body = applyNamedCalibrationFixture({ fixture: "lsat7-test-information" }).request;
    expect(validateCalibrationRequest(body)).toEqual([]);
    expect(body.model.family).toBe("test-information");
    expect(body.responseMatrix.data).toHaveLength(1000);
    expect(body.model.parameters).toBeUndefined();
  });
});

const live = Boolean(process.env.R_BACKEND_URL);

describe.skipIf(!live)("known-2pl-testinfo live R pipeline", () => {
  it("health then enqueue → process → artefact ingest with hand I(θ) checkpoints", async () => {
    const health = await getRHealth({ timeoutMs: 15_000 });
    expect(health.ok, health.text || health.error?.message).toBe(true);
    expect(health.json?.status).toBe("healthy");

    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "test-information",
        fixture: "known-2pl-testinfo",
        evidenceModelId: "em-irt",
        statisticalModelId: "sm-irt",
      });
    expect(enqueue.status).toBe(201);

    const jobId = enqueue.body.id;
    const processed = await processJobById(jobId, {
      client: { postCalibration },
    });

    const fix = loadKnown2plTestinfoFixture();
    const parameters = processed.job?.response?.parameters || {};
    const liveDump = JSON.stringify(
      {
        ok: processed.ok,
        status: processed.job?.status,
        error: processed.job?.error || processed.error,
        responseError: processed.job?.response?.error,
        converged: processed.job?.response?.converged,
        packageVersion: processed.job?.response?.packageVersion,
        checkpoints: parameters.checkpoints,
        fitStatistics: processed.job?.response?.fitStatistics,
        diagnostics: processed.job?.response?.diagnostics,
      },
      null,
      2
    );
    // eslint-disable-next-line no-console
    console.log("known-2pl-testinfo live process", liveDump);

    expect(processed.ok, liveDump).toBe(true);
    const job = processed.job;
    expect(job.status, liveDump).toBe("succeeded");
    expect(job.response.converged, liveDump).toBe(true);
    expect(job.response.packageVersion).toMatch(/analytic-2PL|mirt /);
    expect(job.response.jobId).toBe(jobId);

    for (const key of ["-1", "0", "1"]) {
      expect(parameters.checkpoints[key].information).toBeCloseTo(fix.handInformation[key], 6);
    }
    expect(job.response.fitStatistics.kr20).toBeCloseTo(fix.handKr20, 6);
    expect(job.response.fitStatistics.kr20).toBeCloseTo(kr20(fix.responseMatrix.data), 6);

    const diag = job.response.diagnostics || {};
    expect(JSON.stringify(diag)).toMatch(/authority/i);
    expect(JSON.stringify(diag)).toMatch(/reliability/i);
    expect(JSON.stringify(diag)).toMatch(/Fisher|irtEngine|formula/i);

    const ingested = await request(app)
      .post(`/api/calibrationJobs/${jobId}/ingest`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(ingested.status).toBe(200);
    expect(ingested.body.parameterSet).toBeNull();
    expect(ingested.body.analysisArtefact.calibrationJobId).toBe(jobId);
    expect(dbState.current.analysisArtefacts).toHaveLength(1);
    expect(dbState.current.evidenceModels[0].analysisArtefacts || []).toHaveLength(0);
    expect(dbState.current.evidenceModels[0].statisticalModels[0].parameterSets).toHaveLength(0);
  }, 180_000);
});

describe.skipIf(!live)("lsat7-test-information live R structural path", () => {
  it("fits mirt then returns info>0 and KR-20 matching JS on the same matrix", async () => {
    const health = await getRHealth({ timeoutMs: 15_000 });
    expect(health.ok).toBe(true);
    expect(health.json?.packages?.mirt).toBeTruthy();

    const expanded = applyNamedCalibrationFixture({ fixture: "lsat7-test-information" });
    const expectedKr20 = kr20(expanded.request.responseMatrix.data);

    const app = await jobsApp();
    const enqueue = await request(app)
      .post("/api/calibrationJobs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        kind: "test-information",
        fixture: "lsat7-test-information",
        evidenceModelId: "em-irt",
        statisticalModelId: "sm-irt",
      });
    expect(enqueue.status).toBe(201);

    const jobId = enqueue.body.id;
    const processed = await processJobById(jobId, {
      client: { postCalibration },
    });

    const liveDump = JSON.stringify(
      {
        ok: processed.ok,
        status: processed.job?.status,
        error: processed.job?.error || processed.error,
        responseError: processed.job?.response?.error,
        converged: processed.job?.response?.converged,
        packageVersion: processed.job?.response?.packageVersion,
        checkpoints: processed.job?.response?.parameters?.checkpoints,
        fitStatistics: processed.job?.response?.fitStatistics,
      },
      null,
      2
    );
    // eslint-disable-next-line no-console
    console.log("lsat7-test-information live process", liveDump);

    expect(processed.ok, liveDump).toBe(true);
    expect(processed.job.response.converged, liveDump).toBe(true);
    expect(processed.job.response.packageVersion).toMatch(/^mirt /);
    expect(processed.job.response.sampleSize).toBe(1000);

    const cps = processed.job.response.parameters.checkpoints;
    for (const key of ["-1", "0", "1"]) {
      expect(cps[key].information).toBeGreaterThan(0);
    }
    expect(processed.job.response.fitStatistics.kr20).toBeCloseTo(expectedKr20, 6);

    const diag = JSON.stringify(processed.job.response.diagnostics || {});
    expect(diag).toMatch(/authority/i);
    expect(diag).toMatch(/reliability/i);
  }, 300_000);
});
