import { useEffect } from "react";
import { useAuth } from "../auth/AuthProvider";
import { apiFetch } from "../api/apiClient";
import RoleWorkbench from "../components/ui/RoleWorkbench";
import toast from "react-hot-toast";

import QuestionBankTabs from "@/components/questions/QuestionBankTabs";
import TasksManager from "../components/tasks/TasksManager";
import SessionBuilder from "../components/sessions/SessionBuilder";
import AnalyticsReports from "../components/reports/AnalyticsReports";
import EvidenceAccumulationInspector from "@/components/delivery/EvidenceAccumulationInspector";

export default function TeacherDashboard() {
  const { auth, logout } = useAuth();

  useEffect(() => {
    apiFetch("/api/teacher/data", {}, auth)
      .catch((err) => {
        console.error(err);
        toast.error("Session expired or unauthorized. Please log in again.");
        logout();
      });
  }, [auth]);

  return (
    <RoleWorkbench
      title="Teacher Dashboard"
      subtitle="Implementation and delivery. CAF models stay with Admin."
      groups={[
        {
          id: "implementation",
          label: "Implementation",
          tabs: [
            { id: "questions", label: "Item Bank", content: <QuestionBankTabs /> },
            { id: "activities", label: "Activities", content: <TasksManager /> },
          ],
        },
        {
          id: "delivery",
          label: "Delivery",
          tabs: [
            { id: "sessions", label: "Sessions", content: <SessionBuilder /> },
            { id: "accumulation", label: "Evidence Accumulation", content: <EvidenceAccumulationInspector /> },
            { id: "reports", label: "Reports", content: <AnalyticsReports /> },
          ],
        },
      ]}
    />
  );
}
