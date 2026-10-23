import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useWorkProducts } from "@/api/queries/workProducts";
import { useItems } from "@/api/queries/items";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import WorkProductTable from "../WorkProductTable";
import {
  designPatterns,
  evidenceModels,
  items,
  workProducts,
} from "./workProductTabFixture";

vi.mock("@/api/queries/workProducts", () => ({
  useWorkProducts: vi.fn(),
}));
vi.mock("@/api/queries/items", () => ({
  useItems: vi.fn(),
}));
vi.mock("@/api/queries/evidenceModels", () => ({
  useEvidenceModels: vi.fn(),
}));
vi.mock("@/api/queries/designPatterns", () => ({
  useDesignPatterns: vi.fn(),
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

describe("Work Product structure", () => {
  beforeEach(() => {
    useWorkProducts.mockReturnValue(query(workProducts));
    useItems.mockReturnValue(query(items));
    useEvidenceModels.mockReturnValue(query(evidenceModels));
    useDesignPatterns.mockReturnValue(query(designPatterns));
  });

  it("lists type, readiness, and who cites each work product", () => {
    render(<WorkProductTable />);

    expect(screen.getByRole("heading", { name: "Work Product Structure" })).toBeInTheDocument();
    expect(screen.getByText(/interaction.workProductId/)).toBeInTheDocument();

    const ready = rowCells("Selected plant-part name");
    expect(ready.slice(0, 7)).toEqual([
      "wp-part-name",
      "Selected plant-part name",
      "Selected Response",
      "Ready",
      "2",
      "1",
      "1",
    ]);

    const thin = rowCells("Started only");
    expect(thin.slice(0, 7)).toEqual([
      "wp-thin",
      "Started only",
      "No type",
      "Not ready",
      "0",
      "0",
      "0",
    ]);
    expect(screen.queryByRole("columnheader", { name: "Status" })).not.toBeInTheDocument();
  });

  it("sorts by name and filters by a citing item", async () => {
    const user = userEvent.setup({ delay: null });
    render(<WorkProductTable />);

    await user.click(screen.getByRole("button", { name: "Name" }));
    const names = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[1].textContent);
    expect(names).toEqual([
      "Selected plant-part name",
      "Solve steps",
      "Solve steps (copy)",
      "Started only",
    ]);

    await user.type(screen.getByRole("textbox", { name: "Search work products" }), "Root");
    expect(screen.getByText("wp-part-name")).toBeInTheDocument();
    expect(screen.queryByText("wp-trace")).not.toBeInTheDocument();
    expect(screen.queryByText("wp-thin")).not.toBeInTheDocument();
  });

  it("counts items, evidence models, and design patterns in Ingredients View", async () => {
    const user = userEvent.setup({ delay: null });
    render(<WorkProductTable />);
    await user.click(screen.getByRole("button", { name: "Ingredients View" }));

    const card = screen
      .getByRole("heading", { name: "Selected plant-part name" })
      .closest(".rounded-2xl");
    expect(within(card).getByText("Selected Response • Ready")).toBeInTheDocument();
    await user.click(within(card).getByRole("heading", { name: "Selected plant-part name" }));

    const thin = screen.getByRole("heading", { name: "Started only" }).closest(".rounded-2xl");
    await user.click(within(thin).getByRole("heading", { name: "Started only" }));

    expect(groupCount(card, "Description")).toBe("1");
    expect(groupCount(card, "Items")).toBe("2");
    expect(groupCount(card, "Evidence models")).toBe("1");
    expect(groupCount(card, "Design patterns")).toBe("1");

    await user.click(within(card).getByRole("button", { name: /^Items\s+2/ }));
    expect(within(card).getByText("Leaf on the diagram")).toBeInTheDocument();
    expect(within(card).getByText("Root on the diagram")).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: /^Evidence models\s+1/ }));
    expect(within(card).getByText("Part naming evidence")).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: /^Design patterns\s+1/ }));
    expect(within(card).getByText("Name a plant part")).toBeInTheDocument();

    expect(within(thin).getByText("No type • Not ready")).toBeInTheDocument();
    expect(groupCount(thin, "Description")).toBe("0");
    expect(groupCount(thin, "Items")).toBe("0");
    expect(groupCount(thin, "Evidence models")).toBe("0");
    expect(groupCount(thin, "Design patterns")).toBe("0");
  });
});
