// D65: the console is addressable and discoverable for admin/district,
// and absent for teacher/student.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import fs from "fs";
import path from "path";

import ProtectedRoute from "../../auth/ProtectedRoute.jsx";
import { useAuth } from "../../auth/AuthProvider.jsx";

vi.mock("../../auth/AuthProvider.jsx", () => ({
  useAuth: vi.fn(),
}));

const ROOT = path.resolve(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("calibration console wiring", () => {
  it("mounts /admin/calibration and /district/calibration in App.jsx", () => {
    const src = read("src/App.jsx");
    expect(src).toMatch(/path="calibration"/);
    expect(src).toMatch(/CalibrationConsolePage/);
    expect(src).toMatch(/CalibrationConsolePage readOnly/);
  });

  it("AdminPage exposes a Calibration tab that embeds the console", () => {
    const src = read("src/pages/AdminPage.jsx");
    expect(src).toMatch(/value="calibration"/);
    expect(src).toMatch(/>Calibration</);
    expect(src).toMatch(/CalibrationConsole/);
  });

  it("DistrictDashboard exposes a read-only Calibration tab", () => {
    const src = read("src/pages/DistrictDashboard.jsx");
    expect(src).toMatch(/id: "calibration"/);
    expect(src).toMatch(/label: "Calibration"/);
    expect(src).toMatch(/CalibrationConsole readOnly/);
    expect(src).toMatch(/entity="calibrationJobs"/);
  });

  it("teacher and student dashboards do not ship the console", () => {
    expect(read("src/pages/TeacherDashboard.jsx")).not.toMatch(/calibration/i);
    expect(read("src/pages/StudentDashboard.jsx")).not.toMatch(/calibration/i);
  });

  it("adds useProcessCalibrationJob beside the D62 hooks", () => {
    const src = read("src/api/queries/calibrationJobs.js");
    expect(src).toMatch(/export function useProcessCalibrationJob/);
    expect(src).toMatch(/\/api\/calibrationJobs\/\$\{id\}\/process/);
  });
});

describe("role isolation for /admin/calibration", () => {
  function renderAt(role) {
    useAuth.mockReturnValue({ auth: role ? { role, username: `${role}1` } : null });
    return render(
      <MemoryRouter initialEntries={["/admin/calibration"]}>
        <Routes>
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute expectedRole="admin">
                <Routes>
                  <Route path="calibration" element={<div>Calibration console</div>} />
                </Routes>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>
    );
  }

  it("lets an admin through", () => {
    renderAt("admin");
    expect(screen.getByText("Calibration console")).toBeInTheDocument();
  });

  it.each(["student", "teacher", "district"])("sends a %s to login", (role) => {
    renderAt(role);
    expect(screen.getByText("Login page")).toBeInTheDocument();
    expect(screen.queryByText("Calibration console")).not.toBeInTheDocument();
  });
});
