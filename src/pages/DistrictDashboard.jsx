import React, { useEffect, useState } from "react";
import DashboardLayout from "../components/ui/DashboardLayout";
import { useAuth } from "../auth/AuthProvider";
import { apiFetch } from "../api/apiClient";
import Spinner from "../components/ui/Spinner";
import toast from "react-hot-toast";

import QuestionBank from "../components/questions/QuestionBank";
import CompetencyModelBuilder from "../components/competencies/CompetencyModelBuilder";
import EvidenceModelBuilder from "../components/evidences/EvidenceModelBuilder";
import TaskModelBuilder from "../components/taskModels/TaskModelBuilder";
import TasksManager from "../components/tasks/TasksManager";
import SessionBuilder from "../components/sessions/SessionBuilder";
import AnalyticsReports from "../components/reports/AnalyticsReports";

import QuestionBankTabs from "@/components/questions/QuestionBankTabs";
import QMatrixModelBuilder from "@/components/qMatrix/QMatrixModelBuilder";
import CalibrationConsole from "@/components/calibration/CalibrationConsole";
import RequirePermission from "@/auth/RequirePermission";

export default function DistrictDashboard() {
  const { auth, logout } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/district/data", {}, auth)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        toast.error("Session expired or unauthorized. Please log in again.");
        logout();
      });
  }, [auth]);

  return (
    // <div className="p-6">
    //   <h1 className="text-2xl font-bold">District Dashboard</h1>
    //   {loading ? (
    //     <Spinner />
    //   ) : (
    //     <pre className="mt-4 bg-gray-100 p-3 rounded text-sm">
    //       {JSON.stringify(data, null, 2)}
    //     </pre>
    //   )}

      <DashboardLayout
        title="District Dashboard"
      tabs={[
          { id: "questions", label: "Item Bank", content: <QuestionBankTabs />, entity: "questions" },
          { id: "activities", label: "Activities", content: <TasksManager />, entity: "tasks" },
          { id: "sessions", label: "Sessions", content: <SessionBuilder />, entity: "sessions" },
          // Read-only Q-matrix view (UI spec §2.1). This tab, not the
          // /district/q-matrices route, is what makes the surface REACHABLE:
          // the sibling district routes (/district/competencies, /tasks,
          // /questions) have no inbound link anywhere in the app, so a route
          // alone would ship something no district user could navigate to —
          // the F7 defect this project already paid for once.
          //
          // Gated by RequirePermission rather than relying on the tab list,
          // because DashboardLayout's own entity filtering is commented out
          // and currently renders every tab it is given.
          {
            id: "qmatrix",
            label: "Q-Matrix",
            entity: "qMatrixModels",
            content: (
              <RequirePermission entity="qMatrixModels" action="view">
                <QMatrixModelBuilder readOnly />
              </RequirePermission>
            ),
          },
          {
            id: "calibration",
            label: "Calibration",
            entity: "calibrationJobs",
            content: (
              <RequirePermission entity="calibrationJobs" action="view">
                <CalibrationConsole readOnly />
              </RequirePermission>
            ),
          },
          { id: "analytics", label: "Analytics", content: <AnalyticsReports/>, entity: "reports" },
        ]}
      />
    // </div>
  );
}
