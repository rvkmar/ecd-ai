import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { useAssemblyModels } from "@/api/queries/assemblyModels";
import { meetsAssemblyConfirmedGates } from "../assemblyModelReadiness";
import AssemblyModelDashboard, { isReadyToConfirm } from "../AssemblyModelDashboard";
import {
  assemblyModels,
  confirmedModel,
  operationalModel,
  readyDraft,
  reviewedModel,
  thinDraft,
} from "./assemblyTabFixture";

vi.mock("@/api/queries/assemblyModels", () => ({
  useAssemblyModels: vi.fn(),
}));

function stat(label) {
  const counts = screen.getByRole("region", { name: "Assembly Model counts" });
  const card = within(counts).getByText(label).parentElement;
  return card.querySelector(".text-3xl").textContent;
}

describe("Assembly Model dashboard", () => {
  beforeEach(() => {
    useAssemblyModels.mockReturnValue({
      data: assemblyModels,
      isLoading: false,
      error: null,
    });
  });

  it("counts lifecycle cards and only pre-confirm models that pass the confirm gate", () => {
    expect(meetsAssemblyConfirmedGates(readyDraft)).toBe(true);
    expect(meetsAssemblyConfirmedGates(reviewedModel)).toBe(true);
    expect(meetsAssemblyConfirmedGates(thinDraft)).toBe(false);
    expect(meetsAssemblyConfirmedGates(confirmedModel)).toBe(true);
    expect(meetsAssemblyConfirmedGates(operationalModel)).toBe(true);
    expect(isReadyToConfirm(readyDraft)).toBe(true);
    expect(isReadyToConfirm(reviewedModel)).toBe(true);
    expect(isReadyToConfirm(thinDraft)).toBe(false);
    expect(isReadyToConfirm(confirmedModel)).toBe(false);
    expect(isReadyToConfirm(operationalModel)).toBe(false);

    render(<AssemblyModelDashboard />);

    expect(stat("Total")).toBe("5");
    expect(stat("Confirmed")).toBe("1");
    expect(stat("Operational")).toBe("1");
    expect(stat("Draft")).toBe("2");
    expect(stat("Ready to confirm")).toBe("2");
    expect(screen.getByRole("heading", { name: "Authoring vs later" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Structural lock" })).toBeInTheDocument();
    expect(screen.getByText(/Draft and reviewed models, against models that are confirmed/)).toBeInTheDocument();
    expect(screen.getByText(/Ready to confirm counts draft and reviewed models/)).toBeInTheDocument();
  });
});
