// src/App.jsx
import React, { Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import { AuthProvider } from "./auth/AuthProvider";
import ProtectedRoute from "./auth/ProtectedRoute";
import TopBar from "./components/ui/TopBar";
import Footer from "./components/ui/Footer";
import Spinner from "./components/ui/Spinner";
import { lazyPanel } from "./components/ui/lazyPanel";

// D74: route-level code splitting. Eager shell (auth, chrome, login) stays
// in the entry chunk; role workspaces and builders load on demand.
const LoginPage = lazyPanel(() => import("./pages/LoginPage"));
const AdminPage = lazyPanel(() => import("./pages/AdminPage"));
const SettingsPage = lazyPanel(() => import("./pages/SettingsPage"));
const CalibrationConsolePage = lazyPanel(() =>
  import("./pages/CalibrationConsolePage")
);
const PsychometricsPage = lazyPanel(() => import("./pages/PsychometricsPage"));
const DistrictDashboard = lazyPanel(() => import("./pages/DistrictDashboard"));
const TeacherDashboard = lazyPanel(() => import("./pages/TeacherDashboard"));
const StudentDashboard = lazyPanel(() => import("./pages/StudentDashboard"));

const ItemBankAdmin = lazyPanel(() =>
  import("./components/itemBank/ItemBankAdmin")
);
const CompetencyModelBuilder = lazyPanel(() =>
  import("./components/competencies/CompetencyModelBuilder")
);
const EvidenceModelBuilder = lazyPanel(() =>
  import("./components/evidences/EvidenceModelBuilder")
);
const TaskModelBuilder = lazyPanel(() =>
  import("./components/taskModels/TaskModelBuilder")
);
const QMatrixModelBuilder = lazyPanel(() =>
  import("./components/qMatrix/QMatrixModelBuilder")
);
const AssemblyModelBuilder = lazyPanel(() =>
  import("./components/assemblyModels/AssemblyModelBuilder")
);
const TasksManager = lazyPanel(() => import("./components/tasks/TasksManager"));
const SessionBuilder = lazyPanel(() =>
  import("./components/sessions/SessionBuilder")
);
const SessionPlayer = lazyPanel(() =>
  import("./components/sessions/SessionPlayer")
);
const SessionPlayRedirect = lazyPanel(() =>
  import("./components/sessions/SessionPlayRedirect")
);

export default function App() {
  function EvidenceRoutes() {
    return (
      <Routes>
        {/* List */}
        <Route index element={<EvidenceModelBuilder />} />

        {/* New Wizard */}
        <Route path="new" element={<EvidenceModelBuilder />} />

        {/* Edit/View Wizard */}
        <Route path=":id" element={<EvidenceModelBuilder />} />

        {/* Safety fallback */}
        <Route path="*" element={<Navigate to="." replace />} />
      </Routes>
    );
  }

  return (
    <Router>
      <AuthProvider>
        <TopBar />
          {/* Day 43 (Week 9, Build Reference Part 5.2's own example: "a
              toast dropping the one sentence saying what to do"): every
              toast.error(...) across ~30 files and 100+ call sites was
              inheriting react-hot-toast's default ariaProps
              (role="status"/aria-live="polite") and the same fixed 3s
              duration as a success toast -- an error, which a screen
              reader user needs announced assertively and a sighted user
              needs enough time to actually read and act on, was getting
              neither. Fixed centrally, here, once: react-hot-toast's
              per-type toastOptions apply to every existing toast.error()
              call site with no changes to any of them. */}
          <Toaster
            position="bottom-center"
            toastOptions={{
              duration: 3000,
              style: {
                marginBottom: "64px",
                textAlign: "center",
              },
              success: {
                ariaProps: { role: "status", "aria-live": "polite" },
              },
              error: {
                ariaProps: { role: "alert", "aria-live": "assertive" },
                duration: 6000,
              },
            }}
          />

        <div className="app-container">
          <Suspense fallback={<Spinner />}>
          <Routes>
            {/* Public route */}
            <Route path="/login" element={<LoginPage />} />

            {/* Admin */}
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute expectedRole="admin">
                  <Routes>
                    <Route index element={<AdminPage />} />
                    {/* Add more admin-only tools here */}

                    {/* Users, Policies, Appearance, Data, System --
                        Settings is now the single home for all of these
                        (previously split across /admin/teachers,
                        /admin/students, /admin/policies, and an AdminPage
                        "Settings" tab). */}
                    <Route path="settings" element={<SettingsPage />} />

                    <Route path="evidence/*" element={<EvidenceRoutes />} />

                    {/* D54: Assembly Model authoring wizard (test
                        specification -- SMV accuracy targets, stopping
                        rules, selection algorithm). Admin-authored per
                        rolePermissions.js's reasoning: a system-level
                        measurement decision, not local authoring. */}
                    <Route path="assembly-models" element={<AssemblyModelBuilder />} />

                    {/* D65: calibration job console. Also a tab on
                        AdminPage so the surface is not URL-only. */}
                    <Route path="calibration" element={<CalibrationConsolePage />} />

                    {/* D81: psychometric dashboard shell + provenance stamp.
                        Also a Delivery tab on AdminPage. */}
                    <Route path="psychometrics" element={<PsychometricsPage />} />
                  </Routes>
                </ProtectedRoute>
              }
            />

            {/* District */}
            <Route
              path="/district/*"
              element={
                <ProtectedRoute expectedRole="district">
                <Routes>
                    <Route index element={<DistrictDashboard />} />
                    {/* Add more district user tools */}
                    <Route path="competencies" element={<CompetencyModelBuilder />} />
                    {/* <Route path="evidence" element={<EvidenceModelBuilder />} /> */}
                    <Route path="evidence/*" element={<EvidenceRoutes />} />
                    <Route path="tasks" element={<TaskModelBuilder />} />
                    <Route path="questions" element={<ItemBankAdmin />} />
                    {/* Bookmark routes only. D73c: Q-matrix and calibration
                        are Admin Models surfaces, not district tabs. */}
                    <Route path="q-matrices" element={<QMatrixModelBuilder readOnly />} />
                    <Route path="calibration" element={<CalibrationConsolePage readOnly />} />
                    <Route path="manage-tasks" element={<TasksManager />} />
                    <Route path="sessions/build" element={<SessionBuilder />} />
                    <Route path="sessions/play" element={<SessionPlayer />} />
                    {/* D50 leftover: staff Play must land on a role-prefixed
                        player, not /sessions/:id/player (that URL is unrouted
                        and the catch-all sends the user to /login). */}
                    <Route path="sessions/:sessionId/player" element={<SessionPlayer />} />

                    {/* ✅ District review route (same player in teacher mode) */}
                    <Route
                      path="sessions/:sessionId/review"
                      element={
                        <ProtectedRoute expectedRole="district">
                          <SessionPlayer mode="teacher" />
                        </ProtectedRoute>
                      }
                    />
                </Routes>
                </ProtectedRoute>
              }
            />

            <Route
              path="/teacher/*"
              element={
                <ProtectedRoute expectedRole="teacher">
                <Routes>
                  <Route index element={<TeacherDashboard />} />
                    {/* Add more teacher tools */}
                    <Route path="tasks" element={<TasksManager />} />
                    <Route path="sessions/build" element={<SessionBuilder />} />
                    <Route path="sessions/play" element={<SessionPlayer />} />
                    <Route path="sessions/:sessionId/player" element={<SessionPlayer />} />

                    {/* Secure teacher review route (mode='teacher') */}
                    <Route
                      path="sessions/:sessionId/review"
                      element={
                        <ProtectedRoute expectedRole="teacher">
                          <SessionPlayer mode="teacher" />
                        </ProtectedRoute>
                      }
                    />
                </Routes>
                </ProtectedRoute>
              }
            />

            <Route
              path="/student/*"
              element={
                <ProtectedRoute expectedRole="student">
                  {/* D50 (finding F7): this used to be a bare <StudentDashboard />,
                      so EVERY /student/* URL rendered the dashboard and the
                      session player could never be routed to with an id. The
                      nested <Routes> mirrors what /district/* and /teacher/*
                      already do. The trailing "*" keeps the previous behaviour
                      for any other path. */}
                  <Routes>
                    <Route index element={<StudentDashboard />} />
                    <Route path="sessions/:sessionId/player" element={<SessionPlayer />} />
                    <Route path="*" element={<StudentDashboard />} />
                  </Routes>
                </ProtectedRoute>
              }
            />
            {/* Legacy unprefixed Play URL. handlePlay used to send staff
                here; the catch-all then rendered /login and looked like a
                logout. Keep the bookmark working by forwarding to the
                role-prefixed player without clearing auth. */}
            <Route
              path="/sessions/:sessionId/player"
              element={<SessionPlayRedirect />}
            />

            {/* Default → landing/login */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
          </Suspense>
        </div>
        <Footer />
      </AuthProvider>
    </Router>
  );
}
