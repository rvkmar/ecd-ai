import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  CompetencyWizardProvider,
  useCompetencyWizard,
} from "../CompetencyWizard/CompetencyWizardContext";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ auth: { token: "t", username: "admin1", role: "admin" } }),
}));

vi.mock("@/api/queries/competencies", () => ({
  competencyModelsKey: ["competencyModels"],
  competencyModelKey: (id) => ["competencyModels", id],
  competenciesKey: ["competencies"],
  useCompetencyModels: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/api/queries/curricularPolicies", () => ({
  useCurricularPolicies: () => ({ data: [], isSuccess: true }),
}));

vi.mock("@/api/queries/domainAnalyses", () => ({
  useDomainAnalyses: vi.fn(),
}));

import { useDomainAnalyses } from "@/api/queries/domainAnalyses";

function Probe() {
  const { model, loading } = useCompetencyWizard();
  if (loading || !model) return <p>loading</p>;
  return (
    <div>
      <span data-testid="domain-analysis">{model.domainAnalysisId || ""}</span>
      <span data-testid="perspective">{model.psychologicalPerspective || ""}</span>
    </div>
  );
}

function renderProvider(domainAnalysisId) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CompetencyWizardProvider domainAnalysisId={domainAnalysisId}>
        <Probe />
      </CompetencyWizardProvider>
    </QueryClientProvider>
  );
}

describe("Student Model Domain Analysis handoff", () => {
  beforeEach(() => {
    useDomainAnalyses.mockReturnValue({
      data: [{ id: "da-frac", name: "Fractions", psychologicalPerspective: "trait" }],
      isLoading: false,
    });
  });

  it("seeds a new model with the analysis and copies an empty perspective", async () => {
    renderProvider("da-frac");
    expect(await screen.findByTestId("domain-analysis")).toHaveTextContent("da-frac");
    expect(screen.getByTestId("perspective")).toHaveTextContent("trait");
  });

  it("opens a new model with no analysis when none was handed off", async () => {
    renderProvider("");
    expect(await screen.findByTestId("domain-analysis")).toHaveTextContent("");
    expect(screen.getByTestId("perspective")).toHaveTextContent("");
  });
});
