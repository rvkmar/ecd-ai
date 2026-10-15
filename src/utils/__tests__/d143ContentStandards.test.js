import { describe, expect, it } from "vitest";
import { validateEntity } from "../schema.js";

const goals = [
  {
    code: "CG-1",
    statement: "Explain how a labelled diagram works",
    competencies: [
      {
        code: "C-1.1",
        statement: "Name the relation between two parts",
        learningOutcomes: ["Points to the link"],
      },
    ],
  },
];

const policy = {
  id: "cp-ncf",
  name: "NCF science",
  curricularGoals: goals,
};

function draftAnalysis(extra = {}) {
  return {
    id: "da1",
    name: "Diagrams",
    status: "draft",
    ...extra,
  };
}

describe("D143 content standards", () => {
  it("keeps the goal tree on the Domain Analysis and out of valued knowledge", () => {
    const result = validateEntity("domainAnalyses", draftAnalysis({
      contentStandards: policy,
      valuedKnowledge: [{ label: "How the parts of a system relate" }],
    }), {}, { strict: false });
    expect(result.valid).toBe(true);
  });

  it("does not treat a policy as the valued-knowledge section required to confirm", () => {
    const result = validateEntity("domainAnalyses", {
      ...draftAnalysis({ contentStandards: policy, status: "confirmed" }),
      psychologicalPerspective: "information_processing",
    }, {}, { strict: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("valuedKnowledge"))).toBe(true);
  });

  it("still refuses a curricular policy id on a valued-knowledge statement", () => {
    const result = validateEntity("domainAnalyses", draftAnalysis({
      valuedKnowledge: [{ label: "Goals", curricularPolicyId: "cp-ncf" }],
    }), {}, { strict: false });
    expect(result.valid).toBe(false);
  });
});
