import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { useTemplates } from "@/api/queries/templates";
import { templateReadiness } from "@/utils/templateReadiness";
import TemplateDashboard from "../TemplateDashboard";
import { confirmedTemplate, readyDraft, templates, thinDraft } from "./templateTabFixture";

vi.mock("@/api/queries/templates", () => ({
  useTemplates: vi.fn(),
}));

function stat(label) {
  const counts = screen.getByRole("region", { name: "Template counts" });
  const card = within(counts).getByText(label).parentElement;
  return card.querySelector(".text-3xl").textContent;
}

describe("Template dashboard", () => {
  beforeEach(() => {
    useTemplates.mockReturnValue({
      data: templates,
      isLoading: false,
      error: null,
    });
  });

  it("counts total, confirmed, draft, and drafts that pass strict readiness", () => {
    expect(templateReadiness(readyDraft, { strict: true }).ready).toBe(true);
    expect(templateReadiness(thinDraft, { strict: true }).ready).toBe(false);
    expect(templateReadiness(confirmedTemplate, { strict: true }).ready).toBe(true);

    render(<TemplateDashboard />);

    expect(stat("Total")).toBe("3");
    expect(stat("Confirmed")).toBe("1");
    expect(stat("Draft")).toBe("2");
    expect(stat("Ready to confirm")).toBe("1");
    expect(screen.getByRole("heading", { name: "Draft vs confirmed" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Design Pattern link" })).toBeInTheDocument();
    expect(
      screen.getByText(/Whether the template cites a Design Pattern/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Operational/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Locked/)).not.toBeInTheDocument();
  });
});
