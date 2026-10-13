// D130: the joint grid must not report a truncated edge as a precise EAP.
// Oracle computed on a covering rectangle before the adaptive wrapper existed:
// 50 correct Rasch items, b = 3, MVN correlation 0.5 → E[θA] = 5.21986, sd = 0.43032.

import { describe, it, expect } from "vitest";
import { accumulateEvidence, applyPosteriorsToSession, __testing__ } from "../evidenceAccumulation.js";
import { estimateJointContinuousPosterior } from "../jointContinuousAccumulation.js";
import { templateBindingErrors } from "../../../src/utils/schema.js";

const { itemProbability } = __testing__;

const ORACLE_MEASURED = 5.219858596137851;
const ORACLE_PARTNER = 2.6099292947807435;
const ORACLE_MEASURED_SD = 0.43032141782373406;

function raschBurst(n, b) {
  return Array.from({ length: n }, () => ({ u: 1, params: { a: 1, b } }));
}

describe("D130 joint grid coverage", () => {
  it("matches a covering-grid EAP for a posterior past the initial ±5 rectangle", () => {
    const result = estimateJointContinuousPosterior({
      scoredObservations: raschBurst(50, 3),
      itemProbability,
      mean: [0, 0],
      covariance: [
        [1, 0.5],
        [0.5, 1],
      ],
    });

    expect(result.boundaryLimited).toBe(false);
    expect(result.measured.estimate).toBeCloseTo(ORACLE_MEASURED, 2);
    expect(result.partner.estimate).toBeCloseTo(ORACLE_PARTNER, 2);
    expect(result.measured.sd).toBeCloseTo(ORACLE_MEASURED_SD, 2);
    expect(result.measured.sd).toBeGreaterThan(0.35);
  });

  it("persists that covering posterior for both SMVs, and reproduces it from the same responses", () => {
    const db = {
      competencyModels: [{
        id: "cm1",
        versionNumber: 1,
        smVariables: ["theta-a", "theta-b"].map((id) => ({
          id,
          label: id,
          type: "continuous",
          scale: { min: -4, max: 4 },
          priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } },
        })),
        jointPrior: {
          family: "multivariate_normal",
          parameterization: "covariance",
          smvIds: ["theta-a", "theta-b"],
          matrix: [
            [1, 0.5],
            [0.5, 1],
          ],
        },
      }],
      competencies: [{ id: "c1", modelId: "cm1" }],
      evidenceModels: [{
        id: "em1",
        competencyId: "c1",
        versionNumber: 1,
        observables: [{ id: "o1", evidenceRule: { direction: "supports", strengthLevel: 4 } }],
        statisticalModels: [{
          id: "sm1",
          type: "irt",
          active: true,
          structureConfig: { smvId: "theta-a" },
          parameterSets: [{
            parameterSetId: "ps1",
            parameters: { o1: { a: 1, b: 3 } },
            packageVersion: "pilot-1",
            converged: true,
            sampleSize: 500,
            calibratedAt: "2026-01-01T00:00:00.000Z",
          }],
          activeParameterSetId: "ps1",
        }],
      }],
    };

    const session = {
      id: "s1",
      status: "in_progress",
      responses: Array.from({ length: 50 }, (_, i) => ({
        taskId: `t${i}`,
        itemId: `item${i}`,
        evidenceModelId: "em1",
        parameterSetId: "ps1",
        observationId: "o1",
        observableId: "o1",
        activated: true,
        direction: "supports",
        strength: 4,
      })),
    };

    const first = accumulateEvidence(session, db);
    const second = accumulateEvidence(session, db);
    const byId = Object.fromEntries(first.posteriors.map((p) => [p.smvId, p]));

    expect(byId["theta-a"].supported).toBe(true);
    expect(byId["theta-a"].boundaryLimited).toBe(false);
    expect(byId["theta-a"].estimate).toBeCloseTo(ORACLE_MEASURED, 2);
    expect(byId["theta-b"].estimate).toBeCloseTo(ORACLE_PARTNER, 2);
    expect(byId["theta-b"].jointRole).toBe("correlated");
    expect(second.posteriors.map((p) => p.estimate)).toEqual(first.posteriors.map((p) => p.estimate));
  });

  it("drops a persisted joint posterior once a second Evidence Model targets the partner", () => {
    const continuous = (id) => ({
      id,
      label: id,
      type: "continuous",
      scale: { min: -4, max: 4 },
      priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } },
    });
    const statistical = (id, observableId, smvId) => ({
      id,
      type: "irt",
      active: true,
      structureConfig: { smvId },
      parameterSets: [{
        parameterSetId: "ps1",
        parameters: { [observableId]: { a: 1, b: 0 } },
        packageVersion: "pilot-1",
        converged: true,
        sampleSize: 500,
        calibratedAt: "2026-01-01T00:00:00.000Z",
      }],
      activeParameterSetId: "ps1",
    });
    const db = {
      competencyModels: [{
        id: "cm1",
        versionNumber: 1,
        smVariables: [continuous("theta-a"), continuous("theta-b")],
        jointPrior: {
          family: "multivariate_normal",
          parameterization: "covariance",
          smvIds: ["theta-a", "theta-b"],
          matrix: [[1, 0.5], [0.5, 1]],
        },
      }],
      competencies: [{ id: "c1", modelId: "cm1" }],
      evidenceModels: [
        {
          id: "em1",
          competencyId: "c1",
          versionNumber: 1,
          observables: [{ id: "o1", evidenceRule: { direction: "supports", strengthLevel: 4 } }],
          statisticalModels: [statistical("sm1", "o1", "theta-a")],
        },
        {
          id: "em2",
          competencyId: "c1",
          versionNumber: 1,
          observables: [{ id: "o2", evidenceRule: { direction: "supports", strengthLevel: 4 } }],
          statisticalModels: [statistical("sm2", "o2", "theta-b")],
        },
      ],
    };
    const session = {
      id: "s1",
      status: "in_progress",
      responses: [{
        taskId: "t1",
        itemId: "item1",
        evidenceModelId: "em1",
        parameterSetId: "ps1",
        observationId: "o1",
        observableId: "o1",
        activated: true,
        direction: "supports",
        strength: 4,
      }],
    };

    applyPosteriorsToSession(session, accumulateEvidence(session, db), { now: "2026-10-13T00:00:00.000Z" });
    expect(session.studentModel.smvPosteriors["theta-b"].estimate).toBeGreaterThan(0);

    session.responses.push({
      taskId: "t2",
      itemId: "item2",
      evidenceModelId: "em2",
      parameterSetId: "ps1",
      observationId: "o2",
      observableId: "o2",
      activated: true,
      direction: "supports",
      strength: 4,
    });
    const collided = accumulateEvidence(session, db);
    expect(collided.posteriors.every((p) => p.supported === false)).toBe(true);
    applyPosteriorsToSession(session, collided, { now: "2026-10-13T00:01:00.000Z" });
    expect(session.studentModel.smvPosteriors["theta-a"]).toBeUndefined();
    expect(session.studentModel.smvPosteriors["theta-b"]).toBeUndefined();
  });
});

