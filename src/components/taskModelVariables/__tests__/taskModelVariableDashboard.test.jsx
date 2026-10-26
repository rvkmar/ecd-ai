import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { useTaskModelVariables } from "@/api/queries/taskModelVariables";
import { useTaskModels } from "@/api/queries/taskModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import TaskModelVariableDashboard from "../TaskModelVariableDashboard";
import { taskModelVariableReadiness } from "@/utils/taskModelVariableReadiness";
import {
  bloom,
  bloomCopy,
  denominator,
  designPatterns,
  diagram,
  familiar,
  taskModels,
  thin,
  variables,
} from "./taskModelVariableTabFixture";

vi.mock("@/api/queries/taskModelVariables", () => ({
  useTaskModelVariables: vi.fn(),
}));
vi.mock("@/api/queries/taskModels", () => ({
  useTaskModels: vi.fn(),
}));
vi.mock("@/api/queries/designPatterns", () => ({
  useDesignPatterns: vi.fn(),
}));

function stat(regionName, label) {
  const counts = screen.getByRole("region", { name: regionName });
  const card = within(counts).getByText(label).parentElement;
  return card.querySelector(".text-3xl").textContent;
}

describe("Task Model Variable dashboard", () => {
  beforeEach(() => {
    useTaskModelVariables.mockReturnValue({ data: variables, isLoading: false, error: null });
    useTaskModels.mockReturnValue({ data: taskModels, isLoading: false, error: null });
    useDesignPatterns.mockReturnValue({ data: designPatterns, isLoading: false, error: null });
  });

  it("counts type, value set, in use against unused, and strict readiness", () => {
    expect(taskModelVariableReadiness(diagram, { strict: true }).ready).toBe(true);
    expect(taskModelVariableReadiness(bloom, { strict: true }).ready).toBe(true);
    expect(taskModelVariableReadiness(bloomCopy, { strict: true }).ready).toBe(true);
    expect(taskModelVariableReadiness(denominator, { strict: true }).ready).toBe(true);
    expect(taskModelVariableReadiness(familiar, { strict: true }).ready).toBe(true);
    expect(taskModelVariableReadiness(thin, { strict: true }).ready).toBe(false);

    render(<TaskModelVariableDashboard />);

    expect(stat("Task model variable counts", "Total")).toBe("6");
    expect(stat("Task model variable counts", "Ready")).toBe("5");
    expect(stat("Task model variable counts", "Not ready")).toBe("1");
    expect(stat("Task model variable counts", "In use")).toBe("3");
    expect(stat("Task model variable counts", "Unused")).toBe("3");

    expect(stat("Counts by type", "Categorical")).toBe("3");
    expect(stat("Counts by type", "Ordinal")).toBe("0");
    expect(stat("Counts by type", "Numeric")).toBe("1");
    expect(stat("Counts by type", "Boolean")).toBe("1");
    expect(stat("Counts by type", "No type")).toBe("1");

    expect(stat("Counts by value set", "bloomLevel")).toBe("2");
    expect(stat("Counts by value set", "reasoningType")).toBe("0");
    expect(stat("Counts by value set", "presentationMode")).toBe("0");
    expect(stat("Counts by value set", "responseFormat")).toBe("0");
    expect(stat("Counts by value set", "stimulusPolicy")).toBe("0");
    expect(stat("Counts by value set", "Author-supplied")).toBe("4");

    expect(screen.getByRole("heading", { name: "In use vs unused" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ready vs not ready" })).toBeInTheDocument();
    expect(screen.getByText(/no lifecycle status/)).toBeInTheDocument();
    expect(screen.queryByText(/Confirmed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Operational/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Draft$/)).not.toBeInTheDocument();
  });
});
