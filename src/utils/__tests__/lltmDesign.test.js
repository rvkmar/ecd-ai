import { describe, expect, it } from "vitest";
import { buildLltmDesign, predictedDifficulty, scoreLltmRows } from "../lltmDesign.js";

const variables = [
  {
    id: "tmv-bloom",
    name: "Cognitive demand",
    type: "categorical",
    possibleValues: [
      { value: "remember", label: "Remember" },
      { value: "apply", label: "Apply" },
    ],
  },
  {
    id: "tmv-register",
    name: "Register",
    type: "categorical",
    possibleValues: [
      { value: "formal", label: "Formal" },
      { value: "informal", label: "Informal" },
    ],
  },
  {
    id: "tmv-stimulus",
    name: "Stimulus",
    type: "categorical",
    possibleValues: [{ value: "static", label: "Static" }],
  },
];

function row(id, bloom, register) {
  return {
    id,
    assignment: [
      { taskModelVariableId: "tmv-bloom", value: bloom },
      { taskModelVariableId: "tmv-register", value: register },
      { taskModelVariableId: "tmv-stimulus", value: "static" },
    ],
  };
}

describe("LLTM design", () => {
  it("uses treatment contrasts and fixes the reference pattern at zero", () => {
    const design = buildLltmDesign(
      [
        row("a", "remember", "formal"),
        row("b", "apply", "formal"),
        row("c", "remember", "informal"),
      ],
      variables
    );
    expect(design.columns.map((column) => column.name)).toEqual([
      "tmv-bloom=apply",
      "tmv-register=informal",
    ]);
    expect(design.columns[0].reference).toBe("remember");
    expect(design.columns[1].reference).toBe("formal");
    expect(design.held.map((hold) => hold.taskModelVariableId)).toEqual(["tmv-stimulus"]);
    expect(design.rows.map((entry) => entry.x)).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
    ]);

    const fit = {
      effects: [
        { name: "tmv-bloom=apply", estimate: 0.7, se: 0.05 },
        { name: "tmv-register=informal", estimate: -0.4, se: 0.06 },
      ],
      vcov: [
        [0.0025, 0],
        [0, 0.0036],
      ],
    };
    expect(predictedDifficulty([0, 0], fit)).toEqual({ b: 0, bSe: 0 });
    const shifted = predictedDifficulty([1, 1], fit);
    expect(shifted.b).toBeCloseTo(0.3, 6);
    expect(shifted.bSe).toBeCloseTo(Math.sqrt(0.0061), 6);
  });

  it("does not score a level the fit never saw", () => {
    const design = buildLltmDesign(
      [row("a", "remember", "formal"), row("b", "apply", "formal")],
      variables
    );
    const scored = scoreLltmRows(
      [{ id: "c", assignment: row("c", "analyze", "formal").assignment }],
      design
    );
    expect(scored[0].ok).toBe(false);
    expect(scored[0].reason).toMatch(/analyze/);
  });
});