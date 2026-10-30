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

    expect(screen.getByTestId("item-analysis-credits")).toHaveTextContent("Software and packages");
    expect(screen.getByTestId("item-analysis-credits")).toHaveTextContent("TAM 4.3.25");
    expect(screen.getByTestId("item-analysis-distractors")).toBeInTheDocument();
    expect(
      screen.getByText(/Dichotomous 0\/1 LSAT7 has no option-level distractors/)
    ).toBeInTheDocument();
  });

  it("renders score histogram and quantile plot from the richer payload", () => {
    useAnalysisArtefacts.mockReturnValue({
      data: [
        {
          ...SAMPLE_ARTEFACT,
          id: "aa-ia-mcq",
          hasReport: true,
          payload: {
            ...SAMPLE_ARTEFACT.payload,
            fitStatistics: { kr20: 0.71, cronbachAlpha: 0.72 },
            diagnostics: {
              ...SAMPLE_ARTEFACT.payload.diagnostics,
              testLevel: {
                scoreFrequency: [
                  { score: 0, n: 2 },
                  { score: 1, n: 8 },
                  { score: 2, n: 10 },
                ],
              },
            },
            parameters: {
              "Item.attractive": {
                pValue: 0.4,
                pointBiserial: 0.35,
                n: 20,
                distractors: {
                  A: {
                    id: "A",
                    keyed: true,
                    n: 8,
                    proportion: 0.4,
                    pointBiserial: 0.5,
                    quantiles: [
                      { quantile: 1, proportion: 0.1, n: 4 },
                      { quantile: 5, proportion: 0.8, n: 4 },
                    ],
                  },
                  C: {
                    id: "C",
                    keyed: false,
                    n: 5,
                    proportion: 0.25,
                    pointBiserial: 0.22,
                    quantiles: [
                      { quantile: 1, proportion: 0.4, n: 4 },
                      { quantile: 5, proportion: 0.1, n: 4 },
                    ],
                  },
                },
              },
            },
          },
        },
      ],
      isLoading: false,
      isError: false,
    });
    render(<ItemAnalysisDashboard />);
    expect(screen.getByTestId("item-analysis-reliability")).toBeInTheDocument();
    expect(screen.getByTestId("item-analysis-score-histogram")).toBeInTheDocument();
    expect(screen.getByTestId("item-analysis-quantile-plot")).toBeInTheDocument();
    expect(screen.getByTestId("open-html-report-item-analysis")).toBeInTheDocument();
  });

  it("shows the frozen template name and hides chapters the snapshot turned off", () => {
    useAnalysisArtefacts.mockReturnValue({
      data: [
        {
          ...SAMPLE_ARTEFACT,
          hasScores: true,
          payload: {
            ...SAMPLE_ARTEFACT.payload,
            reportTemplate: {
              name: "Reviewer CTT",
              audience: "item-reviewer",
              chapters: ["cover", "flags", "scores", "credits"],
            },
            fitStatistics: { kr20: 0.71 },
          },
        },
      ],
      isLoading: false,
      isError: false,
    });
    render(<ItemAnalysisDashboard />);
    expect(screen.getByTestId("item-analysis-template-name")).toHaveTextContent("Reviewer CTT");
    expect(screen.queryByTestId("item-analysis-reliability")).not.toBeInTheDocument();
    expect(screen.getByTestId("item-analysis-table")).toBeInTheDocument();
  });
});
