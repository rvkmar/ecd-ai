// D81 — dashboard shell lists artefacts and embeds the reference chart.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import PsychometricsDashboard from "../PsychometricsDashboard";

vi.mock("@/api/queries/analysisArtefacts", () => ({
  useAnalysisArtefacts: vi.fn(),
}));

import { useAnalysisArtefacts } from "@/api/queries/analysisArtefacts";

describe("PsychometricsDashboard (D81)", () => {
  beforeEach(() => {
    useAnalysisArtefacts.mockReset();
  });

  it("shows empty state and reference chart with provenance stamp", () => {
    useAnalysisArtefacts.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    });

    render(
      <MemoryRouter>
        <PsychometricsDashboard />
      </MemoryRouter>
    );

    expect(screen.getByTestId("psychometrics-empty")).toBeInTheDocument();
    expect(screen.getByTestId("provenance-stamp")).toBeInTheDocument();
    expect(screen.getByText(/job-d81-reference/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "/admin/psychometrics" })).toHaveAttribute(
      "href",
      "/admin/psychometrics"
    );
  });

  it("lists artefacts with stamps", () => {
    useAnalysisArtefacts.mockReturnValue({
      data: [
        {
          id: "aa1",
          kind: "item-analysis",
          jobId: "job-ia",
          packageVersion: "TAM 4.3.25",
          sampleSize: 1000,
          computedAt: "2026-09-16T12:00:00.000Z",
          scope: { evidenceModelId: "em1" },
          payload: {},
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    });

    render(
      <MemoryRouter>
        <PsychometricsDashboard />
      </MemoryRouter>
    );

    expect(screen.getByTestId("psychometrics-artefact-list")).toBeInTheDocument();
    expect(screen.getByText("item-analysis")).toBeInTheDocument();
    expect(screen.getAllByTestId("provenance-stamp").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("job-ia")).toBeInTheDocument();
  });
});
