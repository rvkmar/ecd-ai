import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PerspectiveAtDecision from "../PerspectiveAtDecision";
import { readStudentPerspective } from "@/utils/perspectiveInheritance";
import StatisticalModelSelector from "../../evidences/EvidenceWizard/components/StatisticalModelSelector";
import { TemplateLibraryView } from "../../templates/TemplateBuilder";

const analysis = {
  id: "da1",
  name: "Fractions",
  psychologicalPerspective: "information_processing",
};

vi.mock("@/api/queries/domainAnalyses", () => ({
  useDomainAnalyses: () => ({
    data: [analysis],
  }),
}));

vi.mock("../../evidences/EvidenceWizard/EvidenceWizardContext", () => ({
  useEvidenceWizardContext: () => ({
    selectedCompetency: { id: "c1", name: "Name a part", variableType: "binary" },
    selectedCompetencyModel: {
      id: "cm1",
      domainAnalysisId: "da1",
      psychologicalPerspective: "trait",
    },
  }),
}));

describe("perspective at a decision", () => {
  it("shows an inherited perspective and a Student Model override", () => {
    const inherited = readStudentPerspective(
      { domainAnalysisId: "da1", psychologicalPerspective: "information_processing" },
      [analysis]
    );
    const override = readStudentPerspective(
      { domainAnalysisId: "da1", psychologicalPerspective: "trait" },
      [analysis]
    );
    const { rerender } = render(<PerspectiveAtDecision reading={inherited} />);
    expect(screen.getByText(/Declared on Fractions/)).toBeInTheDocument();
    rerender(<PerspectiveAtDecision reading={override} />);
    expect(screen.getByText(/Stored on the Student Model until it is rebuilt from Fractions/)).toBeInTheDocument();
  });

  it("shows the effective perspective beside the statistical model choice", () => {
    render(
      <StatisticalModelSelector
        model={{ id: "s1", type: "irt", structureConfig: {} }}
        onChange={() => {}}
      />
    );
    expect(screen.getByText(/Stored on the Student Model until it is rebuilt from Fractions/)).toBeInTheDocument();
  });

  it("shows the effective perspective when a template binds a Student Model", async () => {
    const user = userEvent.setup();
    render(
      <TemplateLibraryView
        competencyModels={[
          {
            id: "cm1",
            name: "Plant parts",
            domainAnalysisId: "da1",
            psychologicalPerspective: "information_processing",
          },
        ]}
        domainAnalyses={[analysis]}
        competencies={[]}
        evidenceModels={[]}
        taskModels={[]}
        presentationModels={[]}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onConfirm={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.queryByText(/^Perspective:/)).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/Student Model/i), "cm1");
    expect(screen.getByText(/Declared on Fractions/)).toBeInTheDocument();
  });
});
