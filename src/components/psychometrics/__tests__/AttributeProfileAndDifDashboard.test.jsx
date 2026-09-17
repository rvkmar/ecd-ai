import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import AttributeProfileDashboard from "../AttributeProfileDashboard";
import DifDashboard from "../DifDashboard";
import { DIF_INVESTIGATION_FRAMING, DIF_FLAG_NOT } from "../difView";

vi.mock("@/api/queries/analysisArtefacts", () => ({
  useAnalysisArtefacts: vi.fn(),
}));

import { useAnalysisArtefacts } from "@/api/queries/analysisArtefacts";

const PROFILE_ARTEFACT = {
  id: "aa-ap-1",
  kind: "attribute-profile-summary",
  jobId: "job-ap-1",
  packageVersion: "node classifyAttributeProfile",
  sampleSize: 4,
  computedAt: "2026-09-16T12:00:00.000Z",
  scope: { evidenceModelId: "em-dina", cohort: "cohort-known-d79" },
  payload: {
    parameters: {
      attributes: {
        attrA: {
          probabilityAveragedMasteryRate: 0.6,
          classificationCountedMasteryRate: 2 / 3,
          nMaster: 2,
          nNonmaster: 1,
          nIndeterminate: 1,
          nAssigned: 3,
          meanExpectedClassificationAccuracy: 0.9,
        },
        attrB: {
          probabilityAveragedMasteryRate: 0.475,
          classificationCountedMasteryRate: 0.5,
          nMaster: 2,
          nNonmaster: 2,
          nIndeterminate: 0,
          nAssigned: 4,
          meanExpectedClassificationAccuracy: 0.775,
        },
      },
      profileDistribution: [
        { profileKey: "attrA=master|attrB=master", count: 1, rate: 0.25 },
      ],
    },
    diagnostics: {
      estimandNotes: {
        probabilityAveragedMasteryRate: "Mean of posterior.estimate.",
        classificationCountedMasteryRate: "nMaster / nAssigned.",
        meanExpectedClassificationAccuracy:
          "Mean of individual ECA — NOT the population CA.",
      },
    },
  },
};

const DIF_ARTEFACT = {
  id: "aa-dif-1",
  kind: "dif-analysis",
  jobId: "job-dif-1",
  packageVersion: "difR 6.1.0",
  sampleSize: 800,
  computedAt: "2026-09-14T12:00:00.000Z",
  scope: { evidenceModelId: "em-irt" },
  payload: {
    statisticalModelId: "sm-irt",
    diagnostics: { method: "difR::difMH", flaggedItemIds: ["Item.5"] },
    parameters: {
      "Item.4": {
        statistic: 0.4,
        pValue: 0.4,
        alphaMH: 1,
        deltaMH: 0,
        etsClass: "A",
        flag: false,
        method: "Mantel-Haenszel",
        pair: "focal vs reference",
      },
      "Item.5": {
        statistic: 0.0001,
        pValue: 0.0001,
        alphaMH: 3,
        deltaMH: -2.4,
        etsClass: "C",
        flag: true,
        method: "Mantel-Haenszel",
        pair: "focal vs reference",
      },
    },
  },
};

describe("AttributeProfileDashboard (D84)", () => {
  beforeEach(() => useAnalysisArtefacts.mockReset());

  it("labels both estimands and shows distinct rates", () => {
    useAnalysisArtefacts.mockReturnValue({
      data: [PROFILE_ARTEFACT],
      isLoading: false,
      isError: false,
    });
    render(<AttributeProfileDashboard />);
    expect(screen.getByTestId("attribute-profile-dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("estimand-legend").textContent).toMatch(
      /Probability-averaged/
    );
    expect(screen.getByTestId("estimand-legend").textContent).toMatch(
      /Classification-counted/
    );
    expect(screen.getByTestId("prob-avg-attrA").textContent).toMatch(/0\.6000/);
    expect(screen.getByTestId("class-count-attrA").textContent).toMatch(/0\.6667/);
    expect(screen.getAllByTestId("provenance-stamp").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("profile-distribution")).toBeInTheDocument();
  });
});

describe("DifDashboard (D84)", () => {
  beforeEach(() => useAnalysisArtefacts.mockReset());

  it("states what a flag means and does not, with ETS band on rows", () => {
    useAnalysisArtefacts.mockReturnValue({
      data: [DIF_ARTEFACT],
      isLoading: false,
      isError: false,
    });
    render(<DifDashboard />);
    expect(screen.getByTestId("dif-dashboard")).toBeInTheDocument();
    const framing = screen.getByTestId("dif-framing");
    expect(framing.textContent).toContain(DIF_INVESTIGATION_FRAMING);
    expect(framing.textContent).toContain(DIF_FLAG_NOT);
    expect(screen.getByTestId("dif-flag-Item.5").textContent).toMatch(
      /investigate item/i
    );
    expect(screen.getByTestId("dif-band-Item.5").textContent).toMatch(/ETS C/);
    expect(screen.getByTestId("provenance-stamp")).toBeInTheDocument();
  });
});
