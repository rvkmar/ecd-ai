// src/utils/__tests__/d128JointPrior.test.js
//
// D128: continuous joint prior schema — shape, defaults, PSD refusal.
// R10: one correlated partner is the design limit (confirm/strict).
// Scoring of that partner is D129 and is not reopened here.

import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";
import {
  defaultIndependentJointPrior,
  jointPriorErrors,
  jointPriorPartnerLimitErrors,
  isPositiveSemiDefinite,
} from "../jointPrior.js";

function continuous(id, sd = 1) {
  return {
    id,
    label: id,
    type: "continuous",
    scale: { min: -4, max: 4 },
    priorDistribution: { family: "normal", params: { mean: 0, sd } },
  };
}

function binary(id) {
  return {
    id,
    label: id,
    type: "binary",
    scale: { states: ["no", "yes"] },
    priorDistribution: { family: "bernoulli", params: { p: 0.5 } },
  };
}

function draftModel(overrides = {}) {
  return {
    id: "cm-joint",
    name: "Joint prior fixture",
    measurementIntent: "unidimensional",
    status: "draft",
    locked: false,
    versionNumber: 1,
    smVariables: [continuous("thetaA"), continuous("thetaB")],
    ...overrides,
  };
}

describe("isPositiveSemiDefinite", () => {
  it("accepts a diagonal covariance and a valid correlation", () => {
    expect(
      isPositiveSemiDefinite([
        [1, 0],
        [0, 4],
      ])
    ).toBe(true);
    expect(
      isPositiveSemiDefinite([
        [1, 0.5],
        [0.5, 1],
      ])
    ).toBe(true);
  });

  it("refuses an indefinite matrix", () => {
    expect(
      isPositiveSemiDefinite([
        [1, 2],
        [2, 1],
      ])
    ).toBe(false);
  });
});

describe("defaultIndependentJointPrior", () => {
  it("builds a diagonal covariance from continuous SMV sds", () => {
    const prior = defaultIndependentJointPrior([
      continuous("thetaA", 2),
      continuous("thetaB", 0.5),
      binary("attrA"),
    ]);
    expect(prior).toEqual({
      family: "multivariate_normal",
      parameterization: "covariance",
      smvIds: ["thetaA", "thetaB"],
      matrix: [
        [4, 0],
        [0, 0.25],
      ],
    });
  });

  it("returns null when fewer than two continuous SMVs", () => {
    expect(defaultIndependentJointPrior([continuous("thetaA")])).toBeNull();
    expect(defaultIndependentJointPrior([binary("a"), binary("b")])).toBeNull();
  });
});

