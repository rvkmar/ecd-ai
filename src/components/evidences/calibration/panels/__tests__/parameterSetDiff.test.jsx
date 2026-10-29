import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ParameterSetDiff from "../ParameterSetDiff";
import ParameterSetRegistry from "../ParameterSetRegistry";

vi.mock("@/api/queries/evidenceModels", () => ({
  useActivateParameterSet: () => ({
    isPending: false,
    error: null,
    mutate: vi.fn(),
  }),
}));

const activeIrt = {
  parameterSetId: "ps-active",
  parameters: {
    quiet: { a: 1.0, b: 0.1 },
    loud: { a: 1.0, b: 1.2 },
  },
};

const otherIrt = {
  parameterSetId: "ps-other",
  parameters: {
    quiet: { a: 1.0, b: 0.0 },
    loud: { a: 1.0, b: -0.4 },
  },
};

describe("ParameterSetDiff", () => {
  it("lists IRT rows with the largest |Δ| first", () => {
    render(
      <ParameterSetDiff
        activeSet={activeIrt}
        otherSet={otherIrt}
        otherLabel="ps-other"
      />
    );
    const rows = screen.getAllByTestId(/parameter-set-diff-row-/);
    expect(rows[0]).toHaveAttribute("data-testid", "parameter-set-diff-row-loud");
    expect(rows[1]).toHaveAttribute("data-testid", "parameter-set-diff-row-quiet");
    expect(screen.getByText(/largest movement first/i)).toBeInTheDocument();
  });

  it("does not invent numeric drift for Bayesian CPTs", () => {
    render(
      <ParameterSetDiff
        activeSet={{ parameterSetId: "a", parameters: { _kind: "bayesian-cpt" } }}
        otherSet={{ parameterSetId: "b", parameters: { _kind: "bayesian-cpt" } }}
      />
    );
    expect(screen.getByTestId("parameter-set-diff")).toHaveTextContent(
      /inspect both sets/i
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("ParameterSetRegistry compare", () => {
  it("sorts the Compare table by largest movement", async () => {
    const user = userEvent.setup();
    render(
      <ParameterSetRegistry
        evidenceModel={{ id: "em1", status: "confirmed", locked: true }}
        statisticalModel={{
          id: "sm1",
          type: "irt",
          subtype: "2PL",
          activeParameterSetId: "ps-active",
          parameterSets: [
            { ...activeIrt, calibratedAt: "2026-10-29T12:00:00.000Z" },
            { ...otherIrt, calibratedAt: "2026-09-01T12:00:00.000Z" },
          ],
        }}
      />
    );

    await user.selectOptions(
      screen.getByRole("combobox"),
      "ps-other"
    );

    const rows = screen.getAllByTestId(/parameter-set-diff-row-/);
    expect(rows[0]).toHaveAttribute("data-testid", "parameter-set-diff-row-loud");
  });
});
