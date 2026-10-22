import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePresentationModels } from "@/api/queries/presentationModels";
import { useTaskModels } from "@/api/queries/taskModels";
import { useTemplates } from "@/api/queries/templates";
import PresentationModelTable from "../PresentationModelTable";
import { presentationModels, taskModels, templates } from "./presentationTabFixture";

vi.mock("@/api/queries/presentationModels", () => ({
  usePresentationModels: vi.fn(),
}));
vi.mock("@/api/queries/taskModels", () => ({
  useTaskModels: vi.fn(),
}));
vi.mock("@/api/queries/templates", () => ({
  useTemplates: vi.fn(),
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

describe("Presentation structure", () => {
  beforeEach(() => {
    usePresentationModels.mockReturnValue(query(presentationModels));
    useTaskModels.mockReturnValue(query(taskModels));
    useTemplates.mockReturnValue(query(templates));
  });

  it("lists the task model, layout, profile, template count, and lock", () => {
    render(<PresentationModelTable />);

    expect(screen.getByRole("heading", { name: "Presentation Structure" })).toBeInTheDocument();
    expect(screen.getByText(/Task Model owns the items/)).toBeInTheDocument();

    const ready = rowCells("Plant part presentation");
    expect(ready.slice(0, 11)).toEqual([
      "pm-ready",
      "Plant part presentation",
      "draft",
      "Ready",
      "Plant part naming",
      "Authored order",
      "One item at a time",
      "Linear",
      "Large text",
      "1",
      "No",
    ]);

    const thin = rowCells("Unfinished presentation");
    expect(thin.slice(0, 11)).toEqual([
      "pm-thin",
      "Unfinished presentation",
      "draft",
      "Not ready",
      "Not linked",
      "—",
      "—",
      "—",
      "—",
      "0",
      "No",
    ]);

    const confirmed = rowCells("Fraction presentation");
    expect(confirmed.slice(2, 11)).toEqual([
      "confirmed",
      "Ready",
      "Fractions",
      "Authored order",
      "Shared stimulus",
      "Free",
      "Default",
      "0",
      "Yes",
    ]);

    const live = rowCells("Live fraction presentation");
    expect(live[2]).toBe("operational");
    expect(live[8]).toBe("Screen reader");
    expect(live[9]).toBe("1");
    expect(live[10]).toBe("Yes");
  });

  it("sorts by name and filters by search", async () => {
    const user = userEvent.setup({ delay: null });
    render(<PresentationModelTable />);

    await user.click(screen.getByRole("button", { name: "Name" }));
    const names = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[1].textContent);
    expect(names).toEqual([
      "Fraction presentation",
      "Live fraction presentation",
      "Plant part presentation",
      "Reviewed presentation",
      "Unfinished presentation",
    ]);

    await user.type(screen.getByRole("textbox", { name: "Search presentation models" }), "Unfinished");
    expect(screen.getByText("pm-thin")).toBeInTheDocument();
    expect(screen.queryByText("pm-ready")).not.toBeInTheDocument();
    expect(screen.queryByText("pm-confirmed")).not.toBeInTheDocument();
  });

  it("counts ingredient groups for layout, display, accessibility, and templates", async () => {
    const user = userEvent.setup({ delay: null });
    render(<PresentationModelTable />);
    await user.click(screen.getByRole("button", { name: "Ingredients View" }));

    const card = screen.getByRole("heading", { name: "Plant part presentation" }).closest(".rounded-2xl");
    expect(within(card).getByText("Plant part naming • Ready")).toBeInTheDocument();
    await user.click(within(card).getByRole("heading", { name: "Plant part presentation" }));

    const thin = screen.getByRole("heading", { name: "Unfinished presentation" }).closest(".rounded-2xl");
    await user.click(within(thin).getByRole("heading", { name: "Unfinished presentation" }));

    expect(groupCount(card, "Description")).toBe("1");
    expect(groupCount(card, "Task Model")).toBe("1");
    expect(groupCount(card, "Layout")).toBe("3");
    expect(groupCount(card, "Conditional display")).toBe("4");
    expect(groupCount(card, "Accessibility")).toBe("3");
    expect(groupCount(card, "Templates")).toBe("1");
    expect(groupCount(card, "Version")).toBe("1");
    await user.click(within(card).getByRole("button", { name: /Task Model/ }));
    expect(within(card).getByText("Plant part naming")).toBeInTheDocument();
    expect(within(card).getByText(/version 2/)).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: /Templates/ }));
    expect(within(card).getByText("Plant part template")).toBeInTheDocument();

    expect(within(thin).getByText("Not linked • Not ready")).toBeInTheDocument();
    expect(groupCount(thin, "Description")).toBe("0");
    expect(groupCount(thin, "Task Model")).toBe("0");
    expect(groupCount(thin, "Layout")).toBe("0");
    expect(groupCount(thin, "Conditional display")).toBe("0");
    expect(groupCount(thin, "Accessibility")).toBe("0");
    expect(groupCount(thin, "Templates")).toBe("0");
    expect(groupCount(thin, "Version")).toBe("0");

    const live = screen.getByRole("heading", { name: "Live fraction presentation" }).closest(".rounded-2xl");
    expect(within(live).getByText("Locked")).toBeInTheDocument();
    expect(within(live).getByText("v2")).toBeInTheDocument();
  });
});
