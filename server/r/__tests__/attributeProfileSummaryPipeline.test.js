// server/r/__tests__/attributeProfileSummaryPipeline.test.js
// D79: known attribute-profile cohort → Node aggregate → analysisArtefacts.
//
// Exit check: seeded cohort with known profiles produces the expected
// mastery rates; probability-averaged and classification-counted figures
// are both present and labelled. Not an R path; not population CA.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";
import { processJobById } from "../calibrationWorker.js";
import { applyNamedCalibrationFixture } from "../calibrationFixtures.js";
import { validateCalibrationRequest, rPathForJobKind } from "../calibrationContract.js";
import { __testing__ as cohortFix } from "../knownAttributeProfileCohortFixture.js";
import {
  ATTRIBUTE_PROFILE_SUMMARY_KIND,
  runAttributeProfileSummaryJob,
} from "../../delivery/attributeProfileCohortSummary.js";
import { classifyAttributeProfile } from "../../delivery/attributeClassification.js";
import { CALIBRATION_CONTRACT_VERSION } from "../calibrationContract.js";

const PACKAGE_VERSION = "ecd-node attribute-profile-summary 1.0";

const { KNOWN_ATTRIBUTE_PROFILE_COHORT_EXPECTED, knownAttributeProfileCohortMembers } = cohortFix;

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
        id: "em-dina",
        competencyId: "c1",
        statisticalModels: [{ id: "sm-dina", type: "dina", active: true, parameterSets: [] }],
      },
    ],
    competencies: [{ id: "c1", modelId: "cm1", variableType: "binary" }],
  };
}

beforeEach(() => {
  seedDb();
});

describe("D79 attribute-profile cohort summary — pure aggregate", () => {
  it("matches hand-verified rates and labels both estimands", () => {
    const result = runAttributeProfileSummaryJob({
      contractVersion: CALIBRATION_CONTRACT_VERSION,
      jobId: "job-hand",
      model: { family: "attribute-profile", attributeIds: ["attrA", "attrB"] },
      cohort: { id: "c", members: knownAttributeProfileCohortMembers() },
      options: { seed: 1, threshold: 0.5 },
    });
    expect(result.ok).toBe(true);
    const summary = result.json.parameters;
    const expected = KNOWN_ATTRIBUTE_PROFILE_COHORT_EXPECTED;

    expect(result.json.sampleSize).toBe(expected.nPersons);
    expect(summary.masteryThreshold).toBe(0.5);

    for (const smvId of ["attrA", "attrB"]) {
      const got = summary.attributes[smvId];
      const want = expected.attributes[smvId];
      expect(got.probabilityAveragedMasteryRate).toBeCloseTo(
        want.probabilityAveragedMasteryRate,
        12
      );
      expect(got.classificationCountedMasteryRate).toBeCloseTo(
        want.classificationCountedMasteryRate,
        12
      );
      expect(got.nMaster).toBe(want.nMaster);
      expect(got.nNonmaster).toBe(want.nNonmaster);
      expect(got.nIndeterminate).toBe(want.nIndeterminate);
      expect(got.nAssigned).toBe(want.nAssigned);
      expect(got.meanExpectedClassificationAccuracy).toBeCloseTo(
        want.meanExpectedClassificationAccuracy,
        12
      );
    }

    expect(summary.profileDistribution).toEqual(expected.profileDistribution);
    expect(result.json.diagnostics.estimandNotes.probabilityAveragedMasteryRate).toMatch(
      /Not a classification rate/
    );
    expect(result.json.diagnostics.estimandNotes.classificationCountedMasteryRate).toMatch(
      /Not a mean probability/
    );
    expect(result.json.diagnostics.estimandNotes.meanExpectedClassificationAccuracy).toMatch(
      /NOT the population/
    );
  });

  it("disagrees when probability average and classification count answer different questions", () => {
    const result = runAttributeProfileSummaryJob({
      contractVersion: CALIBRATION_CONTRACT_VERSION,
      jobId: "job-hand",
      model: { family: "attribute-profile", attributeIds: ["attrA", "attrB"] },
      cohort: { id: "c", members: knownAttributeProfileCohortMembers() },
      options: { seed: 1, threshold: 0.5 },
    });
    const attrs = result.json.parameters.attributes;
    expect(attrs.attrA.probabilityAveragedMasteryRate).not.toBeCloseTo(
      attrs.attrA.classificationCountedMasteryRate,
      5
    );
  });

  it("recomputes through classifyAttributeProfile (no stored labels)", () => {
    const member = knownAttributeProfileCohortMembers()[0];
    const profile = classifyAttributeProfile(member.posteriors);
    expect(profile.map((r) => r.classification)).toEqual(["master", "master"]);
  });
});

