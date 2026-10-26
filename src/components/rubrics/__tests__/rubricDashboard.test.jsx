import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { useRubrics } from "@/api/queries/rubrics";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import RubricDashboard from "../RubricDashboard";
import { rubricReadiness } from "@/utils/rubricReadiness";
import {
  bare,
  designPatterns,
  evidenceModels,
  fraction,
  patternOnly,
  phaseOnly,
  plantCopy,
  plantFunction,
  rubrics,
  thin,
} from "./rubricTabFixture";

vi.mock("@/api/queries/rubrics", () => ({
  useRubrics: vi.fn(),
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

describe("Rubric dashboard", () => {
  beforeEach(() => {
    useRubrics.mockReturnValue({ data: rubrics, isLoading: false, error: null });
    useEvidenceModels.mockReturnValue({ data: evidenceModels, isLoading: false, error: null });
    useDesignPatterns.mockReturnValue({ data: designPatterns, isLoading: false, error: null });
  });

  it("counts status, readiness, use, shape, and exemplars", () => {
    expect(rubricReadiness(plantFunction, { strict: true }).ready).toBe(true);
    expect(rubricReadiness(fraction, { strict: true }).ready).toBe(true);
    expect(rubricReadiness(phaseOnly, { strict: true }).ready).toBe(true);
    expect(rubricReadiness(patternOnly, { strict: true }).ready).toBe(true);
    expect(rubricReadiness(plantCopy, { strict: true }).ready).toBe(true);
    expect(rubricReadiness(bare, { strict: true }).ready).toBe(true);
    expect(rubricReadiness(thin, { strict: true }).ready).toBe(false);

    render(<RubricDashboard />);

    expect(stat("Rubric counts", "Total")).toBe("7");
    expect(stat("Rubric counts", "Draft")).toBe("6");
    expect(stat("Rubric counts", "Confirmed")).toBe("1");
    expect(stat("Rubric counts", "Ready")).toBe("6");
    expect(stat("Rubric counts", "Not ready")).toBe("1");
    expect(stat("Rubric counts", "In use")).toBe("4");
    expect(stat("Rubric counts", "Unused")).toBe("3");

    expect(stat("Counts by criteria", "1 criterion")).toBe("6");
    expect(stat("Counts by criteria", "2 criteria")).toBe("0");
    expect(stat("Counts by criteria", "3 criteria")).toBe("0");
    expect(stat("Counts by criteria", "4 or more criteria")).toBe("0");
    expect(stat("Counts by criteria", "No criteria")).toBe("1");

    expect(stat("Counts by levels", "2 levels")).toBe("6");
    expect(stat("Counts by levels", "4 levels")).toBe("0");
    expect(stat("Counts by levels", "No levels")).toBe("1");

    expect(stat("Exemplar coverage", "With exemplars")).toBe("5");
    expect(stat("Exemplar coverage", "Without exemplars")).toBe("2");

    expect(screen.getByRole("heading", { name: "Draft vs confirmed" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ready vs not ready" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "In use vs unused" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Exemplar coverage" })).toBeInTheDocument();
  });
});
