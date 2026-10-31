import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../../api/queries/policies", () => ({
  usePolicies: () => ({ data: [], isLoading: false }),
}));

vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({ auth: { role: "teacher", username: "teacher1", token: "t" } }),
}));

vi.mock("../../../api/apiClient", () => ({
  apiFetch: vi.fn((url) => {
    if (String(url).includes("teacher-report")) {
      return Promise.resolve({
        sessionId: "s1",
        studentId: "stu1",
        studentName: "Pat",
        selectionStrategy: "fixed",
        responses: [
          {
            taskId: "t1",
            rawAnswer: "opt_a",
            timeOnItemMs: 1200,
            presentedAtSource: "server",
            rapidGuess: true,
            rapidGuessStatus: "rapid",
          },
          {
            taskId: "t2",
            rawAnswer: "opt_b",
            timeOnItemMs: 9000,
            presentedAtSource: "client",
            rapidGuess: false,
            rapidGuessStatus: "engaged",
          },
          {
            taskId: "t3",
            rawAnswer: "opt_c",
            rapidGuess: null,
            rapidGuessStatus: "unknown",
            timeOnItemMs: null,
          },
        ],
        responseTiming: {
          rapidGuessCount: 1,
          timedResponseCount: 2,
          unknownResponseCount: 1,
          rapidGuessRate: 0.5,
          ruleSummary: "10% of the median time on this item, with a 3 s floor and a 10 s cap. A higher per-item minimum replaces the floor.",
        },
        recommendations: { individualLevel: [], groupLevel: [] },
        modelSummary: {},
      });
    }
    return Promise.resolve({ sessionId: "s1", responses: [] });
  }),
}));

import SessionReport from "../SessionReport.jsx";

describe("teacher report timing display", () => {
  it("shows each response flag and the student rapid-guess rate", async () => {
    const user = userEvent.setup();
    render(<SessionReport sessionId="s1" />);
    await user.click(await screen.findByText("Teacher Report"));

    expect(screen.getByTestId("rapid-guess-rate")).toHaveTextContent(
      "Rapid-guess rate: 50% (1 of 2 timed responses). 1 without timing."
    );
    expect(screen.getByText(/3 s floor/)).toBeInTheDocument();

    const lines = screen.getAllByTestId("response-timing").map((node) => node.textContent);
    expect(lines.some((line) => line.includes("Time 1.2 s (server clock). Rapid guess."))).toBe(true);
    expect(lines.some((line) => line.includes("Time 9 s (client clock). Not a rapid guess."))).toBe(true);
    expect(lines.some((line) => line.includes("Timing unknown."))).toBe(true);
    expect(lines.some((line) => line.includes("Rapid guess.") && line.includes("t3"))).toBe(false);
  });
});
