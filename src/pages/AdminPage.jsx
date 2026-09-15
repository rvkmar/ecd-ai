// src/pages/AdminPage.jsx
// D73b/D73c: Admin chrome follows PADI TR9 layers via RoleWorkbench.

import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { apiFetch } from "../api/apiClient";
import Spinner from "../components/ui/Spinner";
import toast from "react-hot-toast";
import RoleWorkbench from "@/components/ui/RoleWorkbench";

import ItemBankAdmin from "@/components/itemBank/ItemBankAdmin";
import CompetencyModelBuilder from "@/components/competencies/CompetencyModelBuilder";
import EvidenceModelBuilder from "@/components/evidences/EvidenceModelBuilder";
import TaskModelBuilder from "@/components/taskModels/TaskModelBuilder";
import QMatrixModelBuilder from "@/components/qMatrix/QMatrixModelBuilder";
import CalibrationConsole from "@/components/calibration/CalibrationConsole";
import AssemblyModelBuilder from "@/components/assemblyModels/AssemblyModelBuilder";
import AnalyticsReports from "@/components/reports/AnalyticsReports";
import SessionBuilder from "@/components/sessions/SessionBuilder";
import TasksManager from "@/components/tasks/TasksManager";
import EvidenceAccumulationInspector from "@/components/delivery/EvidenceAccumulationInspector";
import PresentationModelStub from "@/components/delivery/PresentationModelStub";

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
    <RoleWorkbench
      title="Admin Control Center"
      subtitle="Conceptual Assessment Framework, implementation, and delivery (PADI TR9). Settings stay under the profile menu."
      groups={[
        {
          id: "models",
          label: "Models",
          tabs: [
            { id: "student", label: "Student Model", content: <CompetencyModelBuilder /> },
            { id: "evidence", label: "Evidence Model", content: <EvidenceModelBuilder /> },
            { id: "taskmodels", label: "Task Model", content: <TaskModelBuilder /> },
            { id: "assembly", label: "Assembly Model", content: <AssemblyModelBuilder /> },
            { id: "qmatrix", label: "Q-Matrix", content: <QMatrixModelBuilder /> },
            { id: "calibration", label: "Calibration", content: <CalibrationConsole /> },
          ],
        },
        {
          id: "implementation",
          label: "Implementation",
          tabs: [
            { id: "itembank", label: "Item Bank", content: <ItemBankAdmin /> },
            { id: "activities", label: "Activities", content: <TasksManager /> },
          ],
        },
        {
          id: "delivery",
          label: "Delivery",
          tabs: [
            { id: "sessions", label: "Sessions", content: <SessionBuilder /> },
            { id: "accumulation", label: "Evidence Accumulation", content: <EvidenceAccumulationInspector /> },
            { id: "presentation", label: "Presentation", content: <PresentationModelStub /> },
            { id: "reports", label: "Reports", content: <AnalyticsReports /> },
          ],
        },
      ]}
    />
  );
}
