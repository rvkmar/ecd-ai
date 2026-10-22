import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { designPatternReadiness } from "@/utils/designPatternReadiness";
import DesignPatternDashboard from "../DesignPatternDashboard";
import { confirmedPattern, patterns, readyDraft, thinDraft } from "./designPatternTabFixture";

vi.mock("@/api/queries/designPatterns", () => ({
  useDesignPatterns: vi.fn(),
}));

function stat(label) {
  const counts = screen.getByRole("region", { name: "Design pattern counts" });
  const card = within(counts).getByText(label).parentElement;
  return card.querySelector(".text-3xl").textContent;
}

describe("Design Pattern dashboard", () => {
  beforeEach(() => {
    useDesignPatterns.mockReturnValue({
      data: patterns,
      isLoading: false,
      error: null,
    });
  });

  it("counts total, confirmed, draft, and drafts that pass strict readiness", () => {
    expect(designPatternReadiness(readyDraft, { strict: true }).ready).toBe(true);
    expect(designPatternReadiness(thinDraft, { strict: true }).ready).toBe(false);
    expect(designPatternReadiness(confirmedPattern, { strict: true }).ready).toBe(true);

    render(<DesignPatternDashboard />);

    expect(stat("Total")).toBe("3");
    expect(stat("Confirmed")).toBe("1");
    expect(stat("Draft")).toBe("2");
    expect(stat("Ready to confirm")).toBe("1");
    expect(screen.getByRole("heading", { name: "Draft vs confirmed" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Domain Analysis link" })).toBeInTheDocument();
    expect(screen.getByText("Whether the pattern cites a Domain Analysis.")).toBeInTheDocument();
    expect(screen.queryByText(/Operational/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Locked/)).not.toBeInTheDocument();
  });
});