describe("jointPriorErrors / validateEntity (D128)", () => {
  it("accepts a validated covariance joint prior on a competency model", () => {
    const jointPrior = {
      family: "multivariate_normal",
      parameterization: "covariance",
      smvIds: ["thetaA", "thetaB"],
      matrix: [
        [1, 0.3],
        [0.3, 1],
      ],
    };
    expect(jointPriorErrors(jointPrior, draftModel().smVariables)).toEqual([]);
    const { errors } = validateEntity("competencyModels", draftModel({ jointPrior }), {});
    expect(errors).toEqual([]);
  });

  it("accepts a correlation parameterization with ones on the diagonal", () => {
    const jointPrior = {
      family: "multivariate_normal",
      parameterization: "correlation",
      smvIds: ["thetaA", "thetaB"],
      matrix: [
        [1, 0.4],
        [0.4, 1],
      ],
    };
    const { errors } = validateEntity("competencyModels", draftModel({ jointPrior }), {});
    expect(errors).toEqual([]);
  });

  it("allows omitting jointPrior (independent marginals)", () => {
    const { errors } = validateEntity("competencyModels", draftModel(), {});
    expect(errors).toEqual([]);
  });

  it("refuses a wrong-dimension matrix with a clear message", () => {
    const jointPrior = {
      family: "multivariate_normal",
      parameterization: "covariance",
      smvIds: ["thetaA", "thetaB"],
      matrix: [[1]],
    };
    const msgs = jointPriorErrors(jointPrior, draftModel().smVariables);
    expect(msgs.some((m) => /dimensions must match/i.test(m))).toBe(true);
    const { errors } = validateEntity("competencyModels", draftModel({ jointPrior }), {});
    expect(errors.some((m) => /dimensions must match/i.test(m))).toBe(true);
  });

  it("refuses a non-positive-semi-definite covariance", () => {
    const jointPrior = {
      family: "multivariate_normal",
      parameterization: "covariance",
      smvIds: ["thetaA", "thetaB"],
      matrix: [
        [1, 2],
        [2, 1],
      ],
    };
    const msgs = jointPriorErrors(jointPrior, draftModel().smVariables);
    expect(msgs.some((m) => /positive semi-definite/i.test(m))).toBe(true);
    const { errors } = validateEntity("competencyModels", draftModel({ jointPrior }), {});
    expect(errors.some((m) => /positive semi-definite/i.test(m))).toBe(true);
  });

  it("refuses binary SMVs in the continuous joint (DINA owns that joint)", () => {
    const smVariables = [continuous("thetaA"), binary("attrA")];
    const jointPrior = {
      family: "multivariate_normal",
      parameterization: "covariance",
      smvIds: ["thetaA", "attrA"],
      matrix: [
        [1, 0],
        [0, 1],
      ],
    };
    const msgs = jointPriorErrors(jointPrior, smVariables);
    expect(msgs.some((m) => /continuous SMVs only/i.test(m))).toBe(true);
  });

  it("refuses an unknown continuous SMV id", () => {
    const jointPrior = {
      family: "multivariate_normal",
      parameterization: "covariance",
      smvIds: ["thetaA", "thetaMissing"],
      matrix: [
        [1, 0],
        [0, 1],
      ],
    };
    const msgs = jointPriorErrors(jointPrior, draftModel().smVariables);
    expect(msgs.some((m) => /thetaMissing/.test(m))).toBe(true);
  });

  it("refuses asymmetric and non-unit-diagonal correlation matrices", () => {
    expect(
      jointPriorErrors(
        {
          family: "multivariate_normal",
          parameterization: "correlation",
          smvIds: ["thetaA", "thetaB"],
          matrix: [
            [1, 0.2],
            [0.5, 1],
          ],
        },
        draftModel().smVariables
      ).some((m) => /symmetric/i.test(m))
    ).toBe(true);

    expect(
      jointPriorErrors(
        {
          family: "multivariate_normal",
          parameterization: "correlation",
          smvIds: ["thetaA", "thetaB"],
          matrix: [
            [2, 0],
            [0, 1],
          ],
        },
        draftModel().smVariables
      ).some((m) => /must be 1 for a correlation/i.test(m))
    ).toBe(true);
  });
});

describe("R10 — one correlated partner is the design limit", () => {
  const three = [continuous("thetaA"), continuous("thetaB"), continuous("thetaC")];
  const four = [...three, continuous("thetaD")];

  const threeWay = {
    family: "multivariate_normal",
    parameterization: "covariance",
    smvIds: ["thetaA", "thetaB", "thetaC"],
    matrix: [
      [1, 0.4, 0.4],
      [0.4, 1, 0],
      [0.4, 0, 1],
    ],
  };

  const disjointPairs = {
    family: "multivariate_normal",
    parameterization: "covariance",
    smvIds: ["thetaA", "thetaB", "thetaC", "thetaD"],
    matrix: [
      [1, 0.4, 0, 0],
      [0.4, 1, 0, 0],
      [0, 0, 1, 0.4],
      [0, 0, 0.4, 1],
    ],
  };

  it("shape still accepts a well-formed three-way joint (draft can hold it)", () => {
    expect(jointPriorErrors(threeWay, three)).toEqual([]);
    const { errors } = validateEntity(
      "competencyModels",
      draftModel({ smVariables: three, jointPrior: threeWay }),
      {},
      { strict: false }
    );
    expect(errors.some((m) => /correlated with 2 other/.test(m))).toBe(false);
  });

  it("strict/confirm refuses an SMV correlated with two partners", () => {
    expect(
      jointPriorPartnerLimitErrors(threeWay).some((m) =>
        /thetaA' is correlated with 2 other continuous SMVs \(thetaB, thetaC\)/.test(m)
      )
    ).toBe(true);
    const { errors } = validateEntity(
      "competencyModels",
      draftModel({ smVariables: three, jointPrior: threeWay }),
      {}
    );
    expect(errors.some((m) => /correlated with 2 other/.test(m))).toBe(true);
  });

  it("accepts a larger matrix of disjoint pairs under strict", () => {
    expect(jointPriorErrors(disjointPairs, four)).toEqual([]);
    expect(jointPriorPartnerLimitErrors(disjointPairs)).toEqual([]);
    const { errors } = validateEntity(
      "competencyModels",
      draftModel({ smVariables: four, jointPrior: disjointPairs }),
      {}
    );
    expect(errors).toEqual([]);
  });
});