describe("D79 attribute-profile cohort summary — enqueue → process → ingest", () => {
  it("has no R path (Node-only)", () => {
    expect(rPathForJobKind("attribute-profile-summary")).toBeNull();
  });

  it("named fixture validates and carries tenancy scope fields", () => {
    const expanded = applyNamedCalibrationFixture(
      {
        fixture: "known-attribute-profile-cohort",
        evidenceModelId: "em-dina",
        statisticalModelId: "sm-dina",
        kind: "attribute-profile-summary",
      },
      dbState.current
    );
    expect(expanded.kind).toBe("attribute-profile-summary");
    expect(expanded.request.model.family).toBe("attribute-profile");
    expect(expanded.request.cohort.members).toHaveLength(4);
    expect(expanded.request.scope).toMatchObject({
      tenantId: "tenant-demo",
      districtId: "district-demo",
      schoolId: "school-demo",
      cohortId: "cohort-known-d79",
    });
    const errors = validateCalibrationRequest({
      ...expanded.request,
      jobId: "job-test",
    });
    expect(errors).toEqual([]);
  });

  it("pipeline writes an immutable analysisArtefact with both labelled rates", async () => {
    const app = await jobsApp();
    const auth = { Authorization: `Bearer ${tokenFor("admin")}` };

    const enqueue = await request(app)
      .post("/api/calibrationJobs")
      .set(auth)
      .send({
        fixture: "known-attribute-profile-cohort",
        evidenceModelId: "em-dina",
        statisticalModelId: "sm-dina",
        kind: "attribute-profile-summary",
      });
    expect(enqueue.status).toBe(201);
    expect(enqueue.body.kind).toBe("attribute-profile-summary");
    expect(enqueue.body.status).toBe("queued");

    const processed = await processJobById(enqueue.body.id);
    expect(processed.ok).toBe(true);
    expect(processed.job.status).toBe("succeeded");
    expect(processed.job.response.packageVersion).toBe(PACKAGE_VERSION);
    expect(processed.job.response.diagnostics.estimandNotes.probabilityAveragedMasteryRate).toBeTruthy();
    expect(processed.job.response.diagnostics.estimandNotes.classificationCountedMasteryRate).toBeTruthy();

    const attrs = processed.job.response.parameters.attributes;
    expect(attrs.attrA.probabilityAveragedMasteryRate).toBeCloseTo(0.6, 12);
    expect(attrs.attrA.classificationCountedMasteryRate).toBeCloseTo(2 / 3, 12);
    expect(attrs.attrB.probabilityAveragedMasteryRate).toBeCloseTo(0.475, 12);
    expect(attrs.attrB.classificationCountedMasteryRate).toBeCloseTo(0.5, 12);

    const ingest = await request(app)
      .post(`/api/calibrationJobs/${enqueue.body.id}/ingest`)
      .set(auth);
    expect(ingest.status).toBe(200);
    expect(ingest.body.parameterSet).toBeNull();
    expect(ingest.body.analysisArtefact.kind).toBe("attribute-profile-summary");
    expect(ingest.body.analysisArtefact.scope).toMatchObject({
      evidenceModelId: "em-dina",
      cohort: "cohort-known-d79",
      tenantId: "tenant-demo",
      districtId: "district-demo",
      schoolId: "school-demo",
    });
    expect(dbState.current.analysisArtefacts).toHaveLength(1);
    expect(dbState.current.evidenceModels[0].analysisArtefacts || []).toHaveLength(0);
    expect(dbState.current.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBeUndefined();

    const payload = dbState.current.analysisArtefacts[0].payload;
    expect(payload.parameters.attributes.attrA.probabilityAveragedMasteryRate).toBeCloseTo(0.6, 12);
    expect(payload.parameters.attributes.attrA.classificationCountedMasteryRate).toBeCloseTo(
      2 / 3,
      12
    );
    expect(payload.diagnostics.estimandNotes.meanExpectedClassificationAccuracy).toMatch(
      /NOT the population/
    );
  });
});
