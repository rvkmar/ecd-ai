import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudentModelRecordPanel from "../StudentModelRecordPanel.jsx";
import { apiFetch } from "@/api/apiClient";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ auth: { username: "admin1", role: "admin", token: "t" } }),
}));

vi.mock("@/api/apiClient", () => ({
  apiFetch: vi.fn(),
  apiErrorMessage: (err, fallback) => err?.message || fallback,
}));

const record = {
  id: "smr1",
  studentId: "stu99",
  displayName: "stud1",
  competencyModelId: "cm1",
  competencyModelName: "Fractions",
  parameterSetId: "ps1",
  smvPosteriors: {
    smv1: {
      smvId: "smv1",
      estimate: 0.25,
      sem: 0.4,
      parameterSetId: "ps1",
      statisticalModelId: "sm-stat",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  },
  history: [
    {
      sessionId: "s1",
      timestamp: "2026-01-02T00:00:00.000Z",
      posteriorSnapshot: { smv1: { smvId: "smv1", estimate: 0.25 } },
    },
  ],
};

describe("StudentModelRecordPanel", () => {
  it("shows current estimates and history for the looked-up student", async () => {
    apiFetch.mockResolvedValue([record]);
    const user = userEvent.setup();
    render(<StudentModelRecordPanel />);
    await user.type(screen.getByLabelText("Student id"), "stud1");
    await user.click(screen.getByRole("button", { name: "Show record" }));
    expect(await screen.findByText("Fractions")).toBeInTheDocument();
    expect(screen.getByText("0.250")).toBeInTheDocument();
    expect(screen.getByText("sm-stat")).toBeInTheDocument();
    expect(screen.getByText("s1")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/studentModelRecords?studentId=stud1",
      {},
      expect.objectContaining({ role: "admin" })
    );
  });

  it("shows an empty state when the student has no record", async () => {
    apiFetch.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<StudentModelRecordPanel />);
    await user.type(screen.getByLabelText("Student id"), "stud1");
    await user.click(screen.getByRole("button", { name: "Show record" }));
    expect(await screen.findByText(/No scoring record yet/)).toBeInTheDocument();
  });
});
