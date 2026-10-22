import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { usePresentationModels } from "@/api/queries/presentationModels";
import { meetsPresentationConfirmedGates } from "../presentationModelReadiness";
import PresentationModelDashboard, { isReadyToConfirm } from "../PresentationModelDashboard";
import {
  confirmedModel,
  operationalModel,
  presentationModels,
  readyDraft,
  reviewedModel,
  thinDraft,
} from "./presentationTabFixture";

vi.mock("@/api/queries/presentationModels", () => ({
  usePresentationModels: vi.fn(),
}));

function stat(label) {
  const counts = screen.getByRole("region", { name: "Presentation Model counts" });
  const card = within(counts).getByText(label).parentElement;
  return card.querySelector(".text-3xl").textContent;
}

describe("Presentation Model dashboard", () => {
  beforeEach(() => {
    usePresentationModels.mockReturnValue({
      data: presentationModels,
      isLoading: false,
      error: null,
    });
  });

  it("counts lifecycle cards and only pre-confirm models that pass the confirm gate", () => {
    expect(meetsPresentationConfirmedGates(readyDraft)).toBe(true);
    expect(meetsPresentationConfirmedGates(reviewedModel)).toBe(true);
    expect(meetsPresentationConfirmedGates(thinDraft)).toBe(false);
    expect(meetsPresentationConfirmedGates(confirmedModel)).toBe(true);
    expect(meetsPresentationConfirmedGates(operationalModel)).toBe(true);
    expect(isReadyToConfirm(readyDraft)).toBe(true);
    expect(isReadyToConfirm(reviewedModel)).toBe(true);
    expect(isReadyToConfirm(thinDraft)).toBe(false);
    expect(isReadyToConfirm(confirmedModel)).toBe(false);
    expect(isReadyToConfirm(operationalModel)).toBe(false);

    render(<PresentationModelDashboard />);

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
