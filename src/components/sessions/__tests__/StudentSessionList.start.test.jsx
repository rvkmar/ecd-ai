import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import StudentSessionList from "../StudentSessionList";
import { useAuth } from "@/auth/AuthProvider";
import { apiFetch } from "@/api/apiClient";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/api/apiClient", () => ({
  apiFetch: vi.fn(),
  apiErrorMessage: (e, fallback) => e?.message || fallback,
}));

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

describe("StudentSessionList Start", () => {
  beforeEach(() => {
    navigate.mockReset();
    useAuth.mockReturnValue({
      auth: { role: "student", username: "stud1", token: "t" },
    });
  });

  it("shows Start for ready sessions and no Start when completed", async () => {
    apiFetch.mockResolvedValue([
      {
        id: "s-ready",
        status: "ready",
        taskIds: ["t1"],
        responses: [],
      },
      {
        id: "s-done",
        status: "completed",
        isCompleted: true,
        taskIds: ["t1"],
        responses: [{ taskId: "t1" }],
      },
    ]);

    render(
      <MemoryRouter>
        <StudentSessionList />
      </MemoryRouter>
    );

    await waitFor(() => screen.getByText("s-ready"));
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
    expect(screen.getByText(/Submitted — closed/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
  });

  it("Start on ready posts /play then navigates to the player", async () => {
    apiFetch
      .mockResolvedValueOnce([
        { id: "s-ready", status: "ready", taskIds: ["t1"], responses: [] },
      ])
      .mockResolvedValueOnce({ id: "s-ready", status: "in_progress" });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <StudentSessionList />
      </MemoryRouter>
    );

    await waitFor(() => screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/sessions/s-ready/play",
        { method: "POST" },
        expect.anything()
      );
      expect(navigate).toHaveBeenCalledWith("/student/sessions/s-ready/player");
    });
  });
});
