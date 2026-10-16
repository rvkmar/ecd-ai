import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import DomainAnalysisEditor from "../DomainAnalysisEditor.jsx";

const update = vi.fn();
const confirm = vi.fn();

vi.mock("@/api/queries/qMatrixModels", () => ({
  useQMatrixModels: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/api/queries/domainAnalyses", () => ({
  useDomainAnalyses: vi.fn(),
  useCreateDomainAnalysis: vi.fn(),
  useUpdateDomainAnalysis: vi.fn(),
  useConfirmDomainAnalysis: vi.fn(),
}));

import {
  useDomainAnalyses,
  useCreateDomainAnalysis,
  useUpdateDomainAnalysis,
  useConfirmDomainAnalysis,
} from "@/api/queries/domainAnalyses";

const uploaded = {
  id: "da-uploaded",
  name: "Explaining a labelled scientific diagram",
  status: "draft",
  psychologicalPerspective: "information_processing",
  valuedWork: [{ label: "Explain how the named parts produce what the diagram shows" }],
  taskFeatures: [{ label: "A figure whose parts are already labelled" }],
  representationalForms: [{ label: "Diagram plus a written explanation" }],
  performanceOutcomes: [{ label: "A causal account" }],
  valuedKnowledge: [{ label: "How parts and relations fit together" }],
  knowledgeStructure: [{ label: "Parts and the relations among them" }],
  knowledgeTaskRelationships: [{ label: "The task asks for the relation" }],
};

beforeEach(() => {
  update.mockReset();
  confirm.mockReset();
  update.mockResolvedValue({ ...uploaded });
  confirm.mockResolvedValue({ ...uploaded, status: "confirmed" });
  useDomainAnalyses.mockReturnValue({ data: [uploaded], isLoading: false });
  useCreateDomainAnalysis.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  useUpdateDomainAnalysis.mockReturnValue({ mutateAsync: update, isPending: false });
  useConfirmDomainAnalysis.mockReturnValue({ mutateAsync: confirm, isPending: false });
});

describe("D142 Domain Analysis correction form", () => {
  it("loads an uploaded analysis and saves a corrected statement", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DomainAnalysisEditor />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /Explaining a labelled scientific diagram/ }));
    const knowledge = screen.getByRole("textbox", { name: "Valued knowledge" });
    expect(knowledge).toHaveValue("How parts and relations fit together");

    await user.clear(knowledge);
    await user.type(knowledge, "How the parts of a system relate");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(update).toHaveBeenCalledWith({
      id: "da-uploaded",
      payload: expect.objectContaining({
        name: "Explaining a labelled scientific diagram",
        valuedKnowledge: [{ label: "How the parts of a system relate" }],
        psychologicalPerspective: "information_processing",
      }),
    });
  });

  it("confirms once every section has a statement", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DomainAnalysisEditor />
      </MemoryRouter>
    );
    await user.click(screen.getByRole("button", { name: /Explaining a labelled scientific diagram/ }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(confirm).toHaveBeenCalledWith("da-uploaded");
  });

  it("shows the copied curricular policy and leaves it out of the save", async () => {
    useDomainAnalyses.mockReturnValue({
      data: [{
        ...uploaded,
        contentStandards: {
          id: "cp1",
          name: "Plant diagram curriculum",
          curricularGoals: [{
            code: "CG-1",
            statement: "Name the parts of a plant",
            competencies: [{
              code: "C-1.1",
              statement: "Point to the indicated part",
              learningOutcomes: ["Selects the printed name"],
            }],
          }],
        },
      }],
      isLoading: false,
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DomainAnalysisEditor />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /Explaining a labelled scientific diagram/ }));
    const copied = screen.getByRole("region", { name: "Copied curricular policy" });
    expect(copied).toHaveTextContent("Plant diagram curriculum");
    expect(copied).toHaveTextContent("Name the parts of a plant");
    expect(copied).toHaveTextContent("Selects the printed name");
    expect(within(copied).queryByRole("textbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(update.mock.calls[0][0].payload).not.toHaveProperty("contentStandards");
  });
});
