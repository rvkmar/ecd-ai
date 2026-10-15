import { describe, expect, it } from "vitest";
import { validateEntity } from "../schema.js";

const matrix = {
  id: "qm1",
  name: "Force",
  competencyModelId: "cm1",
  status: "draft",
  locked: false,
  attributeIds: [],
  entries: [],
};

describe("D144 Q-matrix link", () => {
  it("keeps a matrix valid without a Domain Analysis", () => {
    const result = validateEntity("qMatrixModels", matrix, {
      competencyModels: [{ id: "cm1", smVariables: [] }],
    });
    expect(result.valid).toBe(true);
  });

  it("accepts a link only to an analysis that already exists", () => {
    const missing = validateEntity("qMatrixModels", { ...matrix, domainAnalysisId: "da-missing" }, {
      competencyModels: [{ id: "cm1", smVariables: [] }],
      domainAnalyses: [],
    });
    expect(missing.valid).toBe(false);

    const present = validateEntity("qMatrixModels", { ...matrix, domainAnalysisId: "da1" }, {
      competencyModels: [{ id: "cm1", smVariables: [] }],
      domainAnalyses: [{ id: "da1", name: "Diagrams" }],
    });
    expect(present.valid).toBe(true);
  });

  it("still refuses a Q-matrix id on a knowledge-task statement", () => {
    const result = validateEntity("domainAnalyses", {
      id: "da1",
      name: "Diagrams",
      status: "draft",
      knowledgeTaskRelationships: [{ label: "The relation", qMatrixId: "qm1" }],
    }, {}, { strict: false });
    expect(result.valid).toBe(false);
  });
});
