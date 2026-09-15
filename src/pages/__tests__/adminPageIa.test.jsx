// D73b: Admin chrome is TR9 layers (Models / Implementation / Delivery).
// District tabs stay peers. No new CAF entity named Delivery Model.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import fs from "fs";
import path from "path";

import { useAuth } from "../../auth/AuthProvider.jsx";
import { apiFetch } from "../../api/apiClient.js";
import AdminPage from "../AdminPage.jsx";

vi.mock("../../auth/AuthProvider.jsx", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../api/apiClient.js", () => ({
  apiFetch: vi.fn(),
  apiErrorMessage: (e, fallback) => e?.message || fallback,
}));

vi.mock("@/components/competencies/CompetencyModelBuilder", () => ({
  default: () => <div>Student builder</div>,
}));
vi.mock("@/components/evidences/EvidenceModelBuilder", () => ({
  default: () => <div>Evidence builder</div>,
}));
vi.mock("@/components/taskModels/TaskModelBuilder", () => ({
  default: () => <div>Task builder</div>,
}));
vi.mock("@/components/assemblyModels/AssemblyModelBuilder", () => ({
  default: () => <div>Assembly builder</div>,
}));
vi.mock("@/components/qMatrix/QMatrixModelBuilder", () => ({
  default: () => <div>Q-matrix builder</div>,
}));
vi.mock("@/components/calibration/CalibrationConsole", () => ({
  default: () => <div>Calibration console</div>,
}));
vi.mock("@/components/itemBank/ItemBankAdmin", () => ({
  default: () => <div>Item bank</div>,
}));
vi.mock("@/components/reports/AnalyticsReports", () => ({
  default: () => <div>Reports dashboard</div>,
}));
vi.mock("@/components/sessions/SessionBuilder", () => ({
  default: () => <div>Sessions surface</div>,
}));
vi.mock("@/components/delivery/EvidenceAccumulationInspector", () => ({
  default: () => <div>Accumulation inspector</div>,
}));
vi.mock("@/components/delivery/PresentationModelStub", () => ({
  default: () => <div>Presentation stub</div>,
}));
vi.mock("@/components/tasks/TasksManager", () => ({
  default: () => <div>Activities surface</div>,
}));

const ROOT = path.resolve(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("AdminPage PADI TR9 information architecture (D73b)", () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      auth: { role: "admin", username: "admin1", token: "t" },
      logout: vi.fn(),
    });
    apiFetch.mockResolvedValue({});
  });

  it("nests Assembly, Q-Matrix, and Calibration under Models in source", () => {
    const src = read("src/pages/AdminPage.jsx");
    expect(src).toMatch(/Student Model/);
    expect(src).toMatch(/AssemblyModelBuilder/);
    expect(src).toMatch(/id: "assembly"/);
    expect(src).toMatch(/id: "models"/);
    expect(src).toMatch(/id: "implementation"/);
    expect(src).toMatch(/id: "delivery"/);
    expect(src).toMatch(/id: "reports"/);
    expect(src).not.toMatch(/TabsTrigger value="competencies"/);
    expect(src).not.toMatch(/>Analytics</);
    expect(src).not.toMatch(/Delivery Model/);
  });

  it("drops District Q-Matrix and Calibration tabs; shares RoleWorkbench layers", () => {
    const district = read("src/pages/DistrictDashboard.jsx");
    const teacher = read("src/pages/TeacherDashboard.jsx");
    const student = read("src/pages/StudentDashboard.jsx");
    expect(district).toMatch(/RoleWorkbench/);
    expect(district).not.toMatch(/Q-Matrix/);
    expect(district).not.toMatch(/CalibrationConsole/);
    expect(district).toMatch(/id: "activities"/);
    expect(district).toMatch(/id: "reports"/);
    expect(teacher).toMatch(/RoleWorkbench/);
    expect(teacher).not.toMatch(/Q-Matrix/);
    expect(teacher).not.toMatch(/CalibrationConsole/);
    expect(student).toMatch(/RoleWorkbench/);
    expect(student).toMatch(/id: "reports"/);
    expect(student).not.toMatch(/id: "analytics"/);
  });

  it("shows Student Model, Assembly, and nested measurement tabs after load", async () => {
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Models" })).toBeInTheDocument();
    });

    expect(screen.getByRole("tab", { name: "Student Model" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Assembly Model" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Q-Matrix" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Calibration" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Competency Model" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Analytics" })).not.toBeInTheDocument();
    expect(screen.getByText("Student builder")).toBeInTheDocument();
  });

  it("opens Assembly, Implementation Item Bank, and Delivery Reports", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    );
    await waitFor(() => screen.getByRole("tab", { name: "Models" }));

    await user.click(screen.getByRole("tab", { name: "Assembly Model" }));
    expect(screen.getByText("Assembly builder")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Implementation" }));
    expect(screen.getByText("Item bank")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Activities" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Delivery" }));
    expect(screen.getByRole("tab", { name: "Sessions" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Evidence Accumulation" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Presentation" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getByText("Sessions surface")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Reports" }));
    expect(screen.getByText("Reports dashboard")).toBeInTheDocument();
  });
});
