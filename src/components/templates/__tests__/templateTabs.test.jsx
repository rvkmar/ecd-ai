import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import {
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useConfirmTemplate,
  useDeleteTemplate,
  useTaskSpecPreview,
  useGenerateTaskSpecsFromTemplate,
  useDeleteTaskSpecsForTemplate,
  useEstimateLltm,
} from "@/api/queries/templates";
import { useTaskSpecs } from "@/api/queries/taskSpecs";
import { useCompetencyModels, useCompetencies } from "@/api/queries/competencies";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useTaskModels, useUpdateTaskModel } from "@/api/queries/taskModels";
import { usePresentationModels } from "@/api/queries/presentationModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { useTaskModelVariables } from "@/api/queries/taskModelVariables";
import { useDomainAnalyses } from "@/api/queries/domainAnalyses";
import TemplateBuilder from "../TemplateBuilder";
import {
  competencyModels,
  competencies,
  designPatterns,
  evidenceModels,
  presentationModels,
  readyDraft,
  taskModelVariables,
  taskModels,
  templates,
} from "./templateTabFixture";

vi.mock("@/api/queries/templates", () => ({
  useTemplates: vi.fn(),
  useCreateTemplate: vi.fn(),
  useUpdateTemplate: vi.fn(),
  useConfirmTemplate: vi.fn(),
  useDeleteTemplate: vi.fn(),
  useTaskSpecPreview: vi.fn(),
  useGenerateTaskSpecsFromTemplate: vi.fn(),
  useDeleteTaskSpecsForTemplate: vi.fn(),
  useEstimateLltm: vi.fn(),
}));
vi.mock("@/api/queries/taskSpecs", () => ({
  useTaskSpecs: vi.fn(),
}));
vi.mock("@/api/queries/competencies", () => ({
  useCompetencyModels: vi.fn(),
  useCompetencies: vi.fn(),
}));
vi.mock("@/api/queries/evidenceModels", () => ({
  useEvidenceModels: vi.fn(),
}));
vi.mock("@/api/queries/taskModels", () => ({
  useTaskModels: vi.fn(),
  useUpdateTaskModel: vi.fn(),
}));
vi.mock("@/api/queries/presentationModels", () => ({
  usePresentationModels: vi.fn(),
}));
vi.mock("@/api/queries/designPatterns", () => ({
  useDesignPatterns: vi.fn(),
}));
vi.mock("@/api/queries/taskModelVariables", () => ({
  useTaskModelVariables: vi.fn(),
}));
vi.mock("@/api/queries/domainAnalyses", () => ({
  useDomainAnalyses: vi.fn(),
}));

function query(data = []) {
  return { data, isLoading: false, error: null };
}

function idleMutation() {
  return { mutateAsync: vi.fn(), isPending: false };
}

function renderBuilder(path = "/admin?tab=templates") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TemplateBuilder />
    </MemoryRouter>
  );
}

describe("Template three-tab shell", () => {
  beforeEach(() => {
    useTemplates.mockReturnValue(query(templates));
    useCompetencyModels.mockReturnValue(query(competencyModels));
    useCompetencies.mockReturnValue(query(competencies));
    useEvidenceModels.mockReturnValue(query(evidenceModels));
    useTaskModels.mockReturnValue(query(taskModels));
    usePresentationModels.mockReturnValue(query(presentationModels));
    useDesignPatterns.mockReturnValue(query(designPatterns));
    useTaskModelVariables.mockReturnValue(query(taskModelVariables));
    useDomainAnalyses.mockReturnValue(query([]));
    useCreateTemplate.mockReturnValue(idleMutation());
    useUpdateTemplate.mockReturnValue(idleMutation());
    useConfirmTemplate.mockReturnValue(idleMutation());
    useDeleteTemplate.mockReturnValue(idleMutation());
    useUpdateTaskModel.mockReturnValue(idleMutation());
    useTaskSpecs.mockReturnValue(query([]));
    useTaskSpecPreview.mockReturnValue({ data: undefined, isLoading: false, error: null });
    useGenerateTaskSpecsFromTemplate.mockReturnValue(idleMutation());
    useDeleteTaskSpecsForTemplate.mockReturnValue(idleMutation());
    useEstimateLltm.mockReturnValue(idleMutation());
  });

  it("opens on Dashboard and switches to Structure and Manage", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();

    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Template Structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage Templates" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveClass("bg-primary");
    expect(screen.getByRole("heading", { name: "Template Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Template Structure" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Template Structure" }));
    expect(screen.getByRole("heading", { name: "Template Structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Template Structure" })).toHaveClass("bg-primary");

    await user.click(screen.getByRole("button", { name: "Manage Templates" }));
    expect(screen.getByRole("heading", { name: "Manage Templates" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Template" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Name the part/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Template Dashboard" })).not.toBeInTheDocument();
  });

  it("opens Manage with the focused template loaded", () => {
    renderBuilder(`/admin?tab=templates&focus=${readyDraft.id}`);

    expect(screen.getByRole("button", { name: "Manage Templates" })).toHaveClass("bg-primary");
    expect(screen.queryByRole("heading", { name: "Template Dashboard" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Name$/i)).toHaveValue(readyDraft.name);
    expect(screen.getByLabelText(/Student Model/i)).toHaveValue("cm-plant");
    expect(screen.getByRole("button", { name: "Back to list" })).toBeInTheDocument();
  });

  it("opens the existing form from New and returns to the list on Cancel", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Templates" }));
    await user.click(screen.getByRole("button", { name: "New Template" }));

    expect(screen.getByRole("button", { name: "Create draft" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name$/i)).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Manage Templates" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create draft" })).not.toBeInTheDocument();
  });

  it("edits, duplicates, and deletes from the card", async () => {
    const user = userEvent.setup({ delay: null });
    const remove = vi.fn().mockResolvedValue({ success: true });
    useDeleteTemplate.mockReturnValue({ mutateAsync: remove, isPending: false });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Templates" }));

    await user.click(screen.getByRole("button", { name: /Name the part/ }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText(/^Name$/i)).toHaveValue("Name the part");
    expect(screen.getByLabelText(/Design pattern/i)).toHaveValue("dp-plant");

    await user.click(screen.getByRole("button", { name: "Back to list" }));
    await user.click(screen.getByRole("button", { name: /Unfinished family/ }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(screen.getByLabelText(/^Name$/i)).toHaveValue("Unfinished family copy");
    expect(screen.getByRole("button", { name: "Create draft" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Student Model/i)).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: /Unfinished family/ }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(remove).toHaveBeenCalledWith("tpl-thin");
  });

  it("filters by status and readiness", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Templates" }));

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by lifecycle status" }),
      "confirmed"
    );
    expect(screen.getByRole("button", { name: /Fraction family/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Name the part/ })).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by lifecycle status" }),
      "all"
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by readiness" }),
      "not-ready"
    );
    expect(screen.getByRole("button", { name: /Unfinished family/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Name the part/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Fraction family/ })).not.toBeInTheDocument();
  });
});
