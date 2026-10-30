import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";
import { buildStudentModelSpecification } from "../smVariableSync.js";
import {
  angoffCut,
  bookmarkCut,
  levelForScore,
  performanceLevelErrors,
} from "../performanceLevels.js";

function competency(overrides = {}) {
  return {
    id: "c1",
    name: "Naming",
    variableType: "continuous",
    scale: { min: -3, max: 3 },
    ...overrides,
  };
}

function performanceErrors(overrides = {}) {
  const { errors } = validateEntity("competencies", competency(overrides), {});
  return (errors || []).filter((error) => /performanceLevel/i.test(error));
}

const levels = [
  { label: "Basic", descriptor: "Partial success.", cut: 0 },
  { label: "Proficient", descriptor: "Meets the claim.", cut: 0.7 },
];

describe("performance level validation", () => {
  it("accepts a competency with no performance levels", () => {
    const result = validateEntity("competencies", competency(), {});
    expect(result.errors).toEqual([]);
    expect(performanceErrors()).toEqual([]);
  });

  it("accepts an empty list", () => {
    expect(performanceErrors({ performanceLevels: [] })).toEqual([]);
  });

  it("accepts strictly ascending cuts on a named scale", () => {
    expect(
      performanceErrors({
        performanceLevelScale: "probability",
        performanceLevels: levels,
      })
    ).toEqual([]);
    expect(
      performanceErrors({
        performanceLevelScale: "theta",
        performanceLevels: [
          { label: "Below", descriptor: "Low", cut: -1.5 },
          { label: "At", descriptor: "Mid", cut: 0 },
          { label: "Above", descriptor: "High", cut: 1.2 },
        ],
      })
    ).toEqual([]);
  });

  it("requires a non-empty label, a numeric cut, and a strictly ascending order", () => {
    expect(
      performanceErrors({
        performanceLevelScale: "theta",
        performanceLevels: [{ label: "  ", descriptor: "x", cut: 0 }],
      }).join(" ")
    ).toMatch(/label is required/);

    expect(
      performanceErrors({
        performanceLevelScale: "theta",
        performanceLevels: [{ label: "Basic", descriptor: "x", cut: "0" }],
      }).join(" ")
    ).toMatch(/cut must be a finite number/);

    expect(
      performanceErrors({
        performanceLevelScale: "theta",
        performanceLevels: [
          { label: "Basic", descriptor: "x", cut: 0 },
          { label: "Proficient", descriptor: "y", cut: 0 },
        ],
      }).join(" ")
    ).toMatch(/strictly ascending/);

    expect(
      performanceErrors({
        performanceLevelScale: "theta",
        performanceLevels: [
          { label: "Proficient", descriptor: "y", cut: 1 },
          { label: "Basic", descriptor: "x", cut: 0 },
        ],
      }).join(" ")
    ).toMatch(/strictly ascending/);
  });

  it("states the scale and keeps probability cuts inside 0 to 1", () => {
    expect(
      performanceErrors({
        performanceLevels: [{ label: "Basic", descriptor: "x", cut: 0.2 }],
      }).join(" ")
    ).toMatch(/performanceLevelScale must be theta or probability/);

    expect(
      performanceErrors({
        performanceLevelScale: "raw",
        performanceLevels: [{ label: "Basic", descriptor: "x", cut: 0.2 }],
      }).join(" ")
    ).toMatch(/theta or probability/);

    expect(
      performanceErrors({
        performanceLevelScale: "probability",
        performanceLevels: [{ label: "Basic", descriptor: "x", cut: 1.2 }],
      }).join(" ")
    ).toMatch(/between 0 and 1/);

    expect(
      performanceErrors({ performanceLevelScale: "percent" }).join(" ")
    ).toMatch(/theta or probability/);
  });

  it("rejects a duplicate label and a non-string descriptor", () => {
    expect(
      performanceErrors({
        performanceLevelScale: "theta",
        performanceLevels: [
          { label: "Basic", descriptor: "x", cut: 0 },
          { label: "Basic", descriptor: "y", cut: 1 },
        ],
      }).join(" ")
    ).toMatch(/labels must be unique/);

    expect(
      performanceErrors({
        performanceLevelScale: "theta",
        performanceLevels: [{ label: "Basic", descriptor: 4, cut: 0 }],
      }).join(" ")
    ).toMatch(/descriptor should be string/);
  });

  it("uses the same rules outside validateEntity", () => {
    expect(performanceLevelErrors({ performanceLevels: [] })).toEqual([]);
  });
});

