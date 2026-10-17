import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/api/queries/qMatrixModels", () => ({
  useQMatrixModels: () => ({ data: [], isLoading: false }),
  useDeleteQMatrixModel: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/api/queries/competencies", () => ({
  useCompetencyModels: () => ({ data: [] }),
}));

import { WorkProductLibraryView } from "@/components/workProducts/WorkProductBuilder";
import { TaskModelVariableLibraryView } from "@/components/taskModelVariables/TaskModelVariableBuilder";
import { TemplateLibraryView } from "@/components/templates/TemplateBuilder";
import { DesignPatternLibraryView } from "@/components/designPatterns/DesignPatternBuilder";
import { openDesignPatternStep } from "@/components/designPatterns/__tests__/openDesignPatternStep";
import QMatrixList from "@/components/qMatrix/QMatrixList";

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

  it("shows a finished diagnostic design and where an evidence model cites it", () => {
    render(<QMatrixList onCreate={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getByText("No Q-matrices yet.")).toBeInTheDocument();
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
