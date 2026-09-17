import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import ItemAnalysisDashboard from "../ItemAnalysisDashboard";

vi.mock("@/api/queries/analysisArtefacts", () => ({
  useAnalysisArtefacts: vi.fn(),
}));
vi.mock("@/api/queries/evidenceModels", () => ({
  useEvidenceModels: vi.fn(() => ({ data: [{ id: "em-ctt", name: "CTT EM" }] })),
}));
vi.mock("@/api/queries/taskModels", () => ({
  useTaskModels: vi.fn(() => ({ data: [{ id: "tm1", name: "Task 1" }] })),
}));

import { useAnalysisArtefacts } from "@/api/queries/analysisArtefacts";

const SAMPLE_ARTEFACT = {
  id: "aa-ia-1",
  kind: "item-analysis",
  jobId: "job-ia-1",
  packageVersion: "TAM 4.3.25",
  sampleSize: 1000,
  computedAt: "2026-09-16T12:00:00.000Z",
  scope: { evidenceModelId: "em-ctt", taskModelId: null },
  payload: {
    statisticalModelId: "sm-ctt",
    diagnostics: {
      distractorsNote: "Dichotomous 0/1 LSAT7 has no option-level distractors.",
      authority:
        "Operational CTT readiness comes only from ctt-statistics → parameterSets.",
    },
    parameters: {
      "Item.4": { pValue: 0.606, pointBiserial: 0.35, n: 1000, distractors: null },
      "Item.5": { pValue: 0.843, pointBiserial: 0.04, n: 1000, distractors: null },
      "Item.hard": { pValue: 0.12, pointBiserial: 0.4, n: 1000, distractors: null },
    },
  },
};

describe("ItemAnalysisDashboard (D82)", () => {
  beforeEach(() => {
    useAnalysisArtefacts.mockReset();
  });

  it("renders empty state when no item-analysis artefacts", () => {
    useAnalysisArtefacts.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    render(<ItemAnalysisDashboard />);
    expect(screen.getByTestId("item-analysis-empty")).toBeInTheDocument();
  });

  it("renders from a real artefact with provenance stamps and actionable flags", () => {
    useAnalysisArtefacts.mockReturnValue({
      data: [SAMPLE_ARTEFACT],
      isLoading: false,
      isError: false,
    });
    render(<ItemAnalysisDashboard />);

    expect(screen.getByTestId("item-analysis-dashboard")).toBeInTheDocument();
    expect(screen.getAllByTestId("provenance-stamp").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("job-ia-1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("TAM 4.3.25").length).toBeGreaterThanOrEqual(1);

    expect(screen.getByTestId("item-analysis-table")).toBeInTheDocument();
    const lowFlag = screen.getByTestId("flag-Item.5-lowDiscrimination");
    expect(lowFlag.textContent).toMatch(/0\.20/);
    expect(lowFlag.textContent).toMatch(/review the distractors or retire/i);

    const hardFlag = screen.getByTestId("flag-Item.hard-tooHard");
    expect(hardFlag.textContent).toMatch(/0\.20/);
    expect(hardFlag.textContent).toMatch(/simplify|keying/i);

    expect(screen.getByTestId("item-analysis-distractors")).toBeInTheDocument();
    expect(
      screen.getByText(/Dichotomous 0\/1 LSAT7 has no option-level distractors/)
    ).toBeInTheDocument();
  });
});
