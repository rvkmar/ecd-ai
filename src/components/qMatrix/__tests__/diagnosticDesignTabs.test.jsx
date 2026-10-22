import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import {
  useQMatrixModels,
  useQMatrixModel,
  useCreateQMatrixModel,
  useUpdateQMatrixModel,
  useTransitionQMatrixModel,
  useDeleteQMatrixModel,
} from "@/api/queries/qMatrixModels";
import { useCompetencyModels, useCompetencies } from "@/api/queries/competencies";
import { useDomainAnalyses } from "@/api/queries/domainAnalyses";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useItems } from "@/api/queries/items";
import QMatrixModelBuilder from "../QMatrixModelBuilder";
import {
  competencyModels,
  designs,
  domainAnalyses,
  readyDraft,
  reviewedDesign,
  thinDraft,
} from "./diagnosticDesignTabFixture";

vi.mock("@/api/queries/qMatrixModels", () => ({
  useQMatrixModels: vi.fn(),
  useQMatrixModel: vi.fn(),
  useCreateQMatrixModel: vi.fn(),
  useUpdateQMatrixModel: vi.fn(),
  useTransitionQMatrixModel: vi.fn(),
  useDeleteQMatrixModel: vi.fn(),
}));
vi.mock("@/api/queries/competencies", () => ({
  useCompetencyModels: vi.fn(),
  useCompetencies: vi.fn(),
}));
vi.mock("@/api/queries/domainAnalyses", () => ({
  useDomainAnalyses: vi.fn(),
}));
vi.mock("@/api/queries/evidenceModels", () => ({
  useEvidenceModels: vi.fn(),
}));
vi.mock("@/api/queries/items", () => ({
  useItems: vi.fn(),
}));

function query(data = []) {
  return { data, isLoading: false, error: null };
}

function idleMutation() {
  return { mutateAsync: vi.fn(), isPending: false };
}

function renderBuilder(path = "/admin?tab=qmatrix") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QMatrixModelBuilder />
    </MemoryRouter>
  );
}

function nameField() {
  return screen.getByPlaceholderText(/Fractions Diagnostic design/);
}

