import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useDomainAnalyses } from "@/api/queries/domainAnalyses";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { useQMatrixModels } from "@/api/queries/qMatrixModels";
import DomainAnalysisTable from "../DomainAnalysisTable";
import { analyses, patterns, qMatrices } from "./domainAnalysisTabFixture";

vi.mock("@/api/queries/domainAnalyses", () => ({
  useDomainAnalyses: vi.fn(),
}));
vi.mock("@/api/queries/designPatterns", () => ({
  useDesignPatterns: vi.fn(),
}));
vi.mock("@/api/queries/qMatrixModels", () => ({
  useQMatrixModels: vi.fn(),
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

describe("Domain Analysis structure", () => {
  beforeEach(() => {
    useDomainAnalyses.mockReturnValue(query(analyses));
    useDesignPatterns.mockReturnValue(query(patterns));
    useQMatrixModels.mockReturnValue(query(qMatrices));
  });

  it("lists readiness, the policy name, and counts of citing patterns and Q-matrices", () => {
    render(<DomainAnalysisTable />);

    expect(screen.getByRole("heading", { name: "Domain Analysis Structure" })).toBeInTheDocument();
    expect(screen.getByText(/contentStandards/)).toBeInTheDocument();

    const ready = rowCells("Plant structure");
    expect(ready.slice(0, 7)).toEqual([
      "da-ready",
      "Plant structure",
      "draft",
      "Ready",
      "Plant diagram curriculum",
      "2",
      "1",
    ]);

    const thin = rowCells("Unfinished analysis");
    expect(thin.slice(0, 7)).toEqual([
      "da-thin",
      "Unfinished analysis",
      "draft",
      "Not ready",
      "Not linked",
      "0",
      "0",
    ]);

    const confirmed = rowCells("Fractions");
    expect(confirmed.slice(0, 7)).toEqual([
      "da-confirmed",
      "Fractions",
      "confirmed",
      "Ready",
      "Not linked",
      "1",
      "0",
    ]);

    expect(screen.queryByText("Orphan pattern")).not.toBeInTheDocument();
    expect(screen.queryByText("Orphan Q-matrix")).not.toBeInTheDocument();
    expect(screen.queryByText("da-missing")).not.toBeInTheDocument();
  });

  it("sorts by name and filters by search", async () => {
    const user = userEvent.setup({ delay: null });
    render(<DomainAnalysisTable />);

    await user.click(screen.getByRole("button", { name: "Name" }));
    const names = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[1].textContent);
    expect(names).toEqual(["Fractions", "Plant structure", "Unfinished analysis"]);

    await user.type(screen.getByRole("textbox", { name: "Search domain analyses" }), "Unfinished");
    expect(screen.getByText("da-thin")).toBeInTheDocument();
    expect(screen.queryByText("da-ready")).not.toBeInTheDocument();
    expect(screen.queryByText("da-confirmed")).not.toBeInTheDocument();
  });

  it("counts ingredient groups from the seven sections, the policy, patterns, and Q-matrices", async () => {
    const user = userEvent.setup({ delay: null });
    render(<DomainAnalysisTable />);
    await user.click(screen.getByRole("button", { name: "Ingredients View" }));

    const card = screen.getByRole("heading", { name: "Plant structure" }).closest(".rounded-2xl");
    expect(within(card).getByText("Plant diagram curriculum • Ready")).toBeInTheDocument();
    await user.click(within(card).getByRole("heading", { name: "Plant structure" }));

    const thin = screen.getByRole("heading", { name: "Unfinished analysis" }).closest(".rounded-2xl");
    await user.click(within(thin).getByRole("heading", { name: "Unfinished analysis" }));

    expect(groupCount(card, "Valued work")).toBe("2");
    expect(groupCount(card, "Task features")).toBe("1");
    expect(groupCount(card, "Representational forms")).toBe("1");
    expect(groupCount(card, "Performance outcomes")).toBe("1");
    expect(groupCount(card, "Valued knowledge")).toBe("1");
    expect(groupCount(card, "Knowledge structure")).toBe("1");
    expect(groupCount(card, "Knowledge-task relationships")).toBe("1");
    expect(groupCount(card, "Perspective")).toBe("1");
    expect(groupCount(card, "Linked policy")).toBe("3");
    expect(groupCount(card, "Design patterns")).toBe("2");
    expect(groupCount(card, "Q-matrices")).toBe("1");

    expect(within(thin).getByText("Not linked • Not ready")).toBeInTheDocument();
    expect(groupCount(thin, "Valued work")).toBe("0");
    expect(groupCount(thin, "Perspective")).toBe("0");
    expect(groupCount(thin, "Linked policy")).toBe("0");
    expect(groupCount(thin, "Design patterns")).toBe("0");
    expect(groupCount(thin, "Q-matrices")).toBe("0");
  });
});
