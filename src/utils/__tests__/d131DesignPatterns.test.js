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

  it("refuses a work-product type string in place of a workProductId", () => {
    const result = validateEntity(
      "designPatterns",
      {
        name: "Typed",
        status: "draft",
        potentialWorkProducts: [{ label: "Essay", workProductType: "essay" }],
      },
      { workProducts: [{ id: "wp1", name: "Essay", type: "essay" }] }
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /workProductId is required/.test(e))).toBe(true);
  });

  it("lets confirm keep empty menus and accepts library ids when present", () => {
    const empty = validateEntity(
      "designPatterns",
      {
        name: "Bare",
        summary: "Family of explanation tasks.",
        rationale: "Explanation is worth separating from recognition.",
        status: "confirmed",
      },
      { workProducts: [], rubrics: [], taskModelVariables: [] },
      { strict: true }
    );
    expect(empty.valid).toBe(true);

    const db = {
      workProducts: [{ id: "wp1", name: "Written explanation", type: "essay" }],
      rubrics: [{ id: "rb1", name: "Explanation rubric" }],
      taskModelVariables: [{ id: "tmv1", name: "Diagram complexity" }],
      evidenceModels: [
        { id: "em1", name: "Explain", observables: [{ id: "obs-explain", statement: "Names the claim" }] },
      ],
    };
    const filled = validateEntity(
      "designPatterns",
      {
        name: "Filled",
        summary: "Family of explanation tasks.",
        rationale: "Explanation is worth separating from recognition.",
        status: "confirmed",
        potentialObservations: [
          { label: "Names the claim", observationId: "obs-explain" },
        ],
        potentialWorkProducts: [
          { label: "Written explanation", workProductId: "wp1", workProductType: "essay" },
        ],
        potentialRubrics: [{ label: "Explanation rubric", rubricId: "rb1" }],
        characteristicFeatures: [{ label: "Uses a labelled diagram" }],
        variableFeatures: [{ label: "Diagram complexity", taskModelVariableId: "tmv1" }],
      },
      db,
      { strict: true }
    );
    expect(filled.valid).toBe(true);

    const unknown = validateEntity(
      "designPatterns",
      {
        name: "Unknown",
        status: "draft",
        potentialWorkProducts: [{ label: "Missing", workProductId: "wp-missing" }],
      },
      db
    );
    expect(unknown.valid).toBe(false);
    expect(unknown.errors.some((e) => /wp-missing/.test(e))).toBe(true);
  });
});
