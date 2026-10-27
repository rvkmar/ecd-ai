import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQMatrixModels } from "@/api/queries/qMatrixModels";
import { useCompetencyModels } from "@/api/queries/competencies";
import { useDomainAnalyses } from "@/api/queries/domainAnalyses";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import DiagnosticDesignTable from "../DiagnosticDesignTable";
import { competencyModels, designs, domainAnalyses } from "./diagnosticDesignTabFixture";

vi.mock("@/api/queries/qMatrixModels", () => ({
  useQMatrixModels: vi.fn(),
}));
vi.mock("@/api/queries/competencies", () => ({
  useCompetencyModels: vi.fn(),
}));
vi.mock("@/api/queries/domainAnalyses", () => ({
  useDomainAnalyses: vi.fn(),
}));
vi.mock("@/api/queries/evidenceModels", () => ({
  useEvidenceModels: vi.fn(),
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

describe("Diagnostic Design structure", () => {
  beforeEach(() => {
    useQMatrixModels.mockReturnValue(query(designs));
    useCompetencyModels.mockReturnValue(query(competencyModels));
    useDomainAnalyses.mockReturnValue(query(domainAnalyses));
    useEvidenceModels.mockReturnValue(query([]));
  });

  it("lists the student model, attributes, entries, domain analysis, and lock", () => {
    render(<DiagnosticDesignTable />);

    expect(screen.getByRole("heading", { name: "Diagnostic Design Structure" })).toBeInTheDocument();
    expect(screen.getByText(/Attributes are binary Student Model Variables/)).toBeInTheDocument();

    const ready = rowCells("Plant part naming design");
    expect(ready.slice(0, 9)).toEqual([
      "qm-ready",
      "Plant part naming design",
      "draft",
      "Ready",
      "Plant part naming",
      "1",
      "1",
      "Plant parts",
      "No",
    ]);

    const thin = rowCells("Unfinished design");
    expect(thin.slice(0, 9)).toEqual([
      "qm-thin",
      "Unfinished design",
      "draft",
      "Not ready",
      "Not linked",
      "0",
      "0",
      "Not linked",
      "No",
    ]);

    const confirmed = rowCells("Fraction design");
    expect(confirmed.slice(2, 9)).toEqual([
      "confirmed",
      "Ready",
      "Fractions",
      "1",
      "1",
      "Force",
      "Yes",
    ]);

    const live = rowCells("Live fraction design");
    expect(live[2]).toBe("operational");
    expect(live[5]).toBe("2");
    expect(live[6]).toBe("3");
    expect(live[7]).toBe("Not linked");
    expect(live[8]).toBe("Yes");
  });

  it("sorts by name and filters by search", async () => {
    const user = userEvent.setup({ delay: null });
    render(<DiagnosticDesignTable />);

    await user.click(screen.getByRole("button", { name: "Name" }));
    const names = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[1].textContent);
    expect(names).toEqual([
      "Fraction design",
      "Live fraction design",
      "Plant part naming design",
      "Reviewed fraction design",
      "Unfinished design",
    ]);

    await user.type(screen.getByRole("textbox", { name: "Search diagnostic designs" }), "Unfinished");
    expect(screen.getByText("qm-thin")).toBeInTheDocument();
    expect(screen.queryByText("qm-ready")).not.toBeInTheDocument();
    expect(screen.queryByText("qm-confirmed")).not.toBeInTheDocument();
  });

  it("counts ingredient groups for attributes, items, and the domain analysis", async () => {
    const user = userEvent.setup({ delay: null });
    render(<DiagnosticDesignTable />);
    await user.click(screen.getByRole("button", { name: "Ingredients View" }));

    const card = screen.getByRole("heading", { name: "Plant part naming design" }).closest(".rounded-2xl");
    expect(within(card).getByText("Plant part naming • Ready")).toBeInTheDocument();
    await user.click(within(card).getByRole("heading", { name: "Plant part naming design" }));

    const thin = screen.getByRole("heading", { name: "Unfinished design" }).closest(".rounded-2xl");
    await user.click(within(thin).getByRole("heading", { name: "Unfinished design" }));

    expect(groupCount(card, "Description")).toBe("1");
    expect(groupCount(card, "Student Model")).toBe("1");
    expect(groupCount(card, "Attributes")).toBe("1");
    expect(groupCount(card, "Items")).toBe("1");
    expect(groupCount(card, "Domain Analysis")).toBe("1");
    expect(groupCount(card, "Version")).toBe("1");
    await user.click(within(card).getByRole("button", { name: /Attributes/ }));
    expect(within(card).getByText("Names the part")).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: /^Items/ }));
    expect(within(card).getAllByText("item-part").length).toBeGreaterThan(0);

    expect(within(thin).getByText("Not linked • Not ready")).toBeInTheDocument();
    expect(groupCount(thin, "Description")).toBe("0");
    expect(groupCount(thin, "Student Model")).toBe("0");
    expect(groupCount(thin, "Attributes")).toBe("0");
    expect(groupCount(thin, "Items")).toBe("0");
    expect(groupCount(thin, "Domain Analysis")).toBe("0");
    expect(groupCount(thin, "Version")).toBe("0");

    const live = screen.getByRole("heading", { name: "Live fraction design" }).closest(".rounded-2xl");
    expect(within(live).getByText("Locked")).toBeInTheDocument();
    expect(within(live).getByText("v3")).toBeInTheDocument();
  });
});
