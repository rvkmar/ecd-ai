// src/App.jsx
import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import { AuthProvider } from "./auth/AuthProvider";
import ProtectedRoute from "./auth/ProtectedRoute";
import TopBar from "./components/ui/TopBar";
import LoginPage from "./pages/LoginPage";

// New imports for dashboards
import AdminPage from "./pages/AdminPage";
import SettingsPage from "./pages/SettingsPage";
import CalibrationConsolePage from "./pages/CalibrationConsolePage";
import DistrictDashboard from "./pages/DistrictDashboard";
import TeacherDashboard from "./pages/TeacherDashboard";
import StudentDashboard from "./pages/StudentDashboard";

// Existing feature pages
// import QuestionBank from "./components/questions/QuestionBank";
import QuestionBankTabs from "./components/questions/QuestionBankTabs";
import CompetencyModelBuilder from "./components/competencies/CompetencyModelBuilder";
import EvidenceModelBuilder from "./components/evidences/EvidenceModelBuilder";
import TaskModelBuilder from "./components/taskModels/TaskModelBuilder";
import QMatrixModelBuilder from "./components/qMatrix/QMatrixModelBuilder";
import AssemblyModelBuilder from "./components/assemblyModels/AssemblyModelBuilder";
import TasksManager from "./components/tasks/TasksManager";
import SessionBuilder from "./components/sessions/SessionBuilder";
import SessionPlayer from "./components/sessions/SessionPlayer";
import SessionPlayRedirect from "./components/sessions/SessionPlayRedirect";

import Footer from "./components/ui/Footer";
// import NavBar from "./components/ui/NavBar";

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
                    <Route path="questions" element={<QuestionBankTabs />} />
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
        </div>
        <Footer />
      </AuthProvider>
    </Router>
  );
}