describe("Diagnostic Design three-tab shell", () => {
  beforeEach(() => {
    useQMatrixModels.mockReturnValue(query(designs));
    useQMatrixModel.mockImplementation((id) => query(designs.find((row) => row.id === id)));
    useCompetencyModels.mockReturnValue(query(competencyModels));
    useCompetencies.mockReturnValue(query([]));
    useDomainAnalyses.mockReturnValue(query(domainAnalyses));
    useEvidenceModels.mockReturnValue(query([]));
    useItems.mockReturnValue(query([]));
    useCreateQMatrixModel.mockReturnValue(idleMutation());
    useUpdateQMatrixModel.mockReturnValue(idleMutation());
    useTransitionQMatrixModel.mockReturnValue(idleMutation());
    useDeleteQMatrixModel.mockReturnValue(idleMutation());
  });

  it("opens on Dashboard and switches to Structure and Manage", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();

    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Diagnostic Design Structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage Diagnostic Designs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveClass("bg-primary");
    expect(screen.getByRole("heading", { name: "Diagnostic Design Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Diagnostic Design Structure" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Diagnostic Design Structure" }));
    expect(screen.getByRole("heading", { name: "Diagnostic Design Structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Diagnostic Design Structure" })).toHaveClass("bg-primary");

    await user.click(screen.getByRole("button", { name: "Manage Diagnostic Designs" }));
    expect(screen.getByRole("heading", { name: "Manage Diagnostic Designs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Diagnostic Design" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Plant part naming design/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Diagnostic Design Dashboard" })).not.toBeInTheDocument();
  });

  it("opens Manage with the focused design loaded", async () => {
    renderBuilder(`/admin?tab=qmatrix&focus=${readyDraft.id}`);

    expect(screen.getByRole("button", { name: "Manage Diagnostic Designs" })).toHaveClass("bg-primary");
    expect(screen.queryByRole("heading", { name: "Diagnostic Design Dashboard" })).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue(readyDraft.name)).toBeInTheDocument();
    expect(screen.getByRole("combobox").textContent).toContain("Plant part naming");
    expect(screen.getByRole("checkbox", { name: "Names the part" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Back to list" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("treats id and qMatrixId on the URL as the same deep link", async () => {
    const { unmount } = renderBuilder(`/admin?tab=qmatrix&id=${readyDraft.id}`);
    expect(await screen.findByDisplayValue(readyDraft.name)).toBeInTheDocument();
    unmount();

    renderBuilder(`/admin?tab=qmatrix&qMatrixId=${thinDraft.id}`);
    expect(await screen.findByDisplayValue(thinDraft.name)).toBeInTheDocument();
  });

  it("opens Manage filtered to the Domain Analysis named on the URL", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder("/admin?tab=qmatrix&domainAnalysisId=da-plant");

    expect(screen.getByRole("button", { name: "Manage Diagnostic Designs" })).toHaveClass("bg-primary");
    expect(screen.getByText(/These diagnostic designs name Plant parts/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Plant part naming design/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Unfinished design/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Fraction design/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New Diagnostic Design" }));
    expect(nameField()).toHaveValue("");
    expect(screen.getByText("This design names Plant parts.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText(/These diagnostic designs name Plant parts/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Plant part naming design/ })).toBeInTheDocument();
  });

  it("opens the existing editor from New and returns to the list on Cancel", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Diagnostic Designs" }));
    await user.click(screen.getByRole("button", { name: "New Diagnostic Design" }));

    expect(nameField()).toHaveValue("");
    expect(screen.getByRole("button", { name: "Back to list" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Manage Diagnostic Designs" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Fractions Diagnostic design/)).not.toBeInTheDocument();
  });

  it("edits, duplicates, and deletes from the card", async () => {
    const user = userEvent.setup({ delay: null });
    const remove = vi.fn().mockResolvedValue({ success: true });
    useDeleteQMatrixModel.mockReturnValue({ mutateAsync: remove, isPending: false });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Diagnostic Designs" }));

    await user.click(screen.getByRole("button", { name: /Plant part naming design/ }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByDisplayValue(readyDraft.name)).toBeInTheDocument();
    expect(screen.getByRole("combobox").textContent).toContain("Plant part naming");
    expect(screen.getByText("This design names Plant parts.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to list" }));
    await user.click(screen.getByRole("button", { name: /Unfinished design/ }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(nameField()).toHaveValue("Unfinished design copy");
    expect(screen.getByRole("combobox").textContent).toContain("Select a competency model");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: /Reviewed fraction design/ }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(nameField()).toHaveValue(`${reviewedDesign.name} copy`);
    expect(await screen.findByDisplayValue(reviewedDesign.description)).toBeInTheDocument();
    expect(screen.getByRole("combobox").textContent).toContain("Fractions");
    expect(screen.getByRole("checkbox", { name: "Fraction equivalence" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Fraction addition" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Back to list" }));
    await user.click(screen.getByRole("button", { name: /Fraction design/ }));
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Unfinished design/ }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(remove).toHaveBeenCalledWith("qm-thin");
  });

  it("filters by status and readiness", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Diagnostic Designs" }));

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by lifecycle status" }),
      "confirmed"
    );
    expect(screen.getByRole("button", { name: /Fraction design/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Plant part naming design/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Live fraction design/ })).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by lifecycle status" }),
      "operational"
    );
    expect(screen.getByRole("button", { name: /Live fraction design/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Fraction design/ })).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by lifecycle status" }),
      "all"
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by readiness" }),
      "not-ready"
    );
    expect(screen.getByRole("button", { name: /Unfinished design/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Plant part naming design/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reviewed fraction design/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Fraction design/ })).not.toBeInTheDocument();
  });
});
