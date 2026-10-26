import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useTaskModelVariables } from "@/api/queries/taskModelVariables";
import { useTaskModels } from "@/api/queries/taskModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import TaskModelVariableTable from "../TaskModelVariableTable";
import { designPatterns, taskModels, variables } from "./taskModelVariableTabFixture";

vi.mock("@/api/queries/taskModelVariables", () => ({
  useTaskModelVariables: vi.fn(),
}));
vi.mock("@/api/queries/taskModels", () => ({
  useTaskModels: vi.fn(),
}));
vi.mock("@/api/queries/designPatterns", () => ({
  useDesignPatterns: vi.fn(),
}));

function query(data) {
  return { data, isLoading: false, error: null };
}

function rowById(id) {
  const rows = screen.getAllByRole("row");
  const row = rows.find((candidate) => {
    const cells = within(candidate).queryAllByRole("cell");
    return cells[0]?.textContent === id;
  });
  if (!row) throw new Error(`No row ${id}`);
  return within(row).getAllByRole("cell").map((cell) => cell.textContent);
}

function groupCount(card, label) {
  const button = within(card).getByRole("button", {
    name: new RegExp(`^${label}\\s+\\d`),
  });
  return within(button).getByText(/^\d+$/).textContent;
}

describe("Task Model Variable structure", () => {
  beforeEach(() => {
    useTaskModelVariables.mockReturnValue(query(variables));
    useTaskModels.mockReturnValue(query(taskModels));
    useDesignPatterns.mockReturnValue(query(designPatterns));
  });

  it("lists type, value set, readiness, and who cites each variable", () => {
    render(<TaskModelVariableTable />);

    expect(screen.getByRole("heading", { name: "Task Model Variable Structure" })).toBeInTheDocument();
    expect(screen.getByText(/taskModelVariableIds/)).toBeInTheDocument();

    expect(rowById("tmv-diagram").slice(0, 7)).toEqual([
      "tmv-diagram",
      "Plant diagram",
      "Categorical",
      "Author-supplied",
      "Ready",
      "2",
      "1",
    ]);
    expect(screen.getByTestId("tmv-consumers-tmv-diagram")).toHaveTextContent("2");

    expect(rowById("tmv-bloom").slice(0, 7)).toEqual([
      "tmv-bloom",
      "Bloom demand",
      "Categorical",
      "bloomLevel",
      "Ready",
      "1",
      "1",
    ]);

    expect(rowById("tmv-thin").slice(0, 7)).toEqual([
      "tmv-thin",
      "Started only",
      "No type",
      "Author-supplied",
      "Not ready",
      "0",
      "0",
    ]);
    expect(screen.queryByRole("columnheader", { name: "Status" })).not.toBeInTheDocument();
  });

  it("sorts by name and filters by a citing task model", async () => {
    const user = userEvent.setup({ delay: null });
    render(<TaskModelVariableTable />);

    await user.click(screen.getByRole("button", { name: "Name" }));
    const names = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[1].textContent);
    expect(names).toEqual([
      "Bloom demand",
      "Bloom demand (copy)",
      "Diagram familiarity",
      "Fraction denominator",
      "Plant diagram",
      "Started only",
    ]);

    await user.type(
      screen.getByRole("textbox", { name: "Search task model variables" }),
      "Plant part naming form B"
    );
    expect(screen.getByText("tmv-diagram")).toBeInTheDocument();
    expect(screen.queryByText("tmv-bloom")).not.toBeInTheDocument();
    expect(screen.queryByText("tmv-thin")).not.toBeInTheDocument();
  });

  it("counts levels, task models, and design patterns in Ingredients View", async () => {
    const user = userEvent.setup({ delay: null });
    render(<TaskModelVariableTable />);
    await user.click(screen.getByRole("button", { name: "Ingredients View" }));

    const card = screen.getByRole("heading", { name: "Plant diagram" }).closest(".rounded-2xl");
    expect(within(card).getByText("Categorical • Author-supplied • Ready")).toBeInTheDocument();
    await user.click(within(card).getByRole("heading", { name: "Plant diagram" }));

    const thin = screen.getByRole("heading", { name: "Started only" }).closest(".rounded-2xl");
    await user.click(within(thin).getByRole("heading", { name: "Started only" }));

    expect(groupCount(card, "Description")).toBe("1");
    expect(groupCount(card, "Levels")).toBe("2");
    expect(groupCount(card, "Task models")).toBe("2");
    expect(groupCount(card, "Design patterns")).toBe("1");

    await user.click(within(card).getByRole("button", { name: /^Levels\s+2/ }));
    expect(within(card).getByText("leaf")).toBeInTheDocument();
    expect(within(card).getByText("root")).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: /^Task models\s+2/ }));
    expect(within(card).getByText("Plant part naming")).toBeInTheDocument();
    expect(within(card).getByText("Plant part naming form B")).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: /^Design patterns\s+1/ }));
    expect(within(card).getByText("Explain a labelled diagram")).toBeInTheDocument();

    expect(within(thin).getByText("No type • Author-supplied • Not ready")).toBeInTheDocument();
    expect(groupCount(thin, "Description")).toBe("0");
    expect(groupCount(thin, "Levels")).toBe("0");
    expect(groupCount(thin, "Task models")).toBe("0");
    expect(groupCount(thin, "Design patterns")).toBe("0");
  });
});
