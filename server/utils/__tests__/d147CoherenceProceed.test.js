import { describe, it, expect } from "vitest";
import { applySaveAudits } from "../auditLog.js";
import { validateEntity } from "../../../src/utils/schema.js";

const analysis = {
  id: "da1",
  name: "Fractions",
  psychologicalPerspective: "trait",
};
const competency = { id: "c1", modelId: "cm1" };
const studentModel = {
  id: "cm1",
  name: "Fractions",
  domainAnalysisId: "da1",
  psychologicalPerspective: "trait",
};
const evidence = {
  id: "em1",
  name: "Diagnose fractions",
  status: "draft",
  competencyId: "c1",
  statisticalModels: [{ id: "s1", type: "dina", active: true, structureConfig: {} }],
};

function db(overrides = {}) {
  return {
    domainAnalyses: [analysis],
    competencies: [competency],
    competencyModels: [studentModel],
    evidenceModels: [],
    auditLog: [],
    ...overrides,
  };
}

describe("D147 trait diagnostic proceed", () => {
  it("records the Domain Analysis as the source when the save introduces DINA", () => {
    const after = db({ evidenceModels: [evidence] });
    applySaveAudits(db(), after);
    const row = after.auditLog.find((entry) => entry.action === "coherence.proceed");
    expect(row.entity).toMatchObject({ collection: "evidenceModels", id: "em1" });
    expect(row.detail).toMatchObject({
      source: "domain_analysis",
      sourceName: "Fractions",
      override: false,
      modelTypes: ["dina"],
    });
  });

  it("names a Student Model override when the stored value differs", () => {
    const after = db({
      domainAnalyses: [{ ...analysis, psychologicalPerspective: "information_processing" }],
      evidenceModels: [evidence],
    });
    applySaveAudits(db({
      domainAnalyses: [{ ...analysis, psychologicalPerspective: "information_processing" }],
    }), after);
    const row = after.auditLog.find((entry) => entry.action === "coherence.proceed");
    expect(row.detail).toMatchObject({ source: "student_model", override: true });
  });

  it("does not record the same departure on a later save", () => {
    const before = db({ evidenceModels: [evidence] });
    const after = db({ evidenceModels: [{ ...evidence, name: "Renamed" }] });
    applySaveAudits(before, after);
    expect(after.auditLog.filter((entry) => entry.action === "coherence.proceed")).toHaveLength(0);
  });

  it("stays silent when a stored non-trait value is the effective perspective", () => {
    const after = db({
      competencyModels: [{ ...studentModel, psychologicalPerspective: "information_processing" }],
      evidenceModels: [evidence],
    });
    applySaveAudits(db({
      competencyModels: [{ ...studentModel, psychologicalPerspective: "information_processing" }],
    }), after);
    expect(after.auditLog.some((entry) => entry.action === "coherence.proceed")).toBe(false);
  });

  it("leaves confirmation free of a perspective error", () => {
    const { errors = [] } = validateEntity("evidenceModels", {
      ...evidence,
      status: "confirmed",
      competencyModelVersion: 1,
      observables: [],
    }, db(), { strict: false });
    expect(errors.join(" ")).not.toMatch(/perspective|trait|diagnostic/i);
  });
});
