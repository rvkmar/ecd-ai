import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useTemplates } from "@/api/queries/templates";
import { useCompetencyModels } from "@/api/queries/competencies";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useTaskModels } from "@/api/queries/taskModels";
import { usePresentationModels } from "@/api/queries/presentationModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { useTaskModelVariables } from "@/api/queries/taskModelVariables";
import TemplateTable from "../TemplateTable";
import {
  competencyModels,
  designPatterns,
  evidenceModels,
  presentationModels,
  taskModelVariables,
  taskModels,
  templates,
} from "./templateTabFixture";

vi.mock("@/api/queries/templates", () => ({
  useTemplates: vi.fn(),
}));
vi.mock("@/api/queries/competencies", () => ({
  useCompetencyModels: vi.fn(),
}));
vi.mock("@/api/queries/evidenceModels", () => ({
  useEvidenceModels: vi.fn(),
}));
vi.mock("@/api/queries/taskModels", () => ({
  useTaskModels: vi.fn(),
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

function query(data) {
  return { data, isLoading: false, error: null };
}

function rowCells(name) {
  const row = screen.getByRole("row", { name: new RegExp(name) });
  return within(row).getAllByRole("cell").map((cell) => cell.textContent);
}

function groupCount(card, label) {
  const button = within(card).getByRole("button", {
    name: new RegExp(`^${label}\\s+\\d`),
  });
  return within(button).getByText(/^\d+$/).textContent;
}

describe("Template structure", () => {
  beforeEach(() => {
    useTemplates.mockReturnValue(query(templates));
    useCompetencyModels.mockReturnValue(query(competencyModels));
    useEvidenceModels.mockReturnValue(query(evidenceModels));
    useTaskModels.mockReturnValue(query(taskModels));
    usePresentationModels.mockReturnValue(query(presentationModels));
    useDesignPatterns.mockReturnValue(query(designPatterns));
    useTaskModelVariables.mockReturnValue(query(taskModelVariables));
  });

  it("lists the four bindings, the design pattern, readiness, and family size", () => {
    render(<TemplateTable />);

    expect(screen.getByRole("heading", { name: "Template Structure" })).toBeInTheDocument();
    expect(screen.getByText(/does not store those settings/)).toBeInTheDocument();

    const ready = rowCells("Name the part");
    expect(ready.slice(0, 10)).toEqual([
      "tpl-ready",
      "Name the part",
      "draft",
      "Ready",
      "Plant part naming",
      "Part naming evidence",
      "Name the plant part",
      "Plant part presentation",
      "Explain a diagram",
      "6",
    ]);

    const thin = rowCells("Unfinished family");
    expect(thin.slice(0, 10)).toEqual([
      "tpl-thin",
      "Unfinished family",
      "draft",
      "Not ready",
      "Not linked",
      "Not linked",
      "Not linked",
      "Not linked",
      "Not linked",
      "—",
    ]);

    const confirmed = rowCells("Fraction family");
    expect(confirmed[3]).toBe("Ready");
    expect(confirmed[9]).toBe("1");
    expect(confirmed[8]).toBe("Not linked");
  });

  it("sorts by name and filters by search", async () => {
    const user = userEvent.setup({ delay: null });
    render(<TemplateTable />);

    await user.click(screen.getByRole("button", { name: "Name" }));
    const names = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[1].textContent);
    expect(names).toEqual(["Fraction family", "Name the part", "Unfinished family"]);

    await user.type(screen.getByRole("textbox", { name: "Search templates" }), "Unfinished");
    expect(screen.getByText("tpl-thin")).toBeInTheDocument();
    expect(screen.queryByText("tpl-ready")).not.toBeInTheDocument();
    expect(screen.queryByText("tpl-confirmed")).not.toBeInTheDocument();
  });

  it("counts ingredient groups for the bindings and the bound variables", async () => {
    const user = userEvent.setup({ delay: null });
    render(<TemplateTable />);
    await user.click(screen.getByRole("button", { name: "Ingredients View" }));

    const card = screen.getByRole("heading", { name: "Name the part" }).closest(".rounded-2xl");
    expect(within(card).getByText("Explain a diagram • Ready")).toBeInTheDocument();
    await user.click(within(card).getByRole("heading", { name: "Name the part" }));

    const thin = screen.getByRole("heading", { name: "Unfinished family" }).closest(".rounded-2xl");
    await user.click(within(thin).getByRole("heading", { name: "Unfinished family" }));

    expect(groupCount(card, "Description")).toBe("1");
    expect(groupCount(card, "Student Model")).toBe("1");
    expect(groupCount(card, "Evidence Model")).toBe("1");
    expect(groupCount(card, "Task Model")).toBe("1");
    expect(groupCount(card, "Presentation Model")).toBe("1");
    expect(groupCount(card, "Design pattern")).toBe("1");
    expect(groupCount(card, "Task Model Variables")).toBe("2");

    expect(within(thin).getByText("Not linked • Not ready")).toBeInTheDocument();
    expect(groupCount(thin, "Description")).toBe("0");
    expect(groupCount(thin, "Student Model")).toBe("0");
    expect(groupCount(thin, "Task Model Variables")).toBe("0");
  });
});
