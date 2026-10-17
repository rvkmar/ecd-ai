import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useSearchParams } from "react-router-dom";

import DomainAnalysisEditor from "../DomainAnalysisEditor.jsx";
import { DOMAIN_ANALYSIS_ENTITIES } from "@/utils/schema";

const update = vi.fn();
const confirm = vi.fn();
const create = vi.fn();

vi.mock("@/api/queries/qMatrixModels", () => ({
  useQMatrixModels: vi.fn(),
}));
vi.mock("@/api/queries/domainAnalyses", () => ({
  useDomainAnalyses: vi.fn(),
  useCreateDomainAnalysis: vi.fn(),
  useUpdateDomainAnalysis: vi.fn(),
  useConfirmDomainAnalysis: vi.fn(),
}));

import { useDomainAnalyses, useCreateDomainAnalysis, useUpdateDomainAnalysis, useConfirmDomainAnalysis } from "@/api/queries/domainAnalyses";
import { useQMatrixModels } from "@/api/queries/qMatrixModels";

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

const CONFIRM_LABELS = [
  "Psychological perspective",
  ...DOMAIN_ANALYSIS_ENTITIES.map((section) => section.padi),
];

function SearchProbe() {
  const [params] = useSearchParams();
  return <div data-testid="search">{params.toString()}</div>;
}

function renderEditor(entries = ["/"]) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <SearchProbe />
      <DomainAnalysisEditor />
    </MemoryRouter>
  );
}

function checklistButtons() {
  return within(screen.getByRole("navigation", { name: "Confirm requirements" })).getAllByRole("button");
}

beforeEach(() => {
  update.mockReset();
  confirm.mockReset();
  create.mockReset();
  update.mockResolvedValue({ ...uploaded });
  confirm.mockResolvedValue({ ...uploaded, status: "confirmed" });
  create.mockResolvedValue({ id: "da-guided", status: "draft" });
  useDomainAnalyses.mockReturnValue({ data: [uploaded], isLoading: false });
  useQMatrixModels.mockReturnValue({
    data: [{ id: "qm1", name: "Diagram Q-matrix", domainAnalysisId: "da-uploaded" }],
    isLoading: false,
  });
  useCreateDomainAnalysis.mockReturnValue({ mutateAsync: create, isPending: false });
  useUpdateDomainAnalysis.mockReturnValue({ mutateAsync: update, isPending: false });
  useConfirmDomainAnalysis.mockReturnValue({ mutateAsync: confirm, isPending: false });
});

