import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { useDomainAnalyses } from "@/api/queries/domainAnalyses";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { useQMatrixModels } from "@/api/queries/qMatrixModels";
import { domainAnalysisReadiness } from "@/utils/domainAnalysisReadiness";
import DomainAnalysisDashboard from "../DomainAnalysisDashboard";
import {
  analyses,
  confirmedAnalysis,
  patterns,
  qMatrices,
  readyDraft,
  thinDraft,
} from "./domainAnalysisTabFixture";

vi.mock("@/api/queries/domainAnalyses", () => ({
  useDomainAnalyses: vi.fn(),
}));
vi.mock("@/api/queries/designPatterns", () => ({
  useDesignPatterns: vi.fn(),
}));
vi.mock("@/api/queries/qMatrixModels", () => ({
  useQMatrixModels: vi.fn(),
}));

function stat(label) {
  const counts = screen.getByRole("region", { name: "Domain analysis counts" });
  const card = within(counts).getByText(label).parentElement;
  return card.querySelector(".text-3xl").textContent;
}

describe("Domain Analysis dashboard", () => {
  beforeEach(() => {
    useDomainAnalyses.mockReturnValue({ data: analyses, isLoading: false, error: null });
    useDesignPatterns.mockReturnValue({ data: patterns, isLoading: false, error: null });
    useQMatrixModels.mockReturnValue({ data: qMatrices, isLoading: false, error: null });
  });

  it("counts total, confirmed, draft, drafts that pass strict readiness, and Q-matrix links", () => {
    expect(domainAnalysisReadiness(readyDraft, { strict: true }).ready).toBe(true);
    expect(domainAnalysisReadiness(thinDraft, { strict: true }).ready).toBe(false);
    expect(domainAnalysisReadiness(confirmedAnalysis, { strict: true }).ready).toBe(true);

    render(<DomainAnalysisDashboard />);

    expect(stat("Total")).toBe("3");
    expect(stat("Confirmed")).toBe("1");
    expect(stat("Draft")).toBe("2");
    expect(stat("Ready to confirm")).toBe("1");
    expect(stat("Linked to Q-matrix")).toBe("1");
    expect(screen.getByRole("heading", { name: "Draft vs confirmed" })).toBeInTheDocument();
    expect(screen.getByText("Analyses counted: 3")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Design Pattern link" })).toBeInTheDocument();
    expect(screen.getByText("Whether a design pattern stores a domainAnalysisId.")).toBeInTheDocument();
    expect(screen.getByText("Patterns counted: 5")).toBeInTheDocument();
    expect(screen.queryByText(/Operational/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Locked/)).not.toBeInTheDocument();
  });
});
