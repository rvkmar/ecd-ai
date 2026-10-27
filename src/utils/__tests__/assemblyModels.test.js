// src/utils/__tests__/assemblyModels.test.js
//
// Day 17 (Week 4, core schema): the new `assemblyModels` collection.
// Structural + referential-integrity validation only -- no lifecycle
// governance yet (that's Day 21, applied uniformly across every new core
// collection). Exit check: validation passes a fixture and fails
// deliberate mutations; an accuracy target that names a non-existent SMV
// is refused.

import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";

const competencyModel = {
  id: "cm1",
  name: "Numerical Reasoning Framework",
  measurementIntent: "multidimensional",
  versionNumber: 1,
  status: "confirmed",
  locked: true,
  smVariables: [
    {
      id: "smv-theta",
      label: "Numerical Reasoning Ability",
      type: "continuous",
      scale: { min: -4, max: 4 },
      priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } },
    },
    {
      id: "smv-fractions",
      label: "Attribute: Fraction Equivalence",
      type: "binary",
      scale: { states: ["non-mastery", "mastery"] },
      priorDistribution: { family: "bernoulli", params: { p: 0.5 } },
    },
  ],
};

const policy = {
  id: "p1",
  name: "Adaptive IRT Selection",
  type: "IRT",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function makeDb(overrides = {}) {
  return {
    competencyModels: [competencyModel],
    policies: [policy],
    ...overrides,
  };
}

function makeAssemblyModel(overrides = {}) {
  return {
    id: "am1",
    name: "Numerical Reasoning Assembly",
    competencyModelId: "cm1",
    competencyModelVersion: 1,
    targetsBySMV: [
      { smvId: "smv-theta", requiredSEM: 0.3 },
      { smvId: "smv-fractions", requiredClassificationAccuracy: 0.8 },
    ],
    stoppingRules: { maxItems: 20, minItems: 5, targetsMet: true },
    selectionAlgorithm: { policyId: "p1" },
    status: "draft",
    ...overrides,
  };
}

function assemblyErrors(model, db = makeDb()) {
  const { errors } = validateEntity("assemblyModels", model, db);
  return errors || [];
}

describe("assemblyModels — passing fixture", () => {
  it("accepts a well-formed assembly model targeting both a continuous and a binary SMV", () => {
    expect(assemblyErrors(makeAssemblyModel())).toEqual([]);
  });

  it("accepts stoppingRules with only one rule declared", () => {
    expect(
      assemblyErrors(makeAssemblyModel({ stoppingRules: { maxItems: 30 } }))
    ).toEqual([]);
  });
});

describe("assemblyModels — deliberate mutations", () => {
  it("refuses an accuracy target that names a non-existent SMV", () => {
    const mutated = makeAssemblyModel({
      targetsBySMV: [{ smvId: "smv-does-not-exist", requiredSEM: 0.3 }],
    });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/does not exist on competency model/);
  });

  it("rejects a target using requiredClassificationAccuracy for a continuous SMV", () => {
    const mutated = makeAssemblyModel({
      targetsBySMV: [{ smvId: "smv-theta", requiredClassificationAccuracy: 0.8 }],
    });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/must specify requiredSEM, not requiredClassificationAccuracy/);
  });

  it("rejects a target using requiredSEM for a binary SMV", () => {
    const mutated = makeAssemblyModel({
      targetsBySMV: [{ smvId: "smv-fractions", requiredSEM: 0.3 }],
    });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/must specify requiredClassificationAccuracy, not requiredSEM/);
  });

  it("rejects a target specifying both requiredSEM and requiredClassificationAccuracy", () => {
    const mutated = makeAssemblyModel({
      targetsBySMV: [{ smvId: "smv-theta", requiredSEM: 0.3, requiredClassificationAccuracy: 0.8 }],
    });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/exactly one of requiredSEM or requiredClassificationAccuracy/);
  });

  it("rejects a duplicate smvId within targetsBySMV", () => {
    const mutated = makeAssemblyModel({
      targetsBySMV: [
        { smvId: "smv-theta", requiredSEM: 0.3 },
        { smvId: "smv-theta", requiredSEM: 0.2 },
      ],
    });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/duplicates target smvId/);
  });

  it("rejects a requiredClassificationAccuracy outside (0, 1]", () => {
    const mutated = makeAssemblyModel({
      targetsBySMV: [{ smvId: "smv-fractions", requiredClassificationAccuracy: 1.5 }],
    });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/requiredClassificationAccuracy must be in \(0, 1\]/);
  });

  it("rejects a dangling competencyModelId", () => {
    const mutated = makeAssemblyModel({ competencyModelId: "cm-does-not-exist" });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/Invalid competencyModelId/);
  });

  it("rejects a dangling selectionAlgorithm.policyId", () => {
    const mutated = makeAssemblyModel({ selectionAlgorithm: { policyId: "p-does-not-exist" } });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/Invalid selectionAlgorithm\.policyId/);
  });

  it("requires selectionAlgorithm to be present", () => {
    const mutated = makeAssemblyModel({ selectionAlgorithm: undefined });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/selectionAlgorithm is required/);
  });

  it("rejects stoppingRules where minItems exceeds maxItems", () => {
    const mutated = makeAssemblyModel({ stoppingRules: { minItems: 20, maxItems: 5 } });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/minItems cannot exceed stoppingRules\.maxItems/);
  });

  it("rejects stoppingRules with none of maxItems/minItems/targetsMet declared", () => {
    const mutated = makeAssemblyModel({ stoppingRules: {} });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/must declare at least one of maxItems, minItems or targetsMet/);
  });

  it("rejects an unknown status", () => {
    const mutated = makeAssemblyModel({ status: "pending" });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/Invalid assembly model status/);
  });

  it("requires a competencyModelId", () => {
    const mutated = makeAssemblyModel({ competencyModelId: undefined });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/competencyModelId is required/);
  });

  // Day 21: lifecycle wiring added `locked`, mirroring competencyModels/
  // taskModels' own "confirmed must be locked" rule.
  it("requires a confirmed assembly model to be locked", () => {
    const mutated = makeAssemblyModel({ status: "confirmed", locked: false });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/Confirmed assembly models must be locked/);
  });

  it("requires a name", () => {
    const mutated = makeAssemblyModel({ name: undefined });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/Assembly model name is required/);
  });

  it("requires a status", () => {
    const mutated = makeAssemblyModel({ status: undefined });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/status is required/);
  });

  it("rejects a non-array targetsBySMV", () => {
    const mutated = makeAssemblyModel({ targetsBySMV: "smv-theta" });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/targetsBySMV should be array/);
  });

  it("accepts an empty targetsBySMV array at the structural level (completeness is a lifecycle-time concern, not structural)", () => {
    // validateAssemblyModelLifecycle (server/utils/lifecycleValidation.js)
    // requires at least one target before "reviewed"; validateEntity here
    // does not tie targetsBySMV completeness to status at all -- an empty
    // array is structurally well-formed at any status, including "reviewed".
    expect(
      assemblyErrors(makeAssemblyModel({ status: "reviewed", targetsBySMV: [] }))
    ).toEqual([]);
  });

  it("rejects a targetsBySMV entry with no smvId", () => {
    const mutated = makeAssemblyModel({
      targetsBySMV: [{ requiredSEM: 0.3 }],
    });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/targetsBySMV\[0\] requires an smvId/);
  });

  it("rejects a target specifying neither requiredSEM nor requiredClassificationAccuracy", () => {
    const mutated = makeAssemblyModel({
      targetsBySMV: [{ smvId: "smv-theta" }],
    });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/exactly one of requiredSEM or requiredClassificationAccuracy/);
  });

  it("rejects requiredSEM at the zero boundary (must be strictly greater than 0)", () => {
    const mutated = makeAssemblyModel({
      targetsBySMV: [{ smvId: "smv-theta", requiredSEM: 0 }],
    });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/requiredSEM must be greater than 0/);
  });

  it("rejects requiredClassificationAccuracy at the zero boundary (must be > 0)", () => {
    const mutated = makeAssemblyModel({
      targetsBySMV: [{ smvId: "smv-fractions", requiredClassificationAccuracy: 0 }],
    });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/requiredClassificationAccuracy must be in \(0, 1\]/);
  });

  it("accepts requiredClassificationAccuracy at the 1 boundary (inclusive upper bound)", () => {
    const mutated = makeAssemblyModel({
      targetsBySMV: [{ smvId: "smv-fractions", requiredClassificationAccuracy: 1 }],
    });
    expect(assemblyErrors(mutated)).toEqual([]);
  });

  it("rejects a non-object, non-array stoppingRules", () => {
    const mutated = makeAssemblyModel({ stoppingRules: "fast" });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/stoppingRules should be object/);
  });

  it("rejects an array stoppingRules (Array.isArray is checked explicitly, not just typeof)", () => {
    const mutated = makeAssemblyModel({ stoppingRules: [20, 5] });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/stoppingRules should be object/);
  });

  it("rejects stoppingRules.maxItems that is not a positive number", () => {
    const mutated = makeAssemblyModel({ stoppingRules: { maxItems: 0 } });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/stoppingRules\.maxItems must be a positive number/);
  });

  it("rejects stoppingRules.minItems that is not a positive number", () => {
    const mutated = makeAssemblyModel({ stoppingRules: { minItems: -1 } });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/stoppingRules\.minItems must be a positive number/);
  });

  it("rejects a non-boolean stoppingRules.targetsMet", () => {
    const mutated = makeAssemblyModel({ stoppingRules: { targetsMet: "yes" } });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/stoppingRules\.targetsMet should be boolean/);
  });

  it("rejects a selectionAlgorithm object that is missing policyId (distinct from selectionAlgorithm being absent entirely)", () => {
    const mutated = makeAssemblyModel({ selectionAlgorithm: {} });
    const errors = assemblyErrors(mutated);
    expect(errors.join(" ")).toMatch(/selectionAlgorithm\.policyId is required/);
    // And NOT the "is required and must reference a policyId" message, which
    // is specific to selectionAlgorithm itself being missing/non-object.
    expect(errors.join(" ")).not.toMatch(/selectionAlgorithm is required and must reference/);
  });
});

