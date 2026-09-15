import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import ItemBankAdmin from "../ItemBankAdmin";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../AdminDashboard", () => ({
  default: () => <div>Item Bank Dashboard</div>,
}));

const itemListProps = vi.fn();
vi.mock("../ItemList", () => ({
  default: (props) => {
    itemListProps(props);
    return (
      <div>
        Bank structure table
        {props.onOpenItem ? (
          <button type="button" onClick={() => props.onOpenItem({ id: "itemA" })}>
            Open item
          </button>
        ) : null}
      </div>
    );
  },
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
    itemListProps.mockClear();
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

  it("district can open the Item Wizard from Bank structure", async () => {
    useAuth.mockReturnValue({
      auth: { role: "district", username: "dist1", token: "t" },
    });
    const user = userEvent.setup();
    renderBank();
    await user.click(screen.getByRole("button", { name: "Bank structure" }));
    expect(itemListProps).toHaveBeenCalledWith(
      expect.objectContaining({ onOpenItem: expect.any(Function) })
    );
    await user.click(screen.getByRole("button", { name: "Open item" }));
    expect(screen.getByText("Item wizard")).toBeInTheDocument();
  });

  it("teacher can view the bank but not Authoring or the Item Wizard", async () => {
    useAuth.mockReturnValue({
      auth: { role: "teacher", username: "teach1", token: "t" },
    });
    const user = userEvent.setup();
    renderBank();
    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bank structure" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Authoring" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Bank structure" }));
    expect(itemListProps).toHaveBeenCalledWith(
      expect.objectContaining({ onOpenItem: undefined })
    );
    expect(screen.queryByRole("button", { name: "Open item" })).not.toBeInTheDocument();
    expect(screen.queryByText("Item wizard")).not.toBeInTheDocument();
  });
});