describe("D130 W26 gate — template bindings", () => {
  const db = {
    competencyModels: [{ id: "cm1" }],
    competencies: [{ id: "c1", modelId: "cm1" }],
    evidenceModels: [{ id: "em1", competencyId: "c1" }],
    taskModels: [
      { id: "tm1", evidenceModelIds: ["em1"] },
      { id: "tm2", evidenceModelIds: ["em1"] },
    ],
    presentationModels: [
      { id: "pm1", taskModelId: "tm1" },
      { id: "pm2", taskModelId: "tm2" },
    ],
  };

  it("accepts the four bindings when the Presentation Model belongs to the Task Model", () => {
    const errors = templateBindingErrors({
      competencyModelId: "cm1",
      evidenceModelId: "em1",
      taskModelId: "tm1",
      presentationModelId: "pm1",
    }, db, { requireAllBindings: true });
    expect(errors).toEqual([]);
  });

  it("refuses a Presentation Model bound to a different Task Model", () => {
    const errors = templateBindingErrors({
      competencyModelId: "cm1",
      evidenceModelId: "em1",
      taskModelId: "tm1",
      presentationModelId: "pm2",
    }, db, { requireAllBindings: true });
    expect(errors.some((e) => e.includes("presentationModelId") && e.includes("tm2"))).toBe(true);
  });
});
