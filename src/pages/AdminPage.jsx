// src/pages/AdminPage.jsx
// D73b/D73c: Admin chrome follows PADI TR9 layers via RoleWorkbench.
// D74: tab panels are lazy so opening Admin does not download every wizard.

import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { apiFetch } from "../api/apiClient";
import Spinner from "../components/ui/Spinner";
import toast from "react-hot-toast";
import RoleWorkbench from "@/components/ui/RoleWorkbench";
import { lazyPanel } from "@/components/ui/lazyPanel";
import { homeWorkbenchGroup } from "@/components/home/homeWorkbenchGroup";

const ItemBankAdmin = lazyPanel(() =>
  import("@/components/itemBank/ItemBankAdmin")
);
const CompetencyModelBuilder = lazyPanel(() =>
  import("@/components/competencies/CompetencyModelBuilder")
);
const EvidenceModelBuilder = lazyPanel(() =>
  import("@/components/evidences/EvidenceModelBuilder")
);
const TaskModelBuilder = lazyPanel(() =>
  import("@/components/taskModels/TaskModelBuilder")
);
const QMatrixModelBuilder = lazyPanel(() =>
  import("@/components/qMatrix/QMatrixModelBuilder")
);
const CalibrationConsole = lazyPanel(() =>
  import("@/components/calibration/CalibrationConsole")
);
const AssemblyModelBuilder = lazyPanel(() =>
  import("@/components/assemblyModels/AssemblyModelBuilder")
);
const AnalyticsReports = lazyPanel(() =>
  import("@/components/reports/AnalyticsReports")
);
const SessionBuilder = lazyPanel(() =>
  import("@/components/sessions/SessionBuilder")
);
const TasksManager = lazyPanel(() => import("@/components/tasks/TasksManager"));
const EvidenceAccumulationInspector = lazyPanel(() =>
  import("@/components/delivery/EvidenceAccumulationInspector")
);
const PresentationModelStub = lazyPanel(() =>
  import("@/components/delivery/PresentationModelStub")
);

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
        homeWorkbenchGroup(),
        {
          id: "models",
          label: "Models",
          tabs: [
            { id: "student", label: "Student Model", content: <CompetencyModelBuilder /> },
            { id: "evidence", label: "Evidence Model", content: <EvidenceModelBuilder /> },
            { id: "taskmodels", label: "Task Model", content: <TaskModelBuilder /> },
            { id: "assembly", label: "Assembly Model", content: <AssemblyModelBuilder /> },
            { id: "qmatrix", label: "Diagnostic design", content: <QMatrixModelBuilder /> },
            { id: "calibration", label: "Parameter estimation", content: <CalibrationConsole /> },
          ],
        },
        {
          id: "implementation",
          label: "Implementation",
          tabs: [
            { id: "itembank", label: "Item Bank", content: <ItemBankAdmin /> },
            { id: "activities", label: "Instantiated tasks", content: <TasksManager /> },
          ],
        },
        {
          id: "delivery",
          label: "Delivery",
          tabs: [
            { id: "sessions", label: "Sessions", content: <SessionBuilder /> },
            { id: "accumulation", label: "Evidence Accumulation (inspect)", content: <EvidenceAccumulationInspector /> },
            { id: "presentation", label: "Presentation", content: <PresentationModelStub /> },
            { id: "reports", label: "Reports", content: <AnalyticsReports /> },
          ],
        },
      ]}
    />
  );
}
