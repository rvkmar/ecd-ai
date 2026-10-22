import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAssemblyModels } from "@/api/queries/assemblyModels";
import { useCompetencyModels } from "@/api/queries/competencies";
import { usePolicies } from "@/api/queries/policies";
import AssemblyModelTable from "../AssemblyModelTable";
import { assemblyModels, competencyModels, policies } from "./assemblyTabFixture";

vi.mock("@/api/queries/assemblyModels", () => ({
  useAssemblyModels: vi.fn(),
}));
vi.mock("@/api/queries/competencies", () => ({
  useCompetencyModels: vi.fn(),
}));
vi.mock("@/api/queries/policies", () => ({
  usePolicies: vi.fn(),
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

describe("Assembly structure", () => {
  beforeEach(() => {
    useAssemblyModels.mockReturnValue(query(assemblyModels));
    useCompetencyModels.mockReturnValue(query(competencyModels));
    usePolicies.mockReturnValue(query(policies));
  });

  it("lists the student model, targets, stopping rules, policy, and lock", () => {
    render(<AssemblyModelTable />);

    expect(screen.getByRole("heading", { name: "Assembly Structure" })).toBeInTheDocument();
    expect(screen.getByText(/Student Model owns the variables/)).toBeInTheDocument();

    const ready = rowCells("Plant part naming assembly");
    expect(ready.slice(0, 9)).toEqual([
      "am-ready",
      "Plant part naming assembly",
      "draft",
      "Ready",
      "Plant part naming",
      "1",
      "min 1, max 3, targets met",
      "Fixed form",
      "No",
    ]);

    const thin = rowCells("Unfinished assembly");
    expect(thin.slice(0, 9)).toEqual([
      "am-thin",
      "Unfinished assembly",
      "draft",
      "Not ready",
      "Not linked",
      "0",
      "—",
      "Not linked",
      "No",
    ]);

    const confirmed = rowCells("Fraction assembly");
    expect(confirmed.slice(2, 9)).toEqual([
      "confirmed",
      "Ready",
      "Fractions",
      "1",
      "max 20",
      "Adaptive IRT",
      "Yes",
    ]);

    const live = rowCells("Live fraction assembly");
    expect(live[2]).toBe("operational");
    expect(live[5]).toBe("2");
    expect(live[6]).toBe("min 5, targets met");
    expect(live[8]).toBe("Yes");
  });

  it("sorts by name and filters by search", async () => {
    const user = userEvent.setup({ delay: null });
    render(<AssemblyModelTable />);

    await user.click(screen.getByRole("button", { name: "Name" }));
    const names = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[1].textContent);
    expect(names).toEqual([
      "Fraction assembly",
      "Live fraction assembly",
      "Plant part naming assembly",
      "Reviewed assembly",
      "Unfinished assembly",
    ]);

    await user.type(screen.getByRole("textbox", { name: "Search assembly models" }), "Unfinished");
    expect(screen.getByText("am-thin")).toBeInTheDocument();
    expect(screen.queryByText("am-ready")).not.toBeInTheDocument();
    expect(screen.queryByText("am-confirmed")).not.toBeInTheDocument();
  });

  it("counts ingredient groups for targets, rules, and the policy", async () => {
    const user = userEvent.setup({ delay: null });
    render(<AssemblyModelTable />);
    await user.click(screen.getByRole("button", { name: "Ingredients View" }));

    const card = screen.getByRole("heading", { name: "Plant part naming assembly" }).closest(".rounded-2xl");
    expect(within(card).getByText("Plant part naming • Ready")).toBeInTheDocument();
    await user.click(within(card).getByRole("heading", { name: "Plant part naming assembly" }));

    const thin = screen.getByRole("heading", { name: "Unfinished assembly" }).closest(".rounded-2xl");
    await user.click(within(thin).getByRole("heading", { name: "Unfinished assembly" }));

    expect(groupCount(card, "Description")).toBe("1");
    expect(groupCount(card, "Student Model")).toBe("1");
    expect(groupCount(card, "SMV targets")).toBe("1");
    expect(groupCount(card, "Stopping rules")).toBe("3");
    expect(groupCount(card, "Selection policy")).toBe("1");
    expect(groupCount(card, "Version")).toBe("1");
    await user.click(within(card).getByRole("button", { name: /SMV targets/ }));
    expect(within(card).getByText("Names the part")).toBeInTheDocument();
    expect(within(card).getByText(/accuracy ≥ 0.8/)).toBeInTheDocument();

    expect(within(thin).getByText("Not linked • Not ready")).toBeInTheDocument();
    expect(groupCount(thin, "Description")).toBe("0");
    expect(groupCount(thin, "Student Model")).toBe("0");
    expect(groupCount(thin, "SMV targets")).toBe("0");
    expect(groupCount(thin, "Stopping rules")).toBe("0");
    expect(groupCount(thin, "Selection policy")).toBe("0");
    expect(groupCount(thin, "Version")).toBe("0");

    const live = screen.getByRole("heading", { name: "Live fraction assembly" }).closest(".rounded-2xl");
    expect(within(live).getByText("Locked")).toBeInTheDocument();
    expect(within(live).getByText("v2")).toBeInTheDocument();
  });
});
