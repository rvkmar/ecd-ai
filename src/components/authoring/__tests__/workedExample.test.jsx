import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/api/queries/qMatrixModels", () => ({
  useQMatrixModels: () => ({ data: [], isLoading: false, error: null }),
  useQMatrixModel: () => ({ data: undefined, isLoading: false, error: null }),
  useDeleteQMatrixModel: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateQMatrixModel: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateQMatrixModel: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTransitionQMatrixModel: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/api/queries/competencies", () => ({
  useCompetencyModels: () => ({ data: [], isLoading: false, error: null }),
  useCompetencies: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock("@/api/queries/domainAnalyses", () => ({
  useDomainAnalyses: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock("@/api/queries/evidenceModels", () => ({
  useEvidenceModels: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock("@/api/queries/items", () => ({
  useItems: () => ({ data: [], isLoading: false, error: null }),
}));

import { WorkProductLibraryView } from "@/components/workProducts/WorkProductBuilder";
import { TaskModelVariableLibraryView } from "@/components/taskModelVariables/TaskModelVariableBuilder";
import { TemplateLibraryView } from "@/components/templates/TemplateBuilder";
import { DesignPatternLibraryView } from "@/components/designPatterns/DesignPatternBuilder";
import { openDesignPatternStep } from "@/components/designPatterns/__tests__/openDesignPatternStep";
import QMatrixModelBuilder from "@/components/qMatrix/QMatrixModelBuilder";

describe("worked examples on empty authoring screens", () => {
  it("shows a finished work product and where an item cites it", () => {
    const { rerender } = render(<WorkProductLibraryView workProducts={[]} />);
    const example = screen.getByRole("complementary", { name: "Worked example" });
    expect(example).toHaveTextContent("Selected plant-part name");
    expect(within(example).getByText(/interaction.workProductId/)).toBeInTheDocument();
    rerender(<WorkProductLibraryView workProducts={[{ id: "wp1", name: "Saved", type: "selected_response" }]} />);
    expect(screen.queryByRole("complementary", { name: "Worked example" })).not.toBeInTheDocument();
  });

  it("shows a finished task model variable and where a task model cites it", () => {
    render(<TaskModelVariableLibraryView variables={[]} />);
    expect(screen.getByText("Diagram familiarity")).toBeInTheDocument();
    expect(screen.getByText(/taskModelVariableIds/)).toBeInTheDocument();
  });

  it("shows a finished template and where a design pattern cites it", () => {
    render(<TemplateLibraryView templates={[]} onCreate={vi.fn()} onUpdate={vi.fn()} />);
    expect(screen.getByText("Plant part naming")).toBeInTheDocument();
    expect(screen.getByText(/Design Pattern, which can link this template/)).toBeInTheDocument();
  });

  it("shows a finished diagnostic design and where an evidence model cites it", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QMatrixModelBuilder />
      </MemoryRouter>
    );
    await user.click(screen.getByRole("button", { name: "Manage Diagnostic Designs" }));
    expect(screen.getByText("No diagnostic designs yet.")).toBeInTheDocument();
    expect(screen.getByText(/structureConfig.qMatrixId/)).toBeInTheDocument();
  });

  it("shows a design-pattern example only while that section is blank", async () => {
    const user = userEvent.setup();
    render(<DesignPatternLibraryView patterns={[]} onCreate={vi.fn()} />);
    expect(screen.getByText("Example: Name a plant part from a diagram")).toBeInTheDocument();
    await openDesignPatternStep(user, "Focal KSAs");
    expect(screen.getByText("Example: Names the indicated plant part")).toBeInTheDocument();
    await openDesignPatternStep(user, "Identity");
    await user.type(screen.getByLabelText("Title"), "Named pattern");
    expect(screen.queryByText("Example: Name a plant part from a diagram")).not.toBeInTheDocument();
    await openDesignPatternStep(user, "Focal KSAs");
    expect(screen.getByText("Example: Names the indicated plant part")).toBeInTheDocument();
  });
});
