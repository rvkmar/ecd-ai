import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ auth: { role: "teacher", token: "t" } }),
}));

vi.mock("@/api/apiClient", () => ({
  apiFetch: vi.fn(() => Promise.resolve({
    classId: "c1",
    summary: {
      IRT: {
        suppressed: false,
        mean: 0.4,
        level: "Proficient",
        levelText: "Meets the equal-parts claim.",
        levelSource: "authored",
        standardError: 0.11,
        claimStatement: "The student can explain why a fraction names equal parts.",
      },
      BayesianNetwork: {
        smv1: {
          suppressed: false,
          mean: 0.8,
          level: "Strong",
          levelSource: "default",
          levelNote: "default cut",
          posteriorSd: 0.12,
          claimStatement: "The student can explain why a fraction names equal parts.",
        },
      },
    },
  })),
  apiErrorMessage: (_err, fallback) => fallback,
}));

import ClassReport from "../ClassReport.jsx";

describe("ClassReport claim, error, and level source", () => {
  it("shows the claim, the SE, the descriptor, and the default-cut note", async () => {
    render(<ClassReport classId="c1" />);
    expect(await screen.findByTestId("class-irt")).toBeInTheDocument();
    expect(screen.getAllByText(/Claim: The student can explain why a fraction names equal parts/).length).toBe(2);
    expect(screen.getByText(/Meets the equal-parts claim/)).toBeInTheDocument();
    expect(screen.getByText(/SE 0.11/)).toBeInTheDocument();
    expect(screen.getByText(/SD 0.12/)).toBeInTheDocument();
    expect(screen.getByTestId("report-level-source")).toHaveTextContent("default cut");
  });
});
