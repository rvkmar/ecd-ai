import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";
import { templateReadiness } from "../templateReadiness.js";

function db() {
  return {
    competencyModels: [{ id: "cm1", status: "confirmed", locked: true }],
    competencies: [{ id: "c1", modelId: "cm1" }],
    evidenceModels: [{ id: "em1", competencyId: "c1", status: "confirmed" }],
    taskModels: [
      {
        id: "tm1",
        evidenceModelIds: ["em1"],
        primaryEvidenceModelId: "em1",
        status: "confirmed",
        versionNumber: 1,
      },
    ],
    presentationModels: [
      { id: "pm1", taskModelId: "tm1", taskModelVersion: 1, status: "confirmed" },
    ],
    designPatterns: [{ id: "dp1", name: "Explain", status: "confirmed" }],
    templates: [],
  };
}

function template(overrides = {}) {
  return {
    id: "tpl1",
    name: "Blueprint",
    status: "confirmed",
    competencyModelId: "cm1",
    evidenceModelId: "em1",
    taskModelId: "tm1",
    presentationModelId: "pm1",
    ...overrides,
  };
}

describe("D136 pattern ↔ template link", () => {
  it("confirms a template that cites no pattern", () => {
    const { valid, errors } = validateEntity("templates", template(), db(), { strict: true });
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
    expect(templateReadiness(template(), { strict: true }).ready).toBe(true);
  });

  it("accepts a template that cites a real pattern", () => {
    const { errors } = validateEntity(
      "templates",
      template({ designPatternId: "dp1" }),
      db(),
      { strict: true }
    );
    expect(errors).toEqual([]);
  });

  it("refuses a template that cites a missing pattern", () => {
    const { errors } = validateEntity(
      "templates",
      template({ designPatternId: "missing" }),
      db()
    );
    expect(errors.some((error) => /designPatternId/.test(error))).toBe(true);
  });
});
