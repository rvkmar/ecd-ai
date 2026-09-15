import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import ItemBankAdmin from "../ItemBankAdmin";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../AdminDashboard", () => ({
  default: () => <div>Item Bank Dashboard</div>,
}));
vi.mock("../ItemList", () => ({
  default: () => <div>Bank structure table</div>,
}));
vi.mock("../ItemBuilder", () => ({
  default: () => <div>Authoring surface</div>,
}));
vi.mock("../ItemWizard/ItemWizard", () => ({
  default: () => <div>Item wizard</div>,
}));

function renderBank() {
  return render(
    <MemoryRouter>
      <ItemBankAdmin />
    </MemoryRouter>
  );
}

describe("ItemBankAdmin shell", () => {
  beforeEach(() => {
    useAuth.mockReset();
  });

  it("district sees the same Dashboard / Bank structure / Authoring chrome as admin", () => {
    useAuth.mockReturnValue({
      auth: { role: "district", username: "dist1", token: "t" },
    });
    renderBank();
    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bank structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Authoring" })).toBeInTheDocument();
    expect(screen.getByText("Item Bank Dashboard")).toBeInTheDocument();
  });

  it("teacher can view the bank but not the Authoring tab", () => {
    useAuth.mockReturnValue({
      auth: { role: "teacher", username: "teach1", token: "t" },
    });
    renderBank();
    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bank structure" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Authoring" })).not.toBeInTheDocument();
  });
});