describe("levelForScore", () => {
  const competencyWithLevels = {
    performanceLevelScale: "probability",
    performanceLevels: levels,
  };

  it("returns null when no levels are authored", () => {
    expect(levelForScore({}, 0.9, "probability")).toBeNull();
    expect(levelForScore({ performanceLevels: [] }, 0.9, "probability")).toBeNull();
    expect(levelForScore(null, 0.9, "probability")).toBeNull();
  });

  it("returns null when the score scale does not match the cuts", () => {
    expect(levelForScore(competencyWithLevels, 0.9, "theta")).toBeNull();
    expect(levelForScore(competencyWithLevels, 0.9, undefined)).toBeNull();
  });

  it("returns the highest level whose cut is at or below the score", () => {
    expect(levelForScore(competencyWithLevels, 0, "probability")).toEqual({
      label: "Basic",
      descriptor: "Partial success.",
      cut: 0,
    });
    expect(levelForScore(competencyWithLevels, 0.4, "probability")?.label).toBe("Basic");
    expect(levelForScore(competencyWithLevels, 0.7, "probability")?.label).toBe("Proficient");
    expect(levelForScore(competencyWithLevels, 0.95, "probability")?.label).toBe("Proficient");
  });

  it("returns null below every cut and for a non-numeric score", () => {
    expect(levelForScore(competencyWithLevels, -0.01, "probability")).toBeNull();
    expect(levelForScore(competencyWithLevels, Number.NaN, "probability")).toBeNull();
    expect(levelForScore(competencyWithLevels, "0.8", "probability")).toBeNull();
  });
});

describe("Angoff and bookmark cuts", () => {
  it("averages panelist ratings within each item, then across items", () => {
    // Item means are 0.75 and 0.25. The grand mean of the three ratings is not 0.5.
    expect(angoffCut([[0.5, 1], [0.25]])).toBe(0.5);
    expect(angoffCut([[0, 1]])).toBe(0.5);
  });

  it("returns null for empty or out-of-range Angoff ratings", () => {
    expect(angoffCut([])).toBeNull();
    expect(angoffCut([[]])).toBeNull();
    expect(angoffCut([[1.2]])).toBeNull();
    expect(angoffCut([[-0.1]])).toBeNull();
    expect(angoffCut([["0.5"]])).toBeNull();
    expect(angoffCut(null)).toBeNull();
  });

  it("takes the bookmarked item's difficulty when items increase", () => {
    expect(bookmarkCut([-1, 0, 0.5], 0)).toBe(-1);
    expect(bookmarkCut([-1, 0, 0.5], 2)).toBe(0.5);
    expect(bookmarkCut([{ difficulty: -1 }, { difficulty: 0.4 }], 1)).toBe(0.4);
  });

  it("returns null when bookmark items are unordered or the position is outside them", () => {
    expect(bookmarkCut([1, 0], 0)).toBeNull();
    expect(bookmarkCut([0, 0], 1)).toBeNull();
    expect(bookmarkCut([-1, 0, 0.5], 3)).toBeNull();
    expect(bookmarkCut([-1, 0], 0.5)).toBeNull();
    expect(bookmarkCut([], 0)).toBeNull();
  });
});

describe("student model specification", () => {
  it("keeps performance levels on the exported competency", () => {
    const spec = buildStudentModelSpecification({
      model: { id: "cm1", name: "Naming model", measurementIntent: "unidimensional" },
      competencies: [
        competency({
          performanceLevelScale: "theta",
          performanceLevels: [
            { label: "Proficient", descriptor: "Meets the claim.", cut: 0.2 },
          ],
        }),
      ],
    });
    expect(spec.competencies[0].performanceLevelScale).toBe("theta");
    expect(spec.competencies[0].performanceLevels).toEqual([
      { label: "Proficient", descriptor: "Meets the claim.", cut: 0.2 },
    ]);
  });

  it("omits the fields when no levels are authored", () => {
    const spec = buildStudentModelSpecification({
      model: { name: "Naming model" },
      competencies: [competency()],
    });
    expect(spec.competencies[0].performanceLevels).toBeUndefined();
    expect(spec.competencies[0].performanceLevelScale).toBeUndefined();
  });
});