describe("Domain Analysis confirm checklist", () => {
  it("lists the seven sections and the perspective, and each item opens its tab", async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(checklistButtons()).toHaveLength(8);
    for (const label of CONFIRM_LABELS) {
      expect(screen.getByRole("button", { name: `${label} Needed` })).toBeInTheDocument();
    }
    expect(screen.getByText("Domain Analysis name is required.")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Confirm requirements" }).textContent).not.toMatch(
      /name is required/i
    );

    await user.click(screen.getByRole("button", { name: /Explaining a labelled scientific diagram/ }));
    expect(checklistButtons()).toHaveLength(8);
    for (const label of CONFIRM_LABELS) {
      expect(screen.getByRole("button", { name: `${label} Recorded` })).toBeInTheDocument();
    }
    expect(
      screen.queryByText("psychologicalPerspective is required to confirm a Domain Analysis.")
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Valued knowledge Recorded" }));
    expect(screen.getByRole("tab", { name: "Valued knowledge" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("textbox", { name: "Valued knowledge" })).toHaveValue(
      "How parts and relations fit together"
    );
  });

  it("marks only the missing confirm requirements and jumps to them", async () => {
    useDomainAnalyses.mockReturnValue({
      data: [{
        ...uploaded,
        psychologicalPerspective: "",
        knowledgeStructure: [],
      }],
      isLoading: false,
    });
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: /Explaining a labelled scientific diagram/ }));

    expect(screen.getByText("psychologicalPerspective is required to confirm a Domain Analysis.")).toBeInTheDocument();
    expect(screen.getByText("knowledgeStructure must name at least one statement to confirm.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Valued work Recorded" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Knowledge structure Needed" }));
    expect(screen.getByRole("textbox", { name: "Knowledge structure" })).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Psychological perspective Needed" }));
    expect(screen.getByRole("combobox", { name: "Psychological perspective" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Knowledge structure" })).not.toBeInTheDocument();
  });

  it("keeps the Q-matrix author button on its tab and leaves content standards out of the save", async () => {
    const user = userEvent.setup();
    renderEditor(["/?tab=domainanalyses"]);
    await user.click(screen.getByRole("button", { name: /Explaining a labelled scientific diagram/ }));
    await user.click(screen.getByRole("tab", { name: "Q-matrices" }));

    expect(screen.getByRole("region", { name: "Q-matrices for this analysis" })).toHaveTextContent("Diagram Q-matrix");
    await user.click(screen.getByRole("button", { name: "Author a Q-matrix for this analysis" }));
    expect(screen.getByTestId("search").textContent).toContain("tab=qmatrix");
    expect(screen.getByTestId("search").textContent).toContain("domainAnalysisId=da-uploaded");
  });
});

describe("Domain Analysis guided setup", () => {
  it("offers guided setup on an empty list and when analyses already exist", () => {
    useDomainAnalyses.mockReturnValue({ data: [], isLoading: false });
    const { unmount } = renderEditor();
    expect(screen.getByText(/No domain analyses yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guided setup" })).toBeInTheDocument();
    unmount();

    useDomainAnalyses.mockReturnValue({ data: [uploaded], isLoading: false });
    renderEditor();
    expect(screen.getByRole("button", { name: "Guided setup" })).toBeInTheDocument();
  });

  it("lets the parent gate the rail, skips the policy step without writing it, and saves a draft into the workspace", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Guided setup" }));

    expect(screen.getByRole("navigation", { name: "Wizard steps" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Name and perspective" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    const review = screen.getByRole("button", { name: /4 Review/ });
    expect(review).toBeEnabled();
    await user.click(review);
    expect(screen.getByRole("heading", { name: "Name and perspective" })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Diagram explanations");
    await user.selectOptions(screen.getByRole("combobox", { name: "Psychological perspective" }), "trait");
    await user.click(screen.getByRole("button", { name: /2 Curricular policy/ }));

    expect(screen.getByRole("link", { name: "Open Curricular policies" })).toHaveAttribute(
      "href",
      "/admin?tab=curricular-policies"
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Skip" }));
    await user.type(screen.getByRole("textbox", { name: "Valued knowledge" }), "How parts relate");
    await user.type(screen.getByRole("textbox", { name: "Performance outcomes" }), "A causal account");
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("heading", { name: "Review" })).toBeInTheDocument();
    expect(screen.getByText("Diagram explanations")).toBeInTheDocument();
    expect(screen.getByText("Trait")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).not.toHaveProperty("contentStandards");
    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({
      name: "Diagram explanations",
      psychologicalPerspective: "trait",
      valuedKnowledge: [{ label: "How parts relate" }],
      performanceOutcomes: [{ label: "A causal account" }],
    }));
    expect(screen.queryByRole("navigation", { name: "Wizard steps" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Diagram explanations");
  });

  it("cancels without saving and restores the analysis that was open", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: /Explaining a labelled scientific diagram/ }));
    await user.click(screen.getByRole("button", { name: "Guided setup" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(create).not.toHaveBeenCalled();
    expect(screen.queryByRole("navigation", { name: "Wizard steps" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Valued knowledge" }));
    expect(screen.getByRole("textbox", { name: "Valued knowledge" })).toHaveValue(
      "How parts and relations fit together"
    );
  });
});
