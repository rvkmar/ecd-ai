import { describe, it, expect } from "vitest";
import { projectTaskSpecFamily } from "../taskModelVariableFamily.js";
import {
  assignmentsFromSpecs,
  taskSpecFamilyMatrix,
} from "../taskSpecFamilyMatrix.js";

const variables = [
  {
    id: "tmv-bloom",
    name: "Cognitive demand",
    type: "categorical",
    possibleValues: [
      { value: "remember", label: "Remember" },
      { value: "understand", label: "Understand" },
      { value: "apply", label: "Apply" },
      { value: "analyze", label: "Analyze" },
      { value: "evaluate", label: "Evaluate" },
    ],
  },
  {
    id: "tmv-register",
    name: "Scenario register",
    type: "categorical",
    possibleValues: [
      { value: "formal", label: "Formal" },
      { value: "informal", label: "Informal" },
    ],
  },
  {
    id: "tmv-stimulus",
    name: "Stimulus policy",
    type: "categorical",
    possibleValues: [{ value: "static", label: "Static" }],
  },
];

const settings = [
  {
    taskModelVariableId: "tmv-bloom",
    variation: "varying",
    allowedValues: ["remember", "understand", "apply", "analyze", "evaluate"],
  },
  {
    taskModelVariableId: "tmv-register",
    variation: "varying",
    allowedValues: ["formal", "informal"],
  },
  {
    taskModelVariableId: "tmv-stimulus",
    variation: "fixed",
    fixedValue: "static",
  },
];

describe("taskSpecFamilyMatrix", () => {
  it("uses varying TMVs as columns and holds the fixed stimulus as a note", () => {
    const assignments = projectTaskSpecFamily(settings, variables);
    expect(assignments).toHaveLength(10);

    const matrix = taskSpecFamilyMatrix(assignments, variables);
    expect(matrix.size).toBe(10);
    expect(matrix.columns.map((col) => col.id)).toEqual([
      "tmv-bloom",
      "tmv-register",
    ]);
    expect(matrix.columns.map((col) => col.label)).toEqual([
      "Cognitive demand",
      "Scenario register",
    ]);
    expect(matrix.fixed).toEqual([
      {
        id: "tmv-stimulus",
        label: "Stimulus policy",
        value: "static",
        valueLabel: "Static",
      },
    ]);
    expect(matrix.rows).toHaveLength(10);
    expect(matrix.rows[0].cells["tmv-bloom"]).toBe("remember");
    expect(matrix.rows[0].labels["tmv-bloom"]).toBe("Remember");
  });

  it("reads the same assignments from generated specs", () => {
    const assignments = projectTaskSpecFamily(settings, variables);
    const specs = assignments.map((tmvAssignment, i) => ({
      id: `tspec${i}`,
      templateId: "tpl1",
      tmvAssignment,
      stale: false,
    }));
    expect(assignmentsFromSpecs(specs)).toEqual(assignments);
    expect(taskSpecFamilyMatrix(assignmentsFromSpecs(specs), variables)).toEqual(
      taskSpecFamilyMatrix(assignments, variables)
    );
  });

  it("has no varying columns when the family is a single empty assignment", () => {
    const matrix = taskSpecFamilyMatrix([[]], variables);
    expect(matrix.columns).toEqual([]);
    expect(matrix.fixed).toEqual([]);
    expect(matrix.rows).toHaveLength(1);
  });
});
