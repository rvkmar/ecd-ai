import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider.jsx";
import { apiFetch } from "../../api/apiClient.js";
import DistrictDashboard from "../DistrictDashboard.jsx";
import TeacherDashboard from "../TeacherDashboard.jsx";

vi.mock("../../auth/AuthProvider.jsx", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../api/apiClient.js", () => ({
  apiFetch: vi.fn(),
  apiErrorMessage: (e, fallback) => e?.message || fallback,
}));

vi.mock("@/components/itemBank/ItemBankAdmin", () => ({
  default: () => <div>Item bank</div>,
}));
vi.mock("../../components/tasks/TasksManager", () => ({
  default: () => <div>Activities surface</div>,
}));
vi.mock("../../components/sessions/SessionBuilder", () => ({
  default: () => <div>Sessions surface</div>,
}));
vi.mock("../../components/reports/AnalyticsReports", () => ({
  default: () => <div>Reports dashboard</div>,
}));
vi.mock("@/components/delivery/EvidenceAccumulationInspector", () => ({
  default: () => <div>Accumulation inspector</div>,
}));
vi.mock("@/components/home/HomeAnnouncements", () => ({
  default: () => <div>Home announcements</div>,
}));

describe("District and teacher RoleWorkbench (D73c)", () => {
  beforeEach(() => {
    apiFetch.mockResolvedValue({});
  });

  it("district has Home first, then Implementation/Delivery", async () => {
    useAuth.mockReturnValue({
      auth: { role: "district", username: "dist1", token: "t" },
      logout: vi.fn(),
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DistrictDashboard />
      </MemoryRouter>
    );
    await waitFor(() => screen.getByRole("tab", { name: "Home" }));
    expect(screen.getByText("Home announcements")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Implementation" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Delivery" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Q-Matrix" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Calibration" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Models" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Implementation" }));
    expect(screen.getByText("Item bank")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Activities" })).toBeInTheDocument();
  });

  it("teacher matches the same layers and can open Reports", async () => {
    useAuth.mockReturnValue({
      auth: { role: "teacher", username: "teach1", token: "t" },
      logout: vi.fn(),
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TeacherDashboard />
      </MemoryRouter>
    );
    await waitFor(() => screen.getByRole("tab", { name: "Home" }));
    await user.click(screen.getByRole("tab", { name: "Implementation" }));
    await user.click(screen.getByRole("tab", { name: "Delivery" }));
    expect(screen.getByRole("tab", { name: "Sessions" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Evidence Accumulation" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Reports" }));
    expect(screen.getByText("Reports dashboard")).toBeInTheDocument();
  });
});
