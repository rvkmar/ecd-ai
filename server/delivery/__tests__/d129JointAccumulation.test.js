// server/delivery/__tests__/d129JointAccumulation.test.js
//
// D129: correlated continuous SMVs. Hand grid, zero-correlation identity,
// reproducibility from the same responses.

import { describe, it, expect } from "vitest";
import { accumulateEvidence, applyPosteriorsToSession, __testing__ } from "../evidenceAccumulation.js";
import { estimateBivariateJoint } from "../jointContinuousAccumulation.js";

const { itemProbability } = __testing__;

function continuous(id) {
  return {
    id,
    label: id,
    type: "continuous",
    scale: { min: -4, max: 4 },
    priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } },
  };
}

function dbWithJoint(jointPrior) {
  return {
    competencyModels: [{
      id: "cm1",
      versionNumber: 1,
      smVariables: [continuous("theta-a"), continuous("theta-b")],
      jointPrior,
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
          parameters: { o1: { a: 1, b: 0 } },
          packageVersion: "pilot-1",
          converged: true,
          sampleSize: 500,
          calibratedAt: "2026-01-01T00:00:00.000Z",
        }],
        activeParameterSetId: "ps1",
      }],
    }],
  };
}

function response(overrides = {}) {
  return {
    taskId: "t1",
    itemId: "item1",
    evidenceModelId: "em1",
    parameterSetId: "ps1",
    observationId: "o1",
    observableId: "o1",
    activated: true,
    direction: "supports",
    strength: 4,
    ...overrides,
  };
}

describe("estimateBivariateJoint — hand-computed 3×3 fixture", () => {
  it("matches the cell-by-cell EAP for one correct Rasch item and ρ = 0.5", () => {
    // Grid: θA, θB ∈ {-1, 0, 1}
    // Prior: MVN(0, Σ), Σ = [[1, 0.5], [0.5, 1]], det = 0.75
    // Item: Rasch b = 0, u = 1, likelihood depends on θA only
    //   P(-1) = 1/(1+e)   = 0.2689414214
    //   P( 0) = 0.5
    //   P( 1) = 1/(1+e^-1) = 0.7310585786
    //
    // Posterior mass on the nine nodes (prior density × likelihood,
    // recentred in log space, renormalised), written out before this
    // module existed:
    //   (-1,-1) 0.0634675389   (-1, 0) 0.0634675389   (-1, 1) 0.0167298616
    //   ( 0,-1) 0.1179950983   ( 0, 0) 0.2298230697   ( 0, 1) 0.1179950983
    //   ( 1,-1) 0.0454764788   ( 1, 0) 0.1725226577   ( 1, 1) 0.1725226577
    //
    // E[θA] = Σ θA · mass = 0.24685685482774727
    // E[θB] = Σ θB · mass = 0.08030850159239328
    // A sign error on the covariance swaps the (1,-1) and (1,1) masses
    // and pulls θB the wrong way.
    const result = estimateBivariateJoint({
      scoredObservations: [{ u: 1, params: { a: 1, b: 0 } }],
      itemProbability,
      mean: [0, 0],
      covariance: [
        [1, 0.5],
        [0.5, 1],
      ],
      nodes: [-1, 0, 1],
    });

    expect(result.measured.estimate).toBeCloseTo(0.24685685482774727, 12);
    expect(result.partner.estimate).toBeCloseTo(0.08030850159239328, 12);
  });

  it("flips the partner when the covariance sign flips, on the same grid", () => {
    const negative = estimateBivariateJoint({
      scoredObservations: [{ u: 1, params: { a: 1, b: 0 } }],
      itemProbability,
      mean: [0, 0],
      covariance: [
        [1, -0.5],
        [-0.5, 1],
      ],
      nodes: [-1, 0, 1],
    });
    expect(negative.partner.estimate).toBeCloseTo(-0.08030850159239328, 12);
  });

  it("at zero covariance the measured margin matches a one-dimensional sum on the same nodes", () => {
    const joint = estimateBivariateJoint({
      scoredObservations: [{ u: 1, params: { a: 1, b: 0 } }],
      itemProbability,
      mean: [0, 0],
      covariance: [
        [1, 0],
        [0, 1],
      ],
      nodes: [-1, 0, 1],
    });

    const nodes = [-1, 0, 1];
    const logPhi = nodes.map((x) => -0.5 * x * x - 0.5 * Math.log(2 * Math.PI));
    const logLik = nodes.map((theta) => {
      const p = itemProbability(theta, { a: 1, b: 0 });
      return Math.log(p);
    });
    let max = -Infinity;
    const lj = logPhi.map((lp, i) => {
      const v = lp + logLik[i];
      if (v > max) max = v;
      return v;
    });
    const w = lj.map((v) => Math.exp(v - max));
    const total = w.reduce((a, b) => a + b, 0);
    const eap = nodes.reduce((acc, theta, i) => acc + theta * (w[i] / total), 0);

    expect(joint.measured.estimate).toBeCloseTo(eap, 12);
    expect(joint.partner.estimate).toBeCloseTo(0, 12);
  });
});