describe("assemblyModels constraints", () => {
  const withRefs = () =>
    makeDb({
      taskModels: [{ id: "tm1" }],
      taskModelVariables: [{ id: "tmv1" }],
      items: [{ id: "it1" }, { id: "it2" }],
      curricularPolicies: [
        { id: "cp1", curricularGoals: [{ code: "CG-S1", competencies: [{ code: "C-S1.1" }] }] },
      ],
    });

  it("accepts an assembly model with no constraints", () => {
    expect(assemblyErrors(makeAssemblyModel())).toEqual([]);
    expect(assemblyErrors(makeAssemblyModel({ constraints: null }))).toEqual([]);
  });

  it("accepts task model, content standard, variable, exposure, and enemy rows", () => {
    const model = makeAssemblyModel({
      constraints: {
        taskModelCounts: [{ taskModelId: "tm1", min: 1, max: 4 }],
        contentStandardCounts: [{ code: "C-S1.1", min: 1 }],
        taskModelVariableCounts: [{ taskModelVariableId: "tmv1", value: "remember", max: 2 }],
        exposure: { maxPerItem: 1 },
        enemies: [{ itemIds: ["it1", "it2"] }],
      },
    });
    expect(assemblyErrors(model, withRefs())).toEqual([]);
  });

  it("rejects unknown fields, inverted bounds, dangling ids, and a short enemy group", () => {
    const model = makeAssemblyModel({
      constraints: {
        blueprint: true,
        taskModelCounts: [{ taskModelId: "missing", min: 5, max: 1 }],
        contentStandardCounts: [{ code: "NOPE", max: 1 }],
        taskModelVariableCounts: [{ taskModelVariableId: "tmv1", value: "", min: 1 }],
        exposure: { maxUses: 2 },
        enemies: [{ itemIds: ["it1"] }],
      },
    });
    const text = assemblyErrors(model, withRefs()).join(" ");
    expect(text).toMatch(/unknown field 'blueprint'/);
    expect(text).toMatch(/does not match a task model/);
    expect(text).toMatch(/min cannot exceed max/);
    expect(text).toMatch(/not a curricular goal or competency code/);
    expect(text).toMatch(/value must be a non-empty string/);
    expect(text).toMatch(/unknown field 'maxUses'/);
    expect(text).toMatch(/at least two distinct items/);
  });
});
