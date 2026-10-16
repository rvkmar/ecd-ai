import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CurricularPolicyManager from "../CurricularPolicyManager.jsx";
import { useAuth } from "@/auth/AuthProvider";
import { useCurricularPolicies } from "@/api/queries/curricularPolicies";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/api/queries/curricularPolicies", () => ({
  useCurricularPolicies: vi.fn(),
  useDeleteCurricularPolicy: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateCurricularPolicy: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCurricularPolicy: () => ({ mutateAsync: vi.fn(), isPending: false }),
  countPolicyNodes: () => ({ goals: 1, competencies: 0, outcomes: 0 }),
}));

beforeEach(() => {
  useAuth.mockReturnValue({ auth: { role: "admin", username: "admin1" } });
});

describe("Curricular policy empty screen", () => {
  it("opens the form when no policy is saved", () => {
    useCurricularPolicies.mockReturnValue({ data: [], isLoading: false });
    render(<CurricularPolicyManager />);

    expect(screen.getByRole("heading", { name: "New curricular policy" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New curricular policy" })).not.toBeInTheDocument();
    expect(screen.getByText(/Write one above/)).toBeInTheDocument();
  });

  it("keeps the form behind New once a policy exists", async () => {
    useCurricularPolicies.mockReturnValue({
      data: [{ id: "cp1", name: "Plant diagram curriculum", curricularGoals: [] }],
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<CurricularPolicyManager />);

    expect(screen.queryByRole("heading", { name: "New curricular policy" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New curricular policy" }));
    expect(screen.getByRole("heading", { name: "New curricular policy" })).toBeInTheDocument();
  });
});
