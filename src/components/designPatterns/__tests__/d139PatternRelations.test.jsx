import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DesignPatternLibraryView } from "../DesignPatternBuilder.jsx";

const parent = {
  id: "dp-parent",
  name: "Problem solving",
  status: "confirmed",
  summary: "A family of situations.",
  rationale: "The argument is worth keeping.",
};

const child = {
  id: "dp-child",
  name: "Well-defined problems",
  status: "draft",
  summary: "A narrower family.",
  rationale: "The specialisation is worth keeping.",
};

describe("D139 relation control", () => {
  it("sends a kind-of citation and does not copy the parent's menus", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <DesignPatternLibraryView
        patterns={[parent, { ...child, potentialObservations: [{ label: "Child observation" }] }]}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
        onConfirm={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const editButtons = screen.getAllByRole("button", { name: "Edit" });
    await user.click(editButtons[1]);
    await user.click(screen.getByRole("button", { name: "Add relation" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Related pattern 1" }), "dp-parent");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "dp-child",
        payload: expect.objectContaining({
          relationships: [{ type: "kind-of", targetPatternId: "dp-parent" }],
          potentialObservations: [{ label: "Child observation" }],
        }),
      })
    );
    expect(JSON.stringify(onUpdate.mock.calls[0][0].payload)).not.toMatch(/Problem solving/);
  });
});
