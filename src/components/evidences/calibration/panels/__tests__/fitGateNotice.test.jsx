import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ParameterSetRegistry from "../ParameterSetRegistry";
import { FitGateSummary } from "../FitGateNotice";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("@/api/queries/evidenceModels", () => ({
  useActivateParameterSet: () => ({
    isPending: false,
    error: null,
    mutate,
  }),
}));

describe("FitGateSummary", () => {
  it("shows a pass", () => {
    render(<FitGateSummary fitGate={{ status: "pass" }} />);
    expect(screen.getByTestId("fit-gate-summary")).toHaveTextContent("Fit gate passed.");
  });

  it("shows the override reason and the checks that failed", () => {
    render(
      <FitGateSummary
        fitGate={{
          status: "override",
          override: { reason: "Pilot sample accepted by the committee", by: "ada" },
          failedChecks: [
            { id: "irt.rmsea", message: "M2 RMSEA is 0.09, above the maximum 0.05." },
          ],
        }}
      />
    );
    expect(screen.getByTestId("fit-gate-summary")).toHaveTextContent(
      "Pilot sample accepted by the committee"
    );
    expect(screen.getByText(/Recorded by ada/)).toBeInTheDocument();
    expect(screen.getByText(/M2 RMSEA is 0.09/)).toBeInTheDocument();
  });

  it("says an already-active set without a gate result stays in place", () => {
    render(<FitGateSummary alreadyActive />);
    expect(screen.getByTestId("fit-gate-summary")).toHaveTextContent(
      /does not turn an existing set off/
    );
  });
});

describe("ParameterSetRegistry fit gate", () => {
  it("shows the stored override on the active set", () => {
    render(
      <ParameterSetRegistry
        evidenceModel={{ id: "em1", status: "confirmed", locked: true }}
        statisticalModel={{
          id: "sm1",
          type: "irt",
          activeParameterSetId: "ps-active",
          parameterSets: [
            {
              parameterSetId: "ps-active",
              calibratedAt: "2026-10-30T00:00:00.000Z",
              parameters: {},
              fitGate: {
                status: "override",
                override: { reason: "Pilot sample accepted by the committee", by: "ada" },
                failedChecks: [
                  { id: "irt.rmsea", message: "M2 RMSEA is 0.09, above the maximum 0.05." },
                ],
              },
            },
          ],
        }}
      />
    );
    expect(screen.getByText(/Pilot sample accepted by the committee/)).toBeInTheDocument();
  });

  it("asks for an override reason after the fit gate refuses activation", async () => {
    mutate.mockReset();
    mutate.mockImplementation((_payload, options) => {
      options.onError({
        body: { fitGate: { status: "fail" } },
      });
    });
    const user = userEvent.setup();
    render(
      <ParameterSetRegistry
        evidenceModel={{ id: "em1", status: "confirmed", locked: true }}
        statisticalModel={{
          id: "sm1",
          type: "irt",
          activeParameterSetId: "ps-active",
          parameterSets: [
            {
              parameterSetId: "ps-active",
              calibratedAt: "2026-10-30T00:00:00.000Z",
              parameters: {},
            },
            {
              parameterSetId: "ps-next",
              status: "candidate",
              calibratedAt: "2026-10-29T00:00:00.000Z",
              parameters: {},
            },
          ],
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Activate candidate" }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("fit-gate-override-form")).toBeInTheDocument();

    await user.type(screen.getByTestId("fit-gate-override-reason"), "Committee accepted the RMSEA");
    mutate.mockImplementation((_payload, options) => options.onSuccess?.());
    await user.click(screen.getByRole("button", { name: "Activate with this reason" }));
    expect(mutate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          parameterSetId: "ps-next",
          fitOverride: { reason: "Committee accepted the RMSEA" },
        }),
      }),
      expect.any(Object)
    );
  });
});
