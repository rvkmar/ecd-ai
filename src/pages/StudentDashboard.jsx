import { useEffect } from "react";
import { useAuth } from "../auth/AuthProvider";
import { apiFetch } from "../api/apiClient";
import toast from "react-hot-toast";

import RoleWorkbench from "../components/ui/RoleWorkbench";
import StudentSessionList from "../components/sessions/StudentSessionList";
import AnalyticsReports from "../components/reports/AnalyticsReports";

export default function StudentDashboard() {
  const { auth, logout } = useAuth();

  useEffect(() => {
    apiFetch("/api/student/data", {}, auth)
      .catch((err) => {
        console.error(err);
        toast.error("Session expired or unauthorized. Please log in again.");
        logout();
      });
  }, [auth]);

  return (
    <RoleWorkbench
      title="Student Dashboard"
      subtitle="Delivery only — sit sessions and see your reports."
      groups={[
        {
          id: "delivery",
          label: "Delivery",
          tabs: [
            { id: "mysessions", label: "My Sessions", content: <StudentSessionList /> },
            { id: "reports", label: "Reports", content: <AnalyticsReports /> },
          ],
        },
      ]}
    />
  );
}
