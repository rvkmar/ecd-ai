import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TestInformationDashboard from "../TestInformationDashboard";

vi.mock("@/api/queries/analysisArtefacts", () => ({
  useAnalysisArtefacts: vi.fn(),
}));
vi.mock("@/api/queries/assemblyModels", () => ({
  useAssemblyModels: vi.fn(),
}));

import { useAnalysisArtefacts } from "@/api/queries/analysisArtefacts";
import { useAssemblyModels } from "@/api/queries/assemblyModels";

const CURVE_ARTEFACT = {
  id: "aa-ti-1",
  kind: "test-information",
  jobId: "job-ti-1",
  packageVersion: "analytic-2PL Fisher",
  sampleSize: 10,
  computedAt: "2026-09-16T12:00:00.000Z",
  scope: { evidenceModelId: "em-irt" },
  payload: {
    statisticalModelId: "sm-irt",
    parameters: {
      theta: [-2, -1, 0, 1, 2],
      information: [0.2, 0.5, 0.8, 0.5, 0.2],
      // SEM = 1/sqrt(I) ≈ 2.24, 1.41, 1.12, 1.41, 2.24 — all above 0.35
      conditionalSEM: [2.236, 1.414, 1.118, 1.414, 2.236],
    },
    fitStatistics: { kr20: 0.35, marginalReliability: null },
    diagnostics: {
      reliabilityNote:
        "fitStatistics.kr20 is classical KR-20. I(θ) and marginalReliability are IRT.",
      authority: "test-information informs only.",
    },
  },
};

const ASSEMBLY = [
  {
    id: "am-irt",
    name: "IRT assembly",
    targetsBySMV: [{ smvId: "theta", requiredSEM: 0.35 }],
  },
];

describe("TestInformationDashboard (D83)", () => {
  beforeEach(() => {
    // Radix Select uses pointer capture; jsdom does not implement it.
    if (typeof Element !== "undefined" && !Element.prototype.hasPointerCapture) {
      Element.prototype.hasPointerCapture = () => false;
      Element.prototype.setPointerCapture = () => {};
      Element.prototype.releasePointerCapture = () => {};
    }

    useAnalysisArtefacts.mockReset();
    useAssemblyModels.mockReset();
    useAssemblyModels.mockReturnValue({ data: ASSEMBLY });
  });

  it("shows empty state when no artefacts", () => {
    useAnalysisArtefacts.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    render(<TestInformationDashboard />);
    expect(screen.getByTestId("test-information-empty")).toBeInTheDocument();
  });

  it("renders curve with stamps and never-meets banner when SEM stays above target", async () => {
    const user = userEvent.setup();
    useAnalysisArtefacts.mockReturnValue({
      data: [CURVE_ARTEFACT],
      isLoading: false,
      isError: false,
    });
    render(<TestInformationDashboard />);

    expect(screen.getByTestId("test-information-dashboard")).toBeInTheDocument();
    expect(screen.getAllByTestId("provenance-stamp").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("job-ti-1").length).toBeGreaterThanOrEqual(1);

    expect(screen.getByTestId("reliability-kr20").textContent).toMatch(/0\.3500/);
    expect(
      screen.getByText(/fitStatistics.kr20 is classical KR-20/)
    ).toBeInTheDocument();

    // Open Assembly overlay so requiredSEM appears and never-meets fires.
    await user.click(screen.getByRole("combobox", { name: /Overlay Assembly requiredSEM/i }));
    await user.click(await screen.findByRole("option", { name: /IRT assembly · theta · SEM≤0\.35/i }));

    expect(screen.getByTestId("sem-never-meets")).toBeInTheDocument();
    expect(screen.getByTestId("sem-never-meets").textContent).toMatch(
      /never reaches SEM ≤ 0\.35/
    );
  });
});
