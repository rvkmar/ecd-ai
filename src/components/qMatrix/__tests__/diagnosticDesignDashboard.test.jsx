import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { useQMatrixModels } from "@/api/queries/qMatrixModels";
import DiagnosticDesignDashboard from "../DiagnosticDesignDashboard";
import { designs } from "./diagnosticDesignTabFixture";

vi.mock("@/api/queries/qMatrixModels", () => ({
  useQMatrixModels: vi.fn(),
}));

function stat(label) {
  const counts = screen.getByRole("region", { name: "Diagnostic Design counts" });
  const card = within(counts).getByText(label).parentElement;
  return card.querySelector(".text-3xl").textContent;
}

describe("Diagnostic Design dashboard", () => {
  beforeEach(() => {
    useQMatrixModels.mockReturnValue({
      data: designs,
      isLoading: false,
      error: null,
    });
  });

  it("counts lifecycle cards and only pre-confirm designs that pass the confirm gate", () => {
    render(<DiagnosticDesignDashboard />);

    expect(stat("Total")).toBe("5");
    expect(stat("Confirmed")).toBe("1");
    expect(stat("Operational")).toBe("1");
    expect(stat("Draft")).toBe("2");
    expect(stat("Ready to confirm")).toBe("2");
    expect(screen.getByRole("heading", { name: "Authoring vs later" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Structural lock" })).toBeInTheDocument();
    expect(screen.getByText(/Draft and reviewed designs, against designs that are confirmed/)).toBeInTheDocument();
    expect(screen.getByText(/Ready to confirm counts draft and reviewed designs/)).toBeInTheDocument();
  });
});
