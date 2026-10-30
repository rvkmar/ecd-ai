import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskModelVariableLibraryView } from "../TaskModelVariableBuilder.jsx";

describe("Task Model Variable covariate effects", () => {
  it("shows predicted LLTM effects for the variable being edited", () => {
    render(
      <TaskModelVariableLibraryView
        variables={[
          {
            id: "tmv-bloom",
            name: "Cognitive demand",
            type: "categorical",
            possibleValues: [
              { value: "remember", label: "Remember" },
              { value: "apply", label: "Apply" },
            ],
          },
        ]}
        focusId="tmv-bloom"
        taskSpecs={[
          {
            id: "spec-1",
            predictedParameters: {
              parameterStatus: "predicted",
              sourceModel: "eRm::LLTM",
              normalization: "The reference pattern is fixed at difficulty 0.",
              effects: [
                {
                  name: "tmv-bloom=apply",
                  role: "level",
                  taskModelVariableId: "tmv-bloom",
                  level: "apply",
                  reference: "remember",
                  label: "Cognitive demand: Apply vs Remember",
                  estimate: 0.7,
                  se: 0.05,
                },
              ],
            },
          },
        ]}
      />
    );

    const note = screen.getByTestId("tmv-covariate-effects");
    expect(note).toHaveTextContent("Apply vs Remember");
    expect(note).toHaveTextContent("+0.7");
    expect(note).toHaveTextContent("eRm::LLTM");
    expect(note).toHaveTextContent("not calibrated");
  });
});
