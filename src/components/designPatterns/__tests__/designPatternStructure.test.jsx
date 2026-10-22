import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { useDomainAnalyses } from "@/api/queries/domainAnalyses";
import { useTemplates } from "@/api/queries/templates";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useTaskModels } from "@/api/queries/taskModels";
import DesignPatternTable from "../DesignPatternTable";
import {
  domainAnalyses,
  evidenceModels,
  patterns,
  taskModels,
  templates,
} from "./designPatternTabFixture";

vi.mock("@/api/queries/designPatterns", () => ({
  useDesignPatterns: vi.fn(),
}));
vi.mock("@/api/queries/domainAnalyses", () => ({
  useDomainAnalyses: vi.fn(),
}));
vi.mock("@/api/queries/templates", () => ({
  useTemplates: vi.fn(),
}));
vi.mock("@/api/queries/evidenceModels", () => ({
  useEvidenceModels: vi.fn(),
}));
vi.mock("@/api/queries/taskModels", () => ({
  useTaskModels: vi.fn(),
}));

function query(data) {
  return { data, isLoading: false, error: null };
}

function rowCells(name) {
  const row = screen.getByRole("row", { name: new RegExp(name) });
  return within(row).getAllByRole("cell").map((cell) => cell.textContent);
}

function groupCount(card, label) {
  const button = within(card).getByRole("button", { name: new RegExp(label) });
  return within(button).getByText(/^\d+$/).textContent;
}

describe("Design Pattern structure", () => {
  beforeEach(() => {
    useDesignPatterns.mockReturnValue(query(patterns));
    useDomainAnalyses.mockReturnValue(query(domainAnalyses));
    useTemplates.mockReturnValue(query(templates));
    useEvidenceModels.mockReturnValue(query(evidenceModels));
    useTaskModels.mockReturnValue(query(taskModels));
  });

  it("lists readiness, the domain analysis name, template count, and seeded models that still point here", () => {
    render(<DesignPatternTable />);

    expect(screen.getByRole("heading", { name: "Design Pattern Structure" })).toBeInTheDocument();
    expect(screen.getByText(/Deleting a pattern drops/)).toBeInTheDocument();

    const ready = rowCells("Name a plant part");
    expect(ready.slice(0, 7)).toEqual([
      "dp-ready",
      "Name a plant part",
      "draft",
      "Ready",
      "Plant structure",
      "1",
      "2",
    ]);

    const thin = rowCells("Unfinished argument");
    expect(thin.slice(0, 7)).toEqual([
      "dp-thin",
      "Unfinished argument",
      "draft",
      "Not ready",
      "Not linked",
      "0",
      "0",
    ]);

    expect(screen.queryByText("Orphan evidence")).not.toBeInTheDocument();
    expect(screen.queryByText("dp-deleted")).not.toBeInTheDocument();
  });

  it("sorts by name and filters by search", async () => {
    const user = userEvent.setup({ delay: null });
    render(<DesignPatternTable />);

    await user.click(screen.getByRole("button", { name: "Name" }));
    const names = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[1].textContent);
    expect(names).toEqual([
      "Explain a diagram",
      "Name a plant part",
      "Unfinished argument",
    ]);

    await user.type(screen.getByRole("textbox", { name: "Search design patterns" }), "Unfinished");
    expect(screen.getByText("dp-thin")).toBeInTheDocument();
    expect(screen.queryByText("dp-ready")).not.toBeInTheDocument();
    expect(screen.queryByText("dp-confirmed")).not.toBeInTheDocument();
  });

  it("counts ingredient groups from the pattern form, linked templates, and seeded models", async () => {
    const user = userEvent.setup({ delay: null });
    render(<DesignPatternTable />);
    await user.click(screen.getByRole("button", { name: "Ingredients View" }));

    const card = screen.getByRole("heading", { name: "Name a plant part" }).closest(".rounded-2xl");
    expect(within(card).getByText("Plant structure • Ready")).toBeInTheDocument();
    await user.click(within(card).getByRole("heading", { name: "Name a plant part" }));

    const thin = screen.getByRole("heading", { name: "Unfinished argument" }).closest(".rounded-2xl");
    await user.click(within(thin).getByRole("heading", { name: "Unfinished argument" }));

    expect(groupCount(card, "Focal KSAs")).toBe("1");
    expect(groupCount(card, "Additional KSAs")).toBe("1");
    expect(groupCount(card, "Potential observations")).toBe("1");
    expect(groupCount(card, "Potential work products")).toBe("1");
    expect(groupCount(card, "Potential rubrics")).toBe("1");
    expect(groupCount(card, "Characteristic features")).toBe("1");
    expect(groupCount(card, "Variable features")).toBe("1");
    expect(groupCount(card, "Relations")).toBe("1");
    expect(groupCount(card, "References")).toBe("1");
    expect(groupCount(card, "Linked templates")).toBe("1");
    expect(groupCount(card, "Seeded models")).toBe("2");

    expect(within(thin).getByText("Not linked • Not ready")).toBeInTheDocument();
    expect(groupCount(thin, "Focal KSAs")).toBe("0");
    expect(groupCount(thin, "Seeded models")).toBe("0");
  });
});