describe("accumulateEvidence — D129 joint dispatch", () => {
  const correlated = {
    family: "multivariate_normal",
    parameterization: "covariance",
    smvIds: ["theta-a", "theta-b"],
    matrix: [
      [1, 0.6],
      [0.6, 1],
    ],
  };

  it("moves the unmeasured partner in the covariance's direction", () => {
    const up = accumulateEvidence(
      { id: "s1", status: "in_progress", responses: [response()] },
      dbWithJoint(correlated)
    );
    const byId = Object.fromEntries(up.posteriors.map((p) => [p.smvId, p]));

    expect(up.warnings).toEqual([]);
    expect(byId["theta-a"].supported).toBe(true);
    expect(byId["theta-b"].supported).toBe(true);
    expect(byId["theta-a"].method).toBe("eap-joint");
    expect(byId["theta-a"].jointRole).toBe("measured");
    expect(byId["theta-b"].jointRole).toBe("correlated");
    expect(byId["theta-a"].estimate).toBeGreaterThan(0);
    expect(byId["theta-b"].estimate).toBeGreaterThan(0);
    expect(byId["theta-b"].estimate).toBeLessThan(byId["theta-a"].estimate);

    const down = accumulateEvidence(
      { id: "s1", status: "in_progress", responses: [response({ activated: false })] },
      dbWithJoint({
        ...correlated,
        matrix: [
          [1, -0.6],
          [-0.6, 1],
        ],
      })
    );
    const wrong = Object.fromEntries(down.posteriors.map((p) => [p.smvId, p]));
    expect(wrong["theta-a"].estimate).toBeLessThan(0);
    expect(wrong["theta-b"].estimate).toBeGreaterThan(0);
  });

  it("a zero-correlation joint prior is byte-identical to the independent path", () => {
    const independentDb = dbWithJoint(undefined);
    delete independentDb.competencyModels[0].jointPrior;

    const diagonal = dbWithJoint({
      family: "multivariate_normal",
      parameterization: "covariance",
      smvIds: ["theta-a", "theta-b"],
      matrix: [
        [1, 0],
        [0, 1],
      ],
    });

    const session = { id: "s1", status: "in_progress", responses: [response()] };
    const alone = accumulateEvidence(session, independentDb);
    const zero = accumulateEvidence(session, diagonal);

    expect(zero.posteriors).toHaveLength(1);
    expect(zero.posteriors[0].smvId).toBe("theta-a");
    expect(zero.posteriors[0].method).toBe("eap");
    expect(zero.posteriors[0].estimate).toBe(alone.posteriors[0].estimate);
    expect(zero.posteriors[0].precision).toBe(alone.posteriors[0].precision);
    expect(zero.posteriors[0].responsesUsed).toBe(alone.posteriors[0].responsesUsed);
  });

  it("reproduces from the stored responses, including after the active parameter set changes", () => {
    const db = dbWithJoint(correlated);
    const session = { id: "s1", status: "in_progress", responses: [response()] };
    const first = accumulateEvidence(session, db);
    const second = accumulateEvidence(session, db);
    expect(second.posteriors.map((p) => p.estimate)).toEqual(first.posteriors.map((p) => p.estimate));

    const sm = db.evidenceModels[0].statisticalModels[0];
    sm.parameterSets.push({
      parameterSetId: "ps2",
      parameters: { o1: { a: 3, b: -2.5 } },
      packageVersion: "pilot-2",
      converged: true,
      sampleSize: 900,
      calibratedAt: "2026-06-01T00:00:00.000Z",
    });
    sm.activeParameterSetId = "ps2";

    const after = accumulateEvidence(session, db);
    expect(after.posteriors.map((p) => p.estimate)).toEqual(first.posteriors.map((p) => p.estimate));
  });

  it("persists both marginals on the session", () => {
    const session = { id: "s1", status: "in_progress", responses: [response()] };
    const accumulation = accumulateEvidence(session, dbWithJoint(correlated));
    applyPosteriorsToSession(session, accumulation, { now: "2026-10-13T00:00:00.000Z" });

    expect(session.studentModel.smvPosteriors["theta-a"].estimate).toBeGreaterThan(0);
    expect(session.studentModel.smvPosteriors["theta-b"].estimate).toBeGreaterThan(0);
    expect(session.studentModel.smvPosteriors["theta-a"].method).toBe("eap-joint");
    expect(session.studentModel.smvPosteriors["theta-b"].method).toBe("eap-joint");
  });

  it("refuses a measured SMV correlated with two partners", () => {
    const db = dbWithJoint({
      family: "multivariate_normal",
      parameterization: "covariance",
      smvIds: ["theta-a", "theta-b", "theta-c"],
      matrix: [
        [1, 0.4, 0.4],
        [0.4, 1, 0],
        [0.4, 0, 1],
      ],
    });
    db.competencyModels[0].smVariables.push(continuous("theta-c"));

    const { posteriors } = accumulateEvidence(
      { id: "s1", status: "in_progress", responses: [response()] },
      db
    );
    expect(posteriors[0].supported).toBe(false);
    expect(posteriors[0].reason).toMatch(/correlated with 2 other/);
    expect(posteriors[0]).not.toHaveProperty("estimate");
  });
});
