import { describe, it, expect } from "vitest";
import {
  normalizeStudentModelBulkRows,
  stripStudentModelImportIdentity,
} from "../studentModelBulkNormalize";

describe("normalizeStudentModelBulkRows", () => {
  it("unwraps { competencyModels: [...] }", () => {
    const rows = normalizeStudentModelBulkRows({
      competencyModels: [{ name: "A", measurementIntent: "unidimensional" }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("A");
  });

  it("converts a Step 9 specification export into one bulk row", () => {
    const rows = normalizeStudentModelBulkRows({
      specificationVersion: "1.1",
      model: {
        name: "Physics SM",
        description: "desc",
        measurementIntent: "multidimensional",
        psychologicalPerspective: "information_processing",
        constructFramework: { ungroundedWaiver: true, ungroundedReason: "lab waiver text" },
      },
      competencies: [{ id: "c1", name: "Force", variableType: "binary" }],
      smVariables: [
        {
          id: "c1",
          type: "binary",
          priorDistribution: { family: "bernoulli", params: { p: 0.4 } },
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Physics SM");
    expect(rows[0].competencies).toHaveLength(1);
    expect(rows[0].smVariables[0].priorDistribution.params.p).toBe(0.4);
  });

  it("does not treat evidence-model arrays as Student Models", () => {
    const rows = normalizeStudentModelBulkRows([
      { name: "EM", claimStatement: "x".repeat(25), warrants: [] },
    ]);
    expect(rows).toBeNull();
  });

  it("strips lifecycle identity for re-import", () => {
    const cleaned = stripStudentModelImportIdentity({
      id: "cm1",
      name: "Keep",
      status: "confirmed",
      locked: true,
      versionNumber: 3,
      measurementIntent: "unidimensional",
    });
    expect(cleaned.id).toBeUndefined();
    expect(cleaned.status).toBeUndefined();
    expect(cleaned.locked).toBeUndefined();
    expect(cleaned.name).toBe("Keep");
    expect(cleaned.measurementIntent).toBe("unidimensional");
  });
});
