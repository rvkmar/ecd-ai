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
vi.mock("@/components/psychometrics/PsychometricsDashboard", () => ({
  default: () => <div>Psychometrics shell</div>,
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
vi.mock("@/components/home/HomeAnnouncements", () => ({
  default: () => <div>Home announcements</div>,
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

  it("nests Assembly, Diagnostic design, and Parameter estimation under Models in source", () => {
    const src = read("src/pages/AdminPage.jsx");
    const app = read("src/App.jsx");
    expect(src).toMatch(/Student Model/);
    expect(src).toMatch(/AssemblyModelBuilder/);
    expect(src).toMatch(/id: "assembly"/);
    expect(src).toMatch(/id: "models"/);
    expect(src).toMatch(/id: "implementation"/);
    expect(src).toMatch(/id: "delivery"/);
    expect(src).toMatch(/id: "reports"/);
    expect(src).toMatch(/id: "psychometrics"/);
    expect(src).toMatch(/PsychometricsDashboard/);
    expect(app).toMatch(/path="psychometrics"/);
    expect(app).toMatch(/PsychometricsPage/);
    expect(src).not.toMatch(/TabsTrigger value="competencies"/);
    expect(src).not.toMatch(/>Analytics</);
    expect(src).not.toMatch(/Delivery Model/);
  });

  it("drops District Diagnostic design and Parameter estimation tabs; shares RoleWorkbench layers", () => {
    const district = read("src/pages/DistrictDashboard.jsx");
    const teacher = read("src/pages/TeacherDashboard.jsx");
    const student = read("src/pages/StudentDashboard.jsx");
    expect(district).toMatch(/RoleWorkbench/);
    expect(district).not.toMatch(/Diagnostic design/);
    expect(district).not.toMatch(/CalibrationConsole/);
    expect(district).toMatch(/id: "activities"/);
    expect(district).toMatch(/id: "reports"/);
    expect(teacher).toMatch(/RoleWorkbench/);
    expect(teacher).not.toMatch(/Diagnostic design/);
    expect(teacher).not.toMatch(/CalibrationConsole/);
    expect(student).toMatch(/RoleWorkbench/);
    expect(student).toMatch(/id: "reports"/);
    expect(student).not.toMatch(/id: "analytics"/);
  });

  it("shows Home first, then Student Model after opening Models", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Home" })).toBeInTheDocument();
    });
    expect(screen.getByText("Home announcements")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Announcements" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Models" }));
    expect(screen.getByRole("tab", { name: "Student Model" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Assembly Model" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Diagnostic design" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Parameter estimation" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Competency Model" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Analytics" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Student builder")).toBeInTheDocument());
  });

  it("opens Assembly, Implementation Item Bank, and Delivery Reports", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    );
    await waitFor(() => screen.getByRole("tab", { name: "Home" }));

    await user.click(screen.getByRole("tab", { name: "Models" }));
    await user.click(screen.getByRole("tab", { name: "Assembly Model" }));
    await waitFor(() => expect(screen.getByText("Assembly builder")).toBeInTheDocument());

    await user.click(screen.getByRole("tab", { name: "Implementation" }));
    await waitFor(() => expect(screen.getByText("Item bank")).toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Instantiated tasks" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Delivery" }));
    expect(screen.getByRole("tab", { name: "Sessions" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Evidence Accumulation (inspect)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Presentation" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Psychometrics" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Reports" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Sessions surface")).toBeInTheDocument());

    await user.click(screen.getByRole("tab", { name: "Psychometrics" }));
    await waitFor(() => expect(screen.getByText("Psychometrics shell")).toBeInTheDocument());

    await user.click(screen.getByRole("tab", { name: "Reports" }));
    await waitFor(() => expect(screen.getByText("Reports dashboard")).toBeInTheDocument());
  });
});
