import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("heading", { name: "Design Patterns" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create draft" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Design Pattern Dashboard" })).not.toBeInTheDocument();
  });

  it("opens Manage with the focused pattern loaded", () => {
    renderBuilder(`/admin?tab=designpatterns&focus=${readyDraft.id}`);

    expect(screen.getByRole("button", { name: "Manage Design Pattern" })).toHaveClass("bg-primary");
    expect(screen.queryByRole("heading", { name: "Design Pattern Dashboard" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue(readyDraft.name);
    expect(screen.getByRole("heading", { name: "Design Patterns" })).toBeInTheDocument();
  });
});
