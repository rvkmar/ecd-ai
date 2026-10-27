// D73b: Admin chrome is TR9 layers (Models / Implementation / Delivery).
// District tabs stay peers. Delivery Model sits under Models, after Assembly Model.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
vi.mock("@/components/deliveryModels/DeliveryModelBuilder", () => ({
  default: () => <div>Delivery model library</div>,
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
vi.mock("@/components/presentationModels/PresentationModelBuilder", () => ({
  default: () => <div>Presentation builder</div>,
}));
vi.mock("@/components/taskModelVariables/TaskModelVariableBuilder", () => ({
  default: () => <div>TMV library</div>,
}));
vi.mock("@/components/workProducts/WorkProductBuilder", () => ({
  default: () => <div>Work Products library</div>,
}));
vi.mock("@/components/rubrics/RubricBuilder", () => ({
  default: () => <div>Rubrics library</div>,
}));
vi.mock("@/components/templates/TemplateBuilder", () => ({
  default: () => <div>Templates library</div>,
}));
vi.mock("@/components/domainAnalyses/DomainAnalysisEditor", () => ({
  default: () => <div>Domain analysis form</div>,
}));
vi.mock("@/components/designPatterns/DesignPatternBuilder", () => ({
  default: () => <div>Design patterns library</div>,
}));
vi.mock("@/components/rating/HumanRatingQueue", () => ({
  default: () => <div>Human rating queue</div>,
}));
vi.mock("@/components/home/HomeAnnouncements", () => ({
  default: () => <div>Home announcements</div>,
}));
vi.mock("@/components/tasks/TasksManager", () => ({
  default: () => <div>Activities surface</div>,
}));
vi.mock("@/components/policies/CurricularPolicyManager", () => ({
  default: () => <div>Curricular policies editor</div>,
}));
vi.mock("@/components/policies/PolicyManager", () => ({
  PolicyManager: () => <div>Selection policies editor</div>,
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

  it("keeps Assembly and Diagnostic design under Models, and moves estimation to Delivery", () => {
    const src = read("src/pages/AdminPage.jsx");
    const app = read("src/App.jsx");
    const models = src.slice(src.indexOf('id: "models"'), src.indexOf('id: "libraries"'));
    const delivery = src.slice(src.indexOf('id: "delivery"'), src.indexOf('id: "results"'));
    const results = src.slice(src.indexOf('id: "results"'));
    expect(src).toMatch(/Student Model/);
    expect(src).toMatch(/AssemblyModelBuilder/);
    expect(models).toMatch(/id: "assembly"/);
    expect(models).toMatch(/id: "deliverymodels"/);
    expect(models.indexOf('id: "assembly"')).toBeLessThan(models.indexOf('id: "deliverymodels"'));
    expect(models).toMatch(/Delivery Model/);
    expect(delivery).not.toMatch(/id: "deliverymodels"/);
    expect(models).toMatch(/id: "templates"/);
    expect(models).not.toMatch(/id: "workproducts"/);
    expect(models).not.toMatch(/id: "calibration"/);
    expect(delivery).toMatch(/id: "calibration"/);
    expect(delivery).not.toMatch(/id: "psychometrics"/);
    expect(results).toMatch(/id: "psychometrics"/);
    expect(results).toMatch(/id: "reports"/);
    expect(src).toMatch(/id: "implementation"/);
    expect(src).toMatch(/PsychometricsDashboard/);
    expect(src).toMatch(/PresentationModelBuilder/);
    expect(src).not.toMatch(/PresentationModelStub/);
    expect(models).toMatch(/id: "presentation"/);
    expect(models.indexOf('id: "taskmodels"')).toBeLessThan(models.indexOf('id: "presentation"'));
    expect(models.indexOf('id: "presentation"')).toBeLessThan(models.indexOf('id: "templates"'));
    expect(delivery).not.toMatch(/id: "presentation"/);
    expect(app).toMatch(/path="psychometrics"/);
    expect(app).toMatch(/PsychometricsPage/);
    expect(app).toMatch(/path="presentation-models"/);
    expect(src).not.toMatch(/TabsTrigger value="competencies"/);
    expect(src).not.toMatch(/>Analytics</);
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

  it("shows Home first, then Domain Analysis after opening Models", async () => {
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
    const modelList = screen.getAllByRole("tablist").find((list) =>
      list.textContent?.includes("Domain Analysis")
    );
    expect(within(modelList).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Domain Analysis",
      "Design Patterns",
      "Student Model",
      "Evidence Model",
      "Task Model",
      "Presentation Model",
      "Templates",
      "Assembly Model",
      "Delivery Model",
      "Diagnostic design",
    ]);
    expect(screen.getByRole("tab", { name: "Libraries" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Results" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Competency Model" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Analytics" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Domain analysis form")).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "Student Model" }));
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
    await waitFor(
      () => expect(screen.getByText("Assembly builder")).toBeInTheDocument(),
      { timeout: 8000 }
    );
    await user.click(screen.getByRole("tab", { name: "Delivery Model" }));
    await waitFor(() => expect(screen.getByText("Delivery model library")).toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Templates" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Templates" }));
    await waitFor(() => expect(screen.getByText("Templates library")).toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Design Patterns" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Design Patterns" }));
    await waitFor(
      () => expect(screen.getByText("Design patterns library")).toBeInTheDocument(),
      { timeout: 8000 }
    );
    await user.click(screen.getByRole("tab", { name: "Presentation Model" }));
    await waitFor(() => expect(screen.getByText("Presentation builder")).toBeInTheDocument());
    expect(screen.queryByText("Presentation stub")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Implementation" }));
    await waitFor(() => expect(screen.getByText("Item bank")).toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Instantiated tasks" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Delivery" }));
    expect(screen.getByRole("tab", { name: "Sessions" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Human rating" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Evidence Accumulation (inspect)" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Presentation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Presentation Model" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Parameter estimation" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Psychometrics" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Reports" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Sessions surface")).toBeInTheDocument());

    await user.click(screen.getByRole("tab", { name: "Libraries" }));
    expect(within(screen.getAllByRole("tablist").find((list) => list.textContent?.includes("Work Products"))).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Work Products",
      "Rubrics",
      "Task Model Variables",
    ]);
    await waitFor(() => expect(screen.getByText("Work Products library")).toBeInTheDocument());

    await user.click(screen.getByRole("tab", { name: "Results" }));
    expect(screen.getByRole("tab", { name: "Psychometrics" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Reports" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Psychometrics" }));
    await waitFor(() => expect(screen.getByText("Psychometrics shell")).toBeInTheDocument());

    await user.click(screen.getByRole("tab", { name: "Reports" }));
    await waitFor(() => expect(screen.getByText("Reports dashboard")).toBeInTheDocument());
  });

  it("opens a saved Delivery presentation address on Models", async () => {
    render(
      <MemoryRouter initialEntries={["/?tab=presentation"]}>
        <AdminPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("Presentation builder")).toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Models" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "Presentation Model" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "Delivery" })).not.toHaveAttribute("data-state", "active");
  });

  it("opens a saved library or estimation address on the new group", async () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/?tab=rubrics"]}>
        <AdminPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("Rubrics library")).toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Libraries" })).toHaveAttribute("data-state", "active");
    unmount();

    render(
      <MemoryRouter initialEntries={["/?tab=calibration"]}>
        <AdminPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("Calibration console")).toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Delivery" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "Parameter estimation" })).toHaveAttribute("data-state", "active");
  });

  it("opens curricular and selection policies on Home beside announcements", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    );
    await waitFor(() => screen.getByRole("tab", { name: "Home" }));
    expect(screen.queryByRole("tab", { name: "Policies" })).not.toBeInTheDocument();

    const homeList = screen.getAllByRole("tablist").find((list) =>
      list.textContent?.includes("Announcements")
    );
    expect(within(homeList).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Announcements",
      "Curricular policies",
      "Selection policies",
    ]);
    await user.click(screen.getByRole("tab", { name: "Curricular policies" }));
    await waitFor(() =>
      expect(screen.getByText("Curricular policies editor")).toBeInTheDocument()
    );
    await user.click(screen.getByRole("tab", { name: "Selection policies" }));
    await waitFor(() =>
      expect(screen.getByText("Selection policies editor")).toBeInTheDocument()
    );

    const admin = read("src/pages/AdminPage.jsx");
    expect(admin).not.toMatch(/id: "policies"/);
    expect(read("src/pages/SettingsPage.jsx")).not.toMatch(/value="policies"/);
    expect(read("src/pages/SettingsPage.jsx")).toMatch(/BulkUploadPanel/);
    expect(read("src/pages/DistrictDashboard.jsx")).not.toMatch(/CurricularPolicyManager|PolicyManager/);
    expect(read("src/components/competencies/CompetencyWizard/steps/Step3ConstructFramework.jsx")).toMatch(
      /Home → Curricular policies/
    );
    expect(read("src/components/competencies/CompetencyWizard/steps/Step3ConstructFramework.jsx")).not.toMatch(
      /Settings → Policies/
    );
    expect(read("src/components/policies/CurricularPolicyManager.jsx")).not.toMatch(/BulkUploadCard/);
  });
});
