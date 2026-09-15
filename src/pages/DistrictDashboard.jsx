import { useEffect } from "react";
import RoleWorkbench from "../components/ui/RoleWorkbench";
import { useAuth } from "../auth/AuthProvider";
import { apiFetch } from "../api/apiClient";
import toast from "react-hot-toast";
import { lazyPanel } from "@/components/ui/lazyPanel";
import { homeWorkbenchGroup } from "@/components/home/homeWorkbenchGroup";

// Keep import paths identical to the prior static imports so existing
// vitest mocks (relative + @/) continue to intercept the lazy chunks.
const ItemBankAdmin = lazyPanel(() =>
  import("@/components/itemBank/ItemBankAdmin")
);
const TasksManager = lazyPanel(() =>
  import("../components/tasks/TasksManager")
);
const SessionBuilder = lazyPanel(() =>
  import("../components/sessions/SessionBuilder")
);
const AnalyticsReports = lazyPanel(() =>
  import("../components/reports/AnalyticsReports")
);
const EvidenceAccumulationInspector = lazyPanel(() =>
  import("@/components/delivery/EvidenceAccumulationInspector")
);

export default function DistrictDashboard() {
  const { auth, logout } = useAuth();

  useEffect(() => {
    apiFetch("/api/district/data", {}, auth)
      .catch((err) => {
        console.error(err);
        toast.error("Session expired or unauthorized. Please log in again.");
        logout();
      });
  }, [auth]);

  return (
    <RoleWorkbench
      title="District Dashboard"
      subtitle="Implementation and delivery. CAF models stay with Admin."
      groups={[
        homeWorkbenchGroup(),
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
            { id: "reports", label: "Reports", content: <AnalyticsReports /> },
          ],
        },
      ]}
    />
  );
}
