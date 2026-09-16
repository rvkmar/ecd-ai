// src/utils/__tests__/studentModelAudit.test.js
import { describe, it, expect } from "vitest";
import { computeStructuralAudit } from "../studentModelAudit";
import { syncSmVariablesFromCompetencies } from "../smVariableSync";

function baseModel(overrides = {}) {
  return {
    name: "Grade 10 Newtonian Mechanics Multidimensional SM",
    description: "A complete multidimensional Student Model for physics.",
    measurementIntent: "multidimensional",
    psychologicalPerspective: "information_processing",
    constructFramework: {
      ungroundedWaiver: true,
      ungroundedReason: "No curricular policy uploaded in this lab yet.",
    },
    ...overrides,
  };
}

function comps() {
  return [
    {
      id: "c1",
      name: "Force Concept Mastery",
      description: "Mastery of Newton laws force identification.",
      variableType: "binary",
      states: [
        { value: "0", label: "Non-Mastery" },
        { value: "1", label: "Mastery" },
      ],
      domain: "Physics",
      strand: "Mechanics",
      facet: "Force",
      relationships: [{ targetCompetencyId: "c4", type: "part-of" }],
    },
    {
      id: "c2",
      name: "Kinematic Reasoning",
      description: "Ordered proficiency in kinematics.",
      variableType: "ordinal",
      states: [
        { value: "L1", label: "L1", order: 1 },
        { value: "L2", label: "L2", order: 2 },
      ],
      domain: "Physics",
      strand: "Mechanics",
      facet: "Kinematics",
      relationships: [
        { targetCompetencyId: "c1", type: "prerequisite" },
        { targetCompetencyId: "c4", type: "part-of" },
      ],
    },
    {
      id: "c3",
      name: "Problem Representation",
      description: "Latent class for problem representation.",
      variableType: "categorical",
      states: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
      domain: "Physics",
      strand: "Mechanics",
      facet: "Representation",
      relationships: [{ targetCompetencyId: "c4", type: "correlates-with" }],
    },
    {
      id: "c4",
      name: "Newtonian Theta",
      description: "Continuous overall proficiency.",
      variableType: "continuous",
      scale: { min: -3, max: 3 },
      domain: "Physics",
      strand: "Mechanics",
      facet: "Overall",
      relationships: [],
    },
  ];
}

describe("studentModelAudit + smVariableSync", () => {
  it("syncs smVariables 1:1 with competencies including priors", () => {
    const smvs = syncSmVariablesFromCompetencies(comps(), []);
    expect(smvs).toHaveLength(4);
    expect(smvs.map((s) => s.id)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(smvs[0].priorDistribution.family).toBe("bernoulli");
    expect(smvs[3].priorDistribution.family).toBe("normal");
    expect(smvs[0].scale.states).toEqual(["0", "1"]);
  });

  it("passes structural audit for a complete multidimensional model", () => {
    const competencies = comps();
    const model = baseModel({
      smVariables: syncSmVariablesFromCompetencies(competencies, []),
    });
    const { allPassed, checks } = computeStructuralAudit({ model, competencies });
    expect(allPassed).toBe(true);
    expect(checks.every((c) => c.passed)).toBe(true);
  });

  it("fails when psychological perspective or grounding is missing", () => {
    const competencies = comps();
    const model = baseModel({
      psychologicalPerspective: "",
      constructFramework: {},
      smVariables: syncSmVariablesFromCompetencies(competencies, []),
    });
    const { allPassed, checks } = computeStructuralAudit({ model, competencies });
    expect(allPassed).toBe(false);
    expect(
      checks.find((c) => c.label.includes("Psychological perspective"))?.passed
    ).toBe(false);
    expect(
      checks.find((c) => c.label.includes("Construct grounded"))?.passed
    ).toBe(false);
  });

  it("requires ≥3 relationships for multidimensional models", () => {
    const competencies = comps().map((c) => ({ ...c, relationships: [] }));
    const model = baseModel({
      smVariables: syncSmVariablesFromCompetencies(competencies, []),
    });
    const { checks } = computeStructuralAudit({ model, competencies });
    expect(
      checks.find((c) => c.label.includes("≥3 structural relationships"))?.passed
    ).toBe(false);
  });

  it("fails structural completeness when an SMV prior is incomplete", () => {
    const competencies = comps();
    const smVariables = syncSmVariablesFromCompetencies(competencies, []);
    smVariables[0] = {
      ...smVariables[0],
      priorDistribution: { family: "bernoulli", params: {} },
    };
    const model = baseModel({ smVariables });
    const { allPassed, checks } = computeStructuralAudit({ model, competencies });
    expect(allPassed).toBe(false);
    expect(
      checks.find((c) => c.label.includes("prior distributions complete"))?.passed
    ).toBe(false);
  });

  it("fails when Dirichlet α length does not match states", () => {
    const competencies = comps();
    const smVariables = syncSmVariablesFromCompetencies(competencies, []);
    // c2 is ordinal with 2 states; truncate alpha
    smVariables[1] = {
      ...smVariables[1],
      priorDistribution: { family: "dirichlet", params: { alpha: [1] } },
    };
    const model = baseModel({ smVariables });
    const { checks } = computeStructuralAudit({ model, competencies });
    expect(
      checks.find((c) => c.label.includes("prior distributions complete"))?.passed
    ).toBe(false);
  });
});
