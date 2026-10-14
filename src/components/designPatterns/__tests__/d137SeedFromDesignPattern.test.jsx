import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DesignPatternLibraryView } from "../DesignPatternBuilder.jsx";

const pattern = {
  id: "dp1",
  name: "Explain a diagram",
  status: "confirmed",
  summary: "Students explain a diagram.",
  rationale: "Explanation is the construct.",
  potentialObservations: [
    { label: "Names the claim" },
    { label: "Traces the arrow" },
  ],
  characteristicFeatures: [{ label: "Diagram is labelled" }],
};

describe("D137 seed control", () => {
  it("sends the picked row indexes and leaves the rest for the server to decline", async () => {
    const user = userEvent.setup();
    const onSeed = vi.fn().mockResolvedValue({
      evidenceModel: { name: "Explain a diagram evidence" },
      taskModel: { name: "Explain a diagram task" },
    });
    render(
      <DesignPatternLibraryView
        patterns={[pattern]}
        competencies={[{ id: "c1", name: "Explain" }]}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onConfirm={vi.fn()}
        onDelete={vi.fn()}
        onSeed={onSeed}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.selectOptions(screen.getByLabelText("Competency"), "c1");
    await user.click(screen.getByRole("checkbox", { name: "Names the claim" }));
    await user.click(screen.getByRole("button", { name: "Seed draft models" }));

    expect(onSeed).toHaveBeenCalledWith({
      id: "dp1",
      competencyId: "c1",
      selections: {
        potentialObservations: [0],
        potentialWorkProducts: [],
        potentialRubrics: [],
        characteristicFeatures: [],
        variableFeatures: [],
      },
    });
  });

  it("does not offer seeding on a draft pattern", async () => {
    const user = userEvent.setup();
    render(
      <DesignPatternLibraryView
        patterns={[{ ...pattern, status: "draft" }]}
        competencies={[{ id: "c1", name: "Explain" }]}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onConfirm={vi.fn()}
        onDelete={vi.fn()}
        onSeed={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("button", { name: "Seed draft models" })).not.toBeInTheDocument();
  });
});
