// src/pages/AdminPage.jsx
// ------------------------------------------------------------
// 🧠 AdminPage — Tailwind Integrated Governance Admin
// ------------------------------------------------------------
// ✔ Tailwind Layout
// ✔ Clean Tab Navigation
// ✔ ECD Item Bank Integrated
// ✔ Governance-Oriented UI
// ✔ No Browser Alerts
// ✔ Session Guard
// ------------------------------------------------------------

import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { apiFetch } from "../api/apiClient";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Spinner from "../components/ui/Spinner";
import toast from "react-hot-toast";

import ItemBankAdmin from "@/components/itemBank/ItemBankAdmin";
import CompetencyModelBuilder from "@/components/competencies/CompetencyModelBuilder";
import EvidenceModelBuilder from "@/components/evidences/EvidenceModelBuilder";
import TaskModelBuilder from "@/components/taskModels/TaskModelBuilder";
import QMatrixModelBuilder from "@/components/qMatrix/QMatrixModelBuilder";
import CalibrationConsole from "@/components/calibration/CalibrationConsole";
import AnalyticsReports from "@/components/reports/AnalyticsReports";
// Users, Policies, and Settings moved to /admin/settings (SettingsPage) --
// see src/pages/SettingsPage.jsx. This page keeps only the
// authoring/governance tabs.

export default function AdminPage() {
  const { auth, logout } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/admin/data", {}, auth)
      .then(() => setLoading(false))
      .catch(() => {
        toast.error("Session expired. Please log in again.");
        logout();
      });
  }, [auth]);

  if (loading) return <Spinner />;

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Admin Control Center
          </h1>
          <p className="text-sm text-gray-500">
            Governance, authoring, psychometrics, and operational management.
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="itembank" className="space-y-8">
          <TabsList className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl shadow">
            <TabsTrigger value="competencies">Competency Model</TabsTrigger>
            <TabsTrigger value="evidence">Evidence Model</TabsTrigger>
            <TabsTrigger value="tasks">Task Model</TabsTrigger>
            <TabsTrigger value="qmatrix">Q-Matrix</TabsTrigger>
            <TabsTrigger value="calibration">Calibration</TabsTrigger>
            <TabsTrigger value="itembank">Item Bank</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* Item Bank */}
          <TabsContent value="itembank" className="bg-white rounded-2xl shadow p-6">
            <ItemBankAdmin />
          </TabsContent>

          {/* Competencies */}
          <TabsContent value="competencies" className="bg-white rounded-2xl shadow p-6">
            <CompetencyModelBuilder />
          </TabsContent>

          {/* Evidence */}
          <TabsContent value="evidence" className="bg-white rounded-2xl shadow p-6">
            <EvidenceModelBuilder />
          </TabsContent>

          {/* Task Models */}
          <TabsContent value="tasks" className="bg-white rounded-2xl shadow p-6">
            <TaskModelBuilder />
          </TabsContent>

          {/* Q-Matrix */}
          <TabsContent value="qmatrix" className="bg-white rounded-2xl shadow p-6">
            <QMatrixModelBuilder />
          </TabsContent>

          {/* D65: calibration console — same surface as /admin/calibration */}
          <TabsContent value="calibration" className="bg-white rounded-2xl shadow p-6">
            <CalibrationConsole />
          </TabsContent>

          {/* Analytics */}
          <TabsContent value="analytics" className="bg-white rounded-2xl shadow p-6">
            <AnalyticsReports />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
