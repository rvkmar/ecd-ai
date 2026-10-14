import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DesignPatternLibraryView,
  designPatternPayload,
  DESIGN_PATTERN_MENU_GUIDANCE,
} from "../DesignPatternBuilder.jsx";

const libraries = {
  workProducts: [{ id: "wp1", name: "Written explanation", type: "essay" }],
  rubrics: [{ id: "rb1", name: "Explanation rubric" }],
  taskModelVariables: [{ id: "tmv1", name: "Diagram complexity" }],
  observationChoices: [
    { id: "obs-explain", name: "Names the claim", source: "Explain" },
  ],
};

describe("D134 design pattern menus", () => {
  it("states that the menus are possibilities, not commitments", () => {
    render(
      <DesignPatternLibraryView
        patterns={[]}
        {...libraries}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onConfirm={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText(DESIGN_PATTERN_MENU_GUIDANCE.framing)).toBeInTheDocument();
    expect(
      screen.getByText(DESIGN_PATTERN_MENU_GUIDANCE.potentialWorkProducts)
    ).toBeInTheDocument();
    expect(
      screen.getByText(DESIGN_PATTERN_MENU_GUIDANCE.characteristicFeatures)
    ).toBeInTheDocument();
  });

  it("stores library ids on work products, rubrics, and variable features", () => {
    const form = {
      name: "Explain a diagram",
      summary: "Family of explanation tasks.",
      rationale: "Explanation is worth separating from recognition.",
      focalKsas: [],
      additionalKsas: [],
      potentialObservations: [
        { label: "Names the claim", observationId: "obs-explain" },
      ],
      potentialWorkProducts: [
        { label: "", workProductId: "wp1", workProductType: "essay" },
      ],
      potentialRubrics: [{ label: "Explanation rubric", rubricId: "rb1" }],
      characteristicFeatures: [{ label: "Uses a labelled diagram" }, { label: "  " }],
      variableFeatures: [{ label: "Diagram complexity", taskModelVariableId: "tmv1" }],
    };
    expect(designPatternPayload(form)).toEqual({
      name: "Explain a diagram",
      summary: "Family of explanation tasks.",
      rationale: "Explanation is worth separating from recognition.",
      focalKsas: [],
      additionalKsas: [],
      potentialObservations: [
        { label: "Names the claim", observationId: "obs-explain" },
      ],
      potentialWorkProducts: [
        { label: "wp1", workProductId: "wp1", workProductType: "essay" },
      ],
      potentialRubrics: [{ label: "Explanation rubric", rubricId: "rb1" }],
      characteristicFeatures: [{ label: "Uses a labelled diagram" }],
      variableFeatures: [
        { label: "Diagram complexity", taskModelVariableId: "tmv1" },
      ],
    });
  });

  it("confirms a pattern after the five menus are filled from real objects", async () => {
    const user = userEvent.setup({ delay: null });
    const onUpdate = vi.fn().mockResolvedValue({});
    const onConfirm = vi.fn().mockResolvedValue({});

    render(
      <DesignPatternLibraryView
        patterns={[
          {
            id: "dp1",
            name: "Explain a diagram",
            status: "draft",
            summary: "Family of explanation tasks.",
            rationale: "Explanation is worth separating from recognition.",
          },
        ]}
        {...libraries}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
        onConfirm={onConfirm}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Add Potential Observations" }));
    await user.type(
      screen.getByLabelText("Potential Observations label 1"),
      "Names the claim"
    );
    await user.selectOptions(
      screen.getByLabelText("Potential Observations 1"),
      "obs-explain"
    );
    await user.click(screen.getByRole("button", { name: "Add Potential Work Products" }));
    await user.selectOptions(
      screen.getByLabelText("Potential Work Products 1"),
      "wp1"
    );
    await user.click(screen.getByRole("button", { name: "Add Potential Rubrics" }));
    await user.selectOptions(screen.getByLabelText("Potential Rubrics 1"), "rb1");
    await user.click(
      screen.getByRole("button", { name: "Add Characteristic Features" })
    );
    await user.type(
      screen.getByLabelText("Characteristic Features 1"),
      "Uses a labelled diagram"
    );
    await user.click(screen.getByRole("button", { name: "Add Variable Features" }));
    await user.selectOptions(screen.getByLabelText("Variable Features 1"), "tmv1");

    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(onUpdate).toHaveBeenCalledWith({
      id: "dp1",
      payload: {
        name: "Explain a diagram",
        summary: "Family of explanation tasks.",
        rationale: "Explanation is worth separating from recognition.",
        focalKsas: [],
        additionalKsas: [],
        potentialObservations: [
          { label: "Names the claim", observationId: "obs-explain" },
        ],
        potentialWorkProducts: [
          { label: "Written explanation", workProductId: "wp1", workProductType: "essay" },
        ],
        potentialRubrics: [{ label: "Explanation rubric", rubricId: "rb1" }],
        characteristicFeatures: [{ label: "Uses a labelled diagram" }],
        variableFeatures: [
          { label: "Diagram complexity", taskModelVariableId: "tmv1" },
        ],
      },
    });
    expect(onConfirm).toHaveBeenCalledWith("dp1");
  });
});
