import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";
import { additionalKsaFocalOverlap } from "../additionalKsaAdvisory.js";

const base = {
  name: "Diagram explanation",
  summary: "Students explain a labelled diagram.",
  rationale: "The pattern separates explanation from recognition.",
};

describe("D149 additional KSA relationship", () => {
  it("lets a draft keep a label without a relationship", () => {
    const result = validateEntity(
      "designPatterns",
      {
        ...base,
        status: "draft",
        additionalKsas: [{ label: "Diagram conventions" }],
      },
      null,
      { strict: false }
    );
    expect(result.valid).toBe(true);
  });

  it("refuses confirm when a labelled additional KSA has no relationship", () => {
    const result = validateEntity(
      "designPatterns",
      {
        ...base,
        status: "confirmed",
        additionalKsas: [{ label: "Diagram conventions" }],
      },
      null,
      { strict: true }
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => /relationship is required to confirm/.test(error))).toBe(
      true
    );
  });

  it("accepts a known relationship on confirm and rejects an unknown one on a draft", () => {
    const confirmed = validateEntity(
      "designPatterns",
      {
        ...base,
        status: "confirmed",
        additionalKsas: [
          { label: "Diagram conventions", relationship: "potentially_confounding" },
        ],
      },
      null,
      { strict: true }
    );
    expect(confirmed.valid).toBe(true);

    const draft = validateEntity("designPatterns", {
      ...base,
      status: "draft",
      additionalKsas: [{ label: "Diagram conventions", relationship: "focal" }],
    });
    expect(draft.valid).toBe(false);
    expect(draft.errors.some((error) => /not a known relationship/.test(error))).toBe(true);
  });

  it("matches another pattern's Focal KSA without making the record invalid", () => {
    const pattern = {
      id: "dp2",
      additionalKsas: [{ label: "  Reads a diagram  " }],
    };
    const patterns = [
      { id: "dp2", name: "This pattern", focalKsas: [{ label: "Reads a diagram" }] },
      { id: "dp1", name: "Name the part", focalKsas: [{ label: "reads a diagram" }] },
    ];
    expect(additionalKsaFocalOverlap(pattern, patterns)).toEqual([
      { label: "reads a diagram", patternId: "dp1", patternName: "Name the part" },
    ]);

    const saved = validateEntity("designPatterns", {
      ...base,
      id: "dp2",
      status: "draft",
      additionalKsas: [
        { label: "Reads a diagram", relationship: "required_but_not_measured" },
      ],
    });
    expect(saved.valid).toBe(true);
  });
});
