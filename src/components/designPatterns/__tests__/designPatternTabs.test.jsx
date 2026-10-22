import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import {
  useCreateDesignPattern,
  useUpdateDesignPattern,
  useConfirmDesignPattern,
  useDeleteDesignPattern,
  useSeedDesignPattern,
} from "@/api/queries/designPatterns";
import { useDomainAnalyses } from "@/api/queries/domainAnalyses";
import { useTemplates, useUpdateTemplate } from "@/api/queries/templates";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useTaskModels } from "@/api/queries/taskModels";
import { useCompetencies } from "@/api/queries/competencies";
import { useWorkProducts } from "@/api/queries/workProducts";
import { useRubrics } from "@/api/queries/rubrics";
import { useTaskModelVariables } from "@/api/queries/taskModelVariables";
import DesignPatternBuilder from "../DesignPatternBuilder";
import { patterns, readyDraft } from "./designPatternTabFixture";

vi.mock("@/api/apiClient", async () => {
  const actual = await vi.importActual("@/api/apiClient");
  return {
    ...actual,
    apiFetch: vi.fn(() => Promise.resolve({ descendants: [] })),
  };
});

vi.mock("@/api/queries/designPatterns", () => ({
  useDesignPatterns: vi.fn(),
  useCreateDesignPattern: vi.fn(),
  useUpdateDesignPattern: vi.fn(),
  useConfirmDesignPattern: vi.fn(),
  useDeleteDesignPattern: vi.fn(),
  useSeedDesignPattern: vi.fn(),
}));

vi.mock("@/api/queries/domainAnalyses", () => ({
  useDomainAnalyses: vi.fn(),
}));
vi.mock("@/api/queries/templates", () => ({
  useTemplates: vi.fn(),
  useUpdateTemplate: vi.fn(),
}));
vi.mock("@/api/queries/evidenceModels", () => ({
  useEvidenceModels: vi.fn(),
}));
vi.mock("@/api/queries/taskModels", () => ({
  useTaskModels: vi.fn(),
}));
vi.mock("@/api/queries/competencies", () => ({
  useCompetencies: vi.fn(),
}));
vi.mock("@/api/queries/workProducts", () => ({
  useWorkProducts: vi.fn(),
}));
vi.mock("@/api/queries/rubrics", () => ({
  useRubrics: vi.fn(),
}));
vi.mock("@/api/queries/taskModelVariables", () => ({
  useTaskModelVariables: vi.fn(),
}));

function query(data = []) {
  return { data, isLoading: false, error: null };
}

function idleMutation() {
  return { mutateAsync: vi.fn(), isPending: false };
}

function renderBuilder(path = "/admin?tab=designpatterns") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DesignPatternBuilder />
    </MemoryRouter>
  );
}

describe("Design Pattern three-tab shell", () => {
  beforeEach(() => {
    useDesignPatterns.mockReturnValue(query(patterns));
    useDomainAnalyses.mockReturnValue(query([]));
    useTemplates.mockReturnValue(query([]));
    useEvidenceModels.mockReturnValue(query([]));
    useTaskModels.mockReturnValue(query([]));
    useCompetencies.mockReturnValue(query([]));
    useWorkProducts.mockReturnValue(query([]));
    useRubrics.mockReturnValue(query([]));
    useTaskModelVariables.mockReturnValue(query([]));
    useCreateDesignPattern.mockReturnValue(idleMutation());
    useUpdateDesignPattern.mockReturnValue(idleMutation());
    useConfirmDesignPattern.mockReturnValue(idleMutation());
    useDeleteDesignPattern.mockReturnValue(idleMutation());
    useSeedDesignPattern.mockReturnValue(idleMutation());
    useUpdateTemplate.mockReturnValue(idleMutation());
  });

  it("opens on Dashboard and switches to Structure and Manage", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();

    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Design Pattern Structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage Design Pattern" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveClass("bg-primary");
    expect(screen.getByRole("heading", { name: "Design Pattern Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Design Pattern Structure" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Design Pattern Structure" }));
    expect(screen.getByRole("heading", { name: "Design Pattern Structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Design Pattern Structure" })).toHaveClass("bg-primary");

    await user.click(screen.getByRole("button", { name: "Manage Design Pattern" }));
    expect(screen.getByRole("heading", { name: "Manage Design Pattern" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Design Pattern" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Name a plant part/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Design Pattern Dashboard" })).not.toBeInTheDocument();
  });

  it("opens Manage with the focused pattern loaded", () => {
    renderBuilder(`/admin?tab=designpatterns&focus=${readyDraft.id}`);

    expect(screen.getByRole("button", { name: "Manage Design Pattern" })).toHaveClass("bg-primary");
    expect(screen.queryByRole("heading", { name: "Design Pattern Dashboard" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue(readyDraft.name);
    expect(screen.getByRole("heading", { name: "Design Pattern" })).toBeInTheDocument();
  });

  it("opens the existing wizard from New and returns to the list on Cancel", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Design Pattern" }));
    await user.click(screen.getByRole("button", { name: "New Design Pattern" }));

    expect(screen.getByRole("button", { name: "Create draft" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Manage Design Pattern" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create draft" })).not.toBeInTheDocument();
  });

  it("edits, duplicates, and deletes from the card", async () => {
    const user = userEvent.setup({ delay: null });
    const remove = vi.fn().mockResolvedValue({ success: true });
    useDeleteDesignPattern.mockReturnValue({ mutateAsync: remove, isPending: false });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Design Pattern" }));

    await user.click(screen.getByRole("button", { name: /Name a plant part/ }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Name a plant part");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: /Unfinished argument/ }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Unfinished argument copy");
    expect(screen.getByRole("button", { name: "Create draft" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: /Unfinished argument/ }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(remove).toHaveBeenCalledWith("dp-thin");
  });

  it("filters by status and refuses delete while a template still cites the pattern", async () => {
    const user = userEvent.setup({ delay: null });
    useTemplates.mockReturnValue(query([
      { id: "tpl-ready", name: "Name the part", designPatternId: "dp-ready" },
    ]));
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Design Pattern" }));

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by lifecycle status" }), "confirmed");
    expect(screen.getByRole("button", { name: /Explain a diagram/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Name a plant part/ })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by lifecycle status" }), "all");
    await user.click(screen.getByRole("button", { name: /Name a plant part/ }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});
