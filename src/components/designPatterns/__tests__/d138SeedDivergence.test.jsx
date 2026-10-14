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
};

describe("D138 descendant report", () => {
  it("names the edited observation and leaves confirm available", async () => {
    const user = userEvent.setup();
    render(
      <DesignPatternLibraryView
        patterns={[pattern]}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onConfirm={vi.fn()}
        onDelete={vi.fn()}
        descendantReport={{
          advisory: true,
          descendants: [
            {
              kind: "evidenceModel",
              id: "em1",
              name: "Explain a diagram evidence",
              divergences: [
                {
                  menu: "potentialObservations",
                  label: "Names the claim",
                  reason: "edited",
                  detail: 'Accepted observation "Names the claim" now reads "Names a different claim".',
                },
              ],
            },
            {
              kind: "taskModel",
              id: "tm1",
              name: "Explain a diagram task",
              divergences: [],
            },
          ],
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText(/now reads "Names a different claim"/)).toBeInTheDocument();
    expect(screen.getByText("Matches the seed snapshot.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();
  });
});
