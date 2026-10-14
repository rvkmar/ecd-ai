import { describe, it, expect } from "vitest";
import {
  schema,
  validateEntity,
  DESIGN_PATTERN_STATUS_VALUES,
  DESIGN_PATTERN_STATUS_MEANINGS,
  DESIGN_PATTERN_PADI_ATTRIBUTES,
} from "../schema.js";
import {
  DESIGN_PATTERN_STATUS_MIRROR,
  designPatternReadiness,
} from "../designPatternReadiness.js";

const PADI_NAMES = [
  "Title",
  "Summary",
  "Rationale",
  "Focal KSAs",
  "Additional KSAs",
  "Potential Observations",
  "Potential Work Products",
  "Potential Rubrics",
  "Characteristic Features",
  "Variable Features",
];

describe("D131 designPatterns schema", () => {
  it("carries every PADI attribute", () => {
    expect(DESIGN_PATTERN_PADI_ATTRIBUTES.map((row) => row.padi)).toEqual(PADI_NAMES);
    for (const row of DESIGN_PATTERN_PADI_ATTRIBUTES) {
      expect(schema.designPatterns[row.field], row.padi).toBeTruthy();
    }
    expect(schema.designPatterns.name).toBe("string");
  });

  it("uses draft and confirmed, and writes a meaning for each", () => {
    expect([...DESIGN_PATTERN_STATUS_VALUES]).toEqual(["draft", "confirmed"]);
    expect(DESIGN_PATTERN_STATUS_VALUES).not.toContain("operational");
    for (const status of DESIGN_PATTERN_STATUS_VALUES) {
      expect(DESIGN_PATTERN_STATUS_MEANINGS[status].length).toBeGreaterThan(20);
      expect(DESIGN_PATTERN_STATUS_MEANINGS[status].toLowerCase()).toMatch(/deliver/);
    }
    expect(DESIGN_PATTERN_STATUS_MIRROR).toEqual([...DESIGN_PATTERN_STATUS_VALUES]);
  });

  it("lets a draft omit the rationale and refuses an empty rationale on confirm", () => {
    const draft = validateEntity(
      "designPatterns",
      { name: "Unfinished", status: "draft" },
      null,
      { strict: false }
    );
    expect(draft.valid).toBe(true);

    const confirmed = validateEntity(
      "designPatterns",
      { name: "Claim", summary: "What it is about.", status: "confirmed", rationale: "   " },
      null,
      { strict: true }
    );
    expect(confirmed.valid).toBe(false);
    expect(confirmed.errors.some((e) => /rationale/i.test(e))).toBe(true);

    const ready = designPatternReadiness(
      { name: "Claim", summary: "What it is about.", status: "confirmed", rationale: "" },
      { strict: true }
    );
    expect(ready.ready).toBe(false);
    expect(ready.errors.some((e) => /rationale/i.test(e))).toBe(true);
  });

  it("refuses operational because a pattern authorises no delivery", () => {
    const result = validateEntity("designPatterns", {
      name: "Live?",
      status: "operational",
      rationale: "Still not a session.",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /operational/.test(e))).toBe(true);
  });

  it("refuses a menu that is not labelled objects", () => {
    const result = validateEntity("designPatterns", {
      name: "Menus",
      status: "draft",
      focalKsas: ["free text"],
      potentialWorkProducts: [{ workProductType: "essay" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /focalKsas\[0\]/.test(e))).toBe(true);
    expect(result.errors.some((e) => /potentialWorkProducts\[0\].label/.test(e))).toBe(true);
  });
});
