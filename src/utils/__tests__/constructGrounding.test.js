import { describe, expect, it } from "vitest";
import { validateEntity } from "../schema.js";
import {
  constructFrameworkGrounded,
  constructGroundingMessage,
} from "../constructGrounding.js";
import { computeStructuralAudit } from "../studentModelAudit.js";

const policy = {
  id: "cp1",
  name: "NCF Science",
  curricularGoals: [{ code: "CG-1", statement: "Explains a labelled diagram" }],
};

const cited = {
  policyId: "cp1",
  policyName: "NCF Science",
  curricularGoalCodes: ["CG-1"],
  curricularGoals: policy.curricularGoals,
};

const waived = {
  ungroundedWaiver: true,
  ungroundedReason: "No curricular policy exists in this store yet.",
};

function model(framework) {
  return {
    id: "cm1",
    name: "Diagram explanation",
    description: "Student can explain a labelled scientific diagram.",
    measurementIntent: "unidimensional",
    psychologicalPerspective: "trait",
    constructFramework: framework,
    smVariables: [{ id: "smv1", label: "Explains", type: "binary" }],
    status: "reviewed",
    locked: false,
    versionNumber: 1,
  };
}

describe("construct framework grounding", () => {
  it("accepts a waiver only when the Policies menu is empty", () => {
    expect(constructFrameworkGrounded(waived, [])).toBe(true);
    expect(constructFrameworkGrounded(waived, [policy])).toBe(false);
    expect(constructFrameworkGrounded(cited, [policy])).toBe(true);
    expect(constructFrameworkGrounded(cited, [])).toBe(false);
    expect(constructGroundingMessage([policy])).toMatch(/only available when no curricular policy exists/);
  });

  it("refuses confirmation by waiver once a curricular policy exists", () => {
    const { errors } = validateEntity("competencyModels", model(waived), { curricularPolicies: [policy] }, {
      requireCafCompleteness: true,
    });
    expect((errors || []).join(" ")).toMatch(/ungrounded waiver is only available/);
  });

  it("confirms a citation and keeps a waiver when no policy exists", () => {
    const citedResult = validateEntity(
      "competencyModels",
      model(cited),
      { curricularPolicies: [policy] },
      { requireCafCompleteness: true }
    );
    expect(citedResult.errors || []).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/curricular policy exists/)])
    );

    const waivedResult = validateEntity(
      "competencyModels",
      model(waived),
      { curricularPolicies: [] },
      { requireCafCompleteness: true }
    );
    expect(waivedResult.errors || []).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/No curricular policy exists/)])
    );
  });

  it("fails the structural audit for a waiver when a policy is on the menu", () => {
    const audit = computeStructuralAudit({
      model: model(waived),
      competencies: [],
      policies: [policy],
    });
    const grounding = audit.checks.find((check) => check.label.includes("Construct grounded"));
    expect(grounding.passed).toBe(false);
    expect(grounding.label).toMatch(/Policies menu/);
  });
});
