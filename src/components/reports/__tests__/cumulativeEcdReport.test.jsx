import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CumulativeEcdReport from "../CumulativeEcdReport.jsx";
import { apiFetch } from "@/api/apiClient";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ auth: { username: "teach1", role: "teacher", token: "t" } }),
}));

vi.mock("@/api/apiClient", () => ({
  apiFetch: vi.fn(),
  apiErrorMessage: (err, fallback) => err?.message || fallback,
}));

describe("CumulativeEcdReport", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({
      kind: "teacher",
      overview: { nSessions: 1, nStudents: 1, percentDisplay: 50 },
      interpretation: { headline: "Classroom performance.", body: "Focus photosynthesis." },
      competencies: [],
      evidence: [],
      tasks: [],
      taskModels: [],
      students: [],
      nextSteps: [],
    });
  });

  it("stays hidden and does not fetch until Show is clicked", async () => {
    render(<CumulativeEcdReport kind="teacher" />);
    expect(screen.getByRole("button", { name: "Show cumulative report" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("cumulative-ecd-teacher")).not.toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("loads the document on Show and hides it again", async () => {
    const user = userEvent.setup();
    render(<CumulativeEcdReport kind="teacher" />);
    await user.click(screen.getByRole("button", { name: "Show cumulative report" }));
    expect(await screen.findByTestId("cumulative-ecd-teacher")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Hide cumulative report" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Hide cumulative report" }));
    expect(screen.queryByTestId("cumulative-ecd-teacher")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show cumulative report" })).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
