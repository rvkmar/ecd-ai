// TU1: optional masteryThreshold on an Assembly Model or an SMV.
// (0, 1). Absent is valid. Invalid numbers are refused. Sync keeps a
// binary SMV's cut and drops it when the variable is no longer binary.

import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";
import { syncSmVariablesFromCompetencies } from "../smVariableSync.js";

const policy = { id: "p1", name: "Fixed form", type: "fixed" };

const competencyForAssembly = {
  id: "cm1",
  name: "Fractions",
  measurementIntent: "unidimensional",
  status: "confirmed",
  locked: true,
  smVariables: [{
    id: "smv-fractions",
    label: "Fraction equivalence",
    type: "binary",
    scale: { states: ["non-mastery", "mastery"] },
    priorDistribution: { family: "bernoulli", params: { p: 0.5 } },
  }],
};

function assemblyModel(overrides = {}) {
  return {
    id: "am1",
    name: "Fractions assembly",
    competencyModelId: "cm1",
    status: "draft",
    targetsBySMV: [{ smvId: "smv-fractions", requiredClassificationAccuracy: 0.8 }],
    selectionAlgorithm: { policyId: "p1" },
    ...overrides,
  };
}

function assemblyErrors(model) {
  const { errors } = validateEntity("assemblyModels", model, {
    competencyModels: [competencyForAssembly],
    policies: [policy],
  });
  return errors || [];
}

function studentModel(smvOverrides = {}) {
  return {
    name: "Fractions student model",
    measurementIntent: "unidimensional",
    status: "draft",
    smVariables: [{
      id: "smv1",
      label: "Fractions",
      type: "binary",
      scale: { states: ["no", "yes"] },
      priorDistribution: { family: "bernoulli", params: { p: 0.5 } },
      ...smvOverrides,
    }],
  };
}

function smvErrors(smvOverrides) {
  const { errors } = validateEntity("competencyModels", studentModel(smvOverrides), {});
  return (errors || []).filter((message) => message.includes("masteryThreshold"));
}

describe("assemblyModels.masteryThreshold", () => {
  it("accepts a missing cut and a cut in (0, 1)", () => {
    expect(assemblyErrors(assemblyModel())).toEqual([]);
    expect(assemblyErrors(assemblyModel({ masteryThreshold: 0.8 }))).toEqual([]);
    expect(assemblyErrors(assemblyModel({ masteryThreshold: null }))).toEqual([]);
  });

  it.each([0, 1, 1.2, -0.1, NaN, Infinity])("rejects %s", (masteryThreshold) => {
    const errors = assemblyErrors(assemblyModel({ masteryThreshold }));
    expect(errors.join(" ")).toMatch(/masteryThreshold must be a number in \(0, 1\)/);
  });

  it("rejects a non-number", () => {
    const errors = assemblyErrors(assemblyModel({ masteryThreshold: "0.8" }));
    expect(errors.join(" ")).toMatch(/masteryThreshold/);
    expect(errors.join(" ")).toMatch(/number/);
  });
});

describe("smVariables.masteryThreshold", () => {
  it("accepts a missing cut and a cut in (0, 1)", () => {
    expect(smvErrors({})).toEqual([]);
    expect(smvErrors({ masteryThreshold: 0.25 })).toEqual([]);
    expect(smvErrors({ masteryThreshold: null })).toEqual([]);
  });

  it.each([0, 1, 2, -0.01, NaN])("rejects %s", (masteryThreshold) => {
    expect(smvErrors({ masteryThreshold }).join(" ")).toMatch(
      /masteryThreshold must be a number in \(0, 1\)/
    );
  });

  it("rejects a string", () => {
    expect(smvErrors({ masteryThreshold: "0.5" }).join(" ")).toMatch(
      /masteryThreshold must be a number in \(0, 1\)/
    );
  });
});

describe("syncSmVariablesFromCompetencies keeps a binary cut", () => {
  const binary = [{
    id: "c1",
    name: "Fractions",
    variableType: "binary",
    states: [{ value: "0" }, { value: "1" }],
  }];

  it("preserves masteryThreshold and the prior", () => {
    const synced = syncSmVariablesFromCompetencies(binary, [{
      id: "c1",
      masteryThreshold: 0.75,
      priorDistribution: { family: "bernoulli", params: { p: 0.4 } },
    }]);
    expect(synced[0].masteryThreshold).toBe(0.75);
    expect(synced[0].priorDistribution.params.p).toBe(0.4);
  });

  it("drops the cut when the variable is no longer binary", () => {
    const synced = syncSmVariablesFromCompetencies(
      [{ id: "c1", name: "Theta", variableType: "continuous", scale: { min: -3, max: 3 } }],
      [{ id: "c1", masteryThreshold: 0.75 }]
    );
    expect(synced[0].masteryThreshold).toBeUndefined();
  });
});
