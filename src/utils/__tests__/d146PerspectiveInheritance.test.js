import { describe, expect, it } from "vitest";
import { validateEntity } from "../schema.js";
import {
  applyDomainAnalysisChoice,
  rebuildPerspective,
} from "../perspectiveInheritance.js";

const analysis = {
  id: "da1",
  name: "Diagrams",
  psychologicalPerspective: "information_processing",
};

function model(overrides = {}) {
  return {
    id: "cm1",
    name: "Diagram explanation",
    description: "A student model of diagram explanation.",
    measurementIntent: "unidimensional",
    versionNumber: 1,
    status: "draft",
    locked: false,
    psychologicalPerspective: "trait",
    ...overrides,
  };
}

describe("D146 perspective inheritance", () => {
  it("keeps a stored perspective that differs from the cited Domain Analysis", () => {
    const { errors } = validateEntity(
      "competencyModels",
      model({ domainAnalysisId: "da1" }),
      { domainAnalyses: [analysis] }
    );
    expect(errors || []).toEqual([]);
  });

  it("rejects a Domain Analysis id that does not exist", () => {
    const { errors } = validateEntity(
      "competencyModels",
      model({ domainAnalysisId: "missing" }),
      { domainAnalyses: [analysis] }
    );
    expect((errors || []).join(" ")).toMatch(/Invalid domainAnalysisId: missing/);
  });

  it("inherits on a new model and leaves a stored perspective until rebuild", () => {
    const fresh = applyDomainAnalysisChoice({
      model: { name: "New" },
      domainAnalysisId: "da1",
      analyses: [analysis],
      baselinePerspective: "",
    });
    expect(fresh.psychologicalPerspective).toBe("information_processing");

    const kept = applyDomainAnalysisChoice({
      model: model(),
      domainAnalysisId: "da1",
      analyses: [analysis],
      baselinePerspective: "trait",
    });
    expect(kept.psychologicalPerspective).toBe("trait");
    expect(kept.domainAnalysisId).toBe("da1");

    expect(rebuildPerspective(kept, [analysis]).psychologicalPerspective).toBe(
      "information_processing"
    );
  });
});
