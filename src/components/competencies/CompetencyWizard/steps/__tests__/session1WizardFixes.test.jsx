import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const wizard = {
  model: {},
  competencies: [],
  updateModelField: vi.fn(),
  patchModel: vi.fn(),
  updateCompetency: vi.fn(),
  addCompetency: vi.fn(),
  removeCompetency: vi.fn(),
  updateConstructFramework: vi.fn(),
  patchConstructFramework: vi.fn(),
};

vi.mock("../../CompetencyWizardContext", () => ({
  useCompetencyWizard: () => wizard,
}));

vi.mock("@/api/queries/domainAnalyses", () => ({
  useDomainAnalyses: () => ({
    data: [
      {
        id: "da1",
        name: "Plant diagram curriculum",
        psychologicalPerspective: "trait",
        valuedWork: [{ label: "Name the indicated part" }],
      },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/api/queries/curricularPolicies", async () => {
  const actual = await vi.importActual("@/api/queries/curricularPolicies");
  return {
    ...actual,
    useCurricularPolicies: () => ({
      data: [
        {
          id: "cp1",
          name: "Plant diagram curriculum",
          curricularGoals: [
            { code: "CG-1", statement: "Name plant parts", competencies: [] },
          ],
        },
      ],
      isLoading: false,
      isError: false,
    }),
  };
});

import Step1ModelIdentity from "../Step1ModelIdentity";
import Step2MeasurementIntent from "../Step2MeasurementIntent";
import Step3ConstructFramework from "../Step3ConstructFramework";
import Step4LatentVariables from "../Step4LatentVariables";
import Step7DomainClassification, { sectionLines } from "../Step7DomainClassification";

describe("sectionLines", () => {
  it("prints a statement label instead of the object itself", () => {
    expect(sectionLines([{ label: "Name the indicated part" }])).toEqual([
      "Name the indicated part",
    ]);
    expect(sectionLines(["Keep a string"])).toEqual(["Keep a string"]);
    expect(sectionLines([{ label: "" }, null])).toEqual([]);
  });
});

describe("Student Model wizard session 1", () => {
  beforeEach(() => {
    wizard.updateModelField.mockClear();
    wizard.patchModel.mockClear();
    wizard.updateCompetency.mockClear();
    wizard.patchConstructFramework.mockClear();
    wizard.model = { locked: false, constructFramework: {} };
    wizard.competencies = [];
  });

  it("drops the Domain Analysis prompt once a perspective is stored", () => {
    wizard.model = {
      locked: false,
      name: "Plant part naming",
      description: "Whether a student can name a plant part on a diagram.",
      domainAnalysisId: "da1",
      psychologicalPerspective: "trait",
    };
    render(<Step1ModelIdentity />);
    expect(
      screen.queryByText("Choose a Domain Analysis to inherit its psychological perspective.")
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Perspective: Trait/)).toBeInTheDocument();
  });

  it("drops the intent prompt once Unidimensional is selected", () => {
    wizard.model = { locked: false, measurementIntent: "unidimensional" };
    wizard.competencies = [];
    render(<Step2MeasurementIntent />);
    expect(screen.getByRole("button", { name: /Unidimensional/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.queryByText("Measurement intent must be selected.")).not.toBeInTheDocument();
  });

  it("keeps each curricular goal inside a full-width label", () => {
    wizard.model = {
      locked: false,
      constructFramework: { policyId: "cp1" },
    };
    render(<Step3ConstructFramework />);
    const label = screen.getByText(/CG-1/).closest("label");
    expect(label.className).toContain("w-full");
    fireEvent.click(label.querySelector("input"));
    expect(wizard.patchConstructFramework).toHaveBeenCalled();
  });

  it("commits the name currently in the field when the box blurs", () => {
    wizard.model = { locked: false, measurementIntent: "unidimensional" };
    wizard.competencies = [
      { id: "c1", name: "", description: "", variableType: "binary" },
    ];
    render(<Step4LatentVariables />);
    fireEvent.click(screen.getByRole("button", { name: /Untitled Competency/ }));
    const input = screen.getByPlaceholderText("Competency name");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
      input,
      "Names a plant part"
    );
    fireEvent.blur(input);
    expect(wizard.updateCompetency).toHaveBeenCalledWith("c1", {
      name: "Names a plant part",
    });
  });

  it("shows Domain Analysis statement labels beside the classification tags", () => {
    wizard.model = { locked: false, domainAnalysisId: "da1" };
    wizard.competencies = [
      { id: "c1", name: "Names a plant part", domain: "", strand: "", facet: "" },
    ];
    render(<Step7DomainClassification />);
    expect(screen.getByText("Name the indicated part")).toBeInTheDocument();
    expect(screen.queryByText("[object Object]")).not.toBeInTheDocument();
  });

  it("commits the domain currently in the field when the box blurs", () => {
    wizard.model = { locked: false, domainAnalysisId: "da1" };
    wizard.competencies = [
      { id: "c1", name: "Names a plant part", domain: "", strand: "", facet: "" },
    ];
    render(<Step7DomainClassification />);
    fireEvent.click(screen.getByRole("button", { name: /Names a plant part/ }));
    const input = screen.getByPlaceholderText("Domain (e.g., Mathematics)");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
      input,
      "Science"
    );
    fireEvent.blur(input);
    expect(wizard.updateCompetency).toHaveBeenCalledWith("c1", { domain: "Science" });
  });
});
