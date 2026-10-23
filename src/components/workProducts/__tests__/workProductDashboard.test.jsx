import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { useWorkProducts } from "@/api/queries/workProducts";
import { useItems } from "@/api/queries/items";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import WorkProductDashboard from "../WorkProductDashboard";
import {
  designPatterns,
  evidenceModels,
  items,
  partName,
  solveSteps,
  thin,
  workProducts,
} from "./workProductTabFixture";
import { workProductReadiness } from "@/utils/workProductReadiness";

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

function stat(regionName, label) {
  const counts = screen.getByRole("region", { name: regionName });
  const card = within(counts).getByText(label).parentElement;
  return card.querySelector(".text-3xl").textContent;
}

describe("Work Product dashboard", () => {
  beforeEach(() => {
    useWorkProducts.mockReturnValue({ data: workProducts, isLoading: false, error: null });
    useItems.mockReturnValue({ data: items, isLoading: false, error: null });
    useEvidenceModels.mockReturnValue({ data: evidenceModels, isLoading: false, error: null });
    useDesignPatterns.mockReturnValue({ data: designPatterns, isLoading: false, error: null });
  });

  it("counts type, used against unused, and strict readiness", () => {
    expect(workProductReadiness(partName, { strict: true }).ready).toBe(true);
    expect(workProductReadiness(solveSteps, { strict: true }).ready).toBe(true);
    expect(workProductReadiness(thin, { strict: true }).ready).toBe(false);

    render(<WorkProductDashboard />);

    expect(stat("Work product counts", "Total")).toBe("4");
    expect(stat("Work product counts", "Ready")).toBe("3");
    expect(stat("Work product counts", "Not ready")).toBe("1");
    expect(stat("Work product counts", "Used")).toBe("1");
    expect(stat("Work product counts", "Unused")).toBe("3");

    expect(stat("Counts by type", "Selected Response")).toBe("1");
    expect(stat("Counts by type", "Process Trace")).toBe("2");
    expect(stat("Counts by type", "Performance")).toBe("0");
    expect(stat("Counts by type", "No type")).toBe("1");

    expect(screen.getByRole("heading", { name: "Used vs unused" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ready vs not ready" })).toBeInTheDocument();
    expect(screen.getByText(/no lifecycle status/)).toBeInTheDocument();
    expect(screen.queryByText(/Confirmed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Operational/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Draft$/)).not.toBeInTheDocument();
  });
});
