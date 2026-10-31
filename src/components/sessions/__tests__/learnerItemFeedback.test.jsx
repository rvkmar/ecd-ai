import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("../../../api/queries/policies", () => ({
  usePolicies: () => ({ data: [], isLoading: false }),
}));

vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({ auth: { role: "student", username: "stud1", token: "t" } }),
}));

vi.mock("../../../api/apiClient", () => ({
  apiFetch: vi.fn((url) => {
    if (String(url).includes("learner-feedback")) {
      return Promise.resolve({
        sessionId: "s-feedback",
        summary: { level: "Proficient", message: "Keep going." },
        strengths: [],
        focusAreas: [],
        nextSteps: [],
        encouragement: "Great effort! Keep practicing.",
        itemFeedback: [
          {
            taskId: "t1",
            itemId: "it1",
            text: "The leaf is the part that makes food.",
            rule: "byOption",
            key: "opt_a",
          },
        ],
      });
    }
    return Promise.resolve({ sessionId: "s-feedback" });
  }),
}));

import SessionReport from "../SessionReport.jsx";

describe("SessionReport item feedback", () => {
  it("shows authored item feedback on the learner report", async () => {
    render(<SessionReport sessionId="s-feedback" />);
    const section = await waitFor(() => screen.getByTestId("learner-item-feedback"));
    expect(section).toHaveTextContent("The leaf is the part that makes food.");
    expect(section.querySelector("[data-feedback-rule='byOption']")).not.toBeNull();
  });
});
