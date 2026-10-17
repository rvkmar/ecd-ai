import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DesignPatternLibraryView } from "../DesignPatternBuilder.jsx";
import { openDesignPatternStep } from "./openDesignPatternStep.js";

const editing = {
  id: "dp2",
  name: "Explain a diagram",
  status: "draft",
  summary: "Students explain a labelled diagram.",
  rationale: "The pattern separates explanation from recognition.",
  focalKsas: [{ label: "Model-based explanation" }],
  additionalKsas: [],
};

describe("D149 additional KSA advisory", () => {
  it("names the other pattern and still saves", async () => {
    const user = userEvent.setup({ delay: null });
    const onUpdate = vi.fn().mockResolvedValue({});

    render(
      <DesignPatternLibraryView
        patterns={[
          {
            id: "dp1",
            name: "Name the part",
            focalKsas: [{ label: "Diagram conventions" }],
          },
          editing,
        ]}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
        onConfirm={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const row = screen.getByText("Explain a diagram").closest("li");
    await user.click(within(row).getByRole("button", { name: "Edit" }));
    await openDesignPatternStep(user, "Additional KSAs");
    await user.click(screen.getByRole("button", { name: "Add Additional KSAs" }));
    await user.type(screen.getByLabelText("Additional KSAs 1"), "Diagram conventions");

    expect(screen.getByRole("note")).toHaveTextContent(
      "“Diagram conventions” is a Focal KSA of Name the part. This is advisory, not blocking."
    );
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onUpdate).toHaveBeenCalledWith({
      id: "dp2",
      payload: expect.objectContaining({
        additionalKsas: [{ label: "Diagram conventions" }],
      }),
    });
  });
});
