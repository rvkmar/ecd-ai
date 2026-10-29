import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Step6ItemMapping from "../steps/Step6ItemMapping.jsx";

const draft = {
  expectedObservations: [
    { observationId: "o1", evidenceModelId: "em1", required: true },
  ],
  itemMappings: [
    { itemId: "it1", observationId: "o1", evidenceModelId: "em1" },
  ],
};

const items = [
  { id: "it1", name: "Name the part", status: "confirmed", stem: "Which part?" },
];

describe("Step6ItemMapping", () => {
  it("shows derived coverage and does not offer mapping checkboxes", () => {
    render(
      <Step6ItemMapping
        draft={draft}
        availableItems={items}
        observationLookup={{ o1: { statement: "Names the part" } }}
      />
    );

    expect(screen.getAllByText("Names the part").length).toBeGreaterThan(0);
    expect(screen.getByText("Which part?")).toBeInTheDocument();
    expect(screen.getByText(/1 item/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.getByText(/Author items in the Item Bank/i)
    ).toBeInTheDocument();
  });

  it("explains an empty family instead of inviting ticks", () => {
    render(
      <Step6ItemMapping
        draft={{ ...draft, itemMappings: [] }}
        availableItems={items}
        observationLookup={{ o1: { statement: "Names the part" } }}
      />
    );

    expect(
      screen.getByText(/No confirmed items instantiate this Task Model yet/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
