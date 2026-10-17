import { describe, expect, it } from "vitest";
import { schema, validateEntity } from "../schema.js";
import {
  applyDomainAnalysisChoice,
  perspectiveReadout,
  readDesignPatternPerspective,
  readEvidencePerspective,
  readStudentPerspective,
  readTaskPerspective,
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

  it("names a stored Student Model perspective as an override until rebuild", () => {
    const reading = readStudentPerspective(
      model({ domainAnalysisId: "da1" }),
      [analysis]
    );
    expect(reading.override).toBe(true);
    expect(reading.declared).toBe("information_processing");
    expect(reading.stored).toBe("trait");
    expect(perspectiveReadout(reading)).toMatch(/Stored on the Student Model/);

    const rebuilt = rebuildPerspective(model({ domainAnalysisId: "da1" }), [analysis]);
    expect(readStudentPerspective(rebuilt, [analysis]).override).toBe(false);
    expect(readStudentPerspective(rebuilt, [analysis]).effective).toBe("information_processing");
  });

  it("reads the same perspective through an Evidence Model and a Task Model", () => {
    const db = {
      domainAnalyses: [analysis],
      competencyModels: [model({ domainAnalysisId: "da1", psychologicalPerspective: "information_processing" })],
      competencies: [{ id: "comp1", modelId: "cm1" }],
      evidenceModels: [{ id: "em1", competencyId: "comp1" }],
    };
    expect(readEvidencePerspective(db.evidenceModels[0], db).effective).toBe("information_processing");
    expect(readTaskPerspective({ primaryEvidenceModelId: "em1" }, db).effective).toBe(
      "information_processing"
    );
    expect(readEvidencePerspective(db.evidenceModels[0], {
      ...db,
      competencyModels: [model({ domainAnalysisId: "da1" })],
    }).override).toBe(true);
  });

  it("reads a Design Pattern from the cited analysis and stores no perspective of its own", () => {
    const pattern = { id: "dp1", name: "Name a part", domainAnalysisId: "da1", psychologicalPerspective: "trait" };
    const reading = readDesignPatternPerspective(pattern, [analysis]);
    expect(reading.effective).toBe("information_processing");
    expect(reading.stored).toBe("");
    expect(reading.override).toBe(false);

    const { errors } = validateEntity("designPatterns", {
      id: "dp1",
      name: "Name a part",
      status: "draft",
      domainAnalysisId: "missing",
    }, { domainAnalyses: [analysis] });
    expect((errors || []).join(" ")).toMatch(/Invalid domainAnalysisId: missing/);

    const cited = validateEntity("designPatterns", {
      id: "dp1",
      name: "Name a part",
      summary: "The student names a plant part.",
      rationale: "Naming the part is the claim this pattern centres.",
      status: "draft",
      domainAnalysisId: "da1",
    }, { domainAnalyses: [analysis] }, { strict: false });
    expect(cited.errors || []).toEqual([]);
    expect(schema.designPatterns).not.toHaveProperty("psychologicalPerspective");
    expect(schema.designPatterns.domainAnalysisId).toBe("string");
  });
});
