import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import PsychometricsDashboard from "../PsychometricsDashboard";

vi.mock("@/api/queries/analysisArtefacts", () => ({
  useAnalysisArtefacts: vi.fn(),
}));
vi.mock("@/api/queries/evidenceModels", () => ({
  useEvidenceModels: vi.fn(() => ({ data: [] })),
}));
vi.mock("@/api/queries/taskModels", () => ({
  useTaskModels: vi.fn(() => ({ data: [] })),
}));
vi.mock("@/api/queries/assemblyModels", () => ({
  useAssemblyModels: vi.fn(() => ({ data: [] })),
}));

import { useAnalysisArtefacts } from "@/api/queries/analysisArtefacts";

describe("PsychometricsDashboard (D81/D82)", () => {
  beforeEach(() => {
    useAnalysisArtefacts.mockReset();
    useAnalysisArtefacts.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    });
  });

  it("defaults to item analysis panel", () => {
    render(
      <MemoryRouter>
        <PsychometricsDashboard />
      </MemoryRouter>
    );
    expect(screen.getByTestId("item-analysis-empty")).toBeInTheDocument();
  });

  it("opens the test information panel", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PsychometricsDashboard />
      </MemoryRouter>
    );
    await user.click(screen.getByRole("tab", { name: "Test information" }));
    expect(screen.getByTestId("test-information-empty")).toBeInTheDocument();
  });

  it("shows catalogue empty state and reference chart with stamp", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PsychometricsDashboard />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("tab", { name: "Artefact catalogue" }));
    expect(screen.getByTestId("psychometrics-empty")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Reference chrome" }));
    expect(screen.getByTestId("provenance-stamp")).toBeInTheDocument();
    expect(screen.getByText(/job-d81-reference/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "/admin/psychometrics" })).toHaveAttribute(
      "href",
      "/admin/psychometrics"
    );
  });
});
