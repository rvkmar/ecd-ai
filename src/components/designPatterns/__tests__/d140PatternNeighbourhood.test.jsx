import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
  status: "confirmed",
  summary: "A narrower family.",
  rationale: "The specialisation is worth keeping.",
  relationships: [{ type: "kind-of", targetPatternId: "dp-parent" }],
};

const unrelated = {
  id: "dp-other",
  name: "Unrelated family",
  status: "draft",
  summary: "Somewhere else.",
  rationale: "Not in this neighbourhood.",
};

describe("D140 neighbourhood", () => {
  it("shows the citation and the diverged seeded model, and opens the parent", async () => {
    const user = userEvent.setup();
    render(
      <DesignPatternLibraryView
        patterns={[parent, child, unrelated]}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onConfirm={vi.fn()}
        onDelete={vi.fn()}
        descendantReport={{
          designPatternId: "dp-child",
          descendants: [
            {
              kind: "evidenceModel",
              id: "em1",
              name: "Child evidence",
              divergences: [{ reason: "edited", detail: "statement changed" }],
            },
          ],
        }}
      />
    );

    const editButtons = screen.getAllByRole("button", { name: "Edit" });
    await user.click(editButtons[1]);

    const list = screen.getByRole("list", {
      name: "Patterns and seeded models in this neighbourhood",
    });
    expect(within(list).getByText("Well-defined problems (this pattern)")).toBeInTheDocument();
    expect(within(list).getByText("Problem solving (kind-of)")).toBeInTheDocument();
    expect(within(list).getByText("Child evidence (seeded, diverged)")).toBeInTheDocument();
    expect(within(list).queryByText(/Unrelated family/)).not.toBeInTheDocument();

    await user.click(within(list).getByRole("button", { name: "Open Problem solving" }));
    expect(within(list).getByText("Problem solving (this pattern)")).toBeInTheDocument();
    expect(within(list).queryByText(/Child evidence/)).not.toBeInTheDocument();
  });
});
