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
const DeliveryModelBuilder = lazyPanel(() =>
  import("@/components/deliveryModels/DeliveryModelBuilder")
);
const AnalyticsReports = lazyPanel(() =>
  import("@/components/reports/AnalyticsReports")
);
const CumulativeEcdReport = lazyPanel(() =>
  import("@/components/reports/CumulativeEcdReport")
);
const StudentModelRecordPanel = lazyPanel(() =>
  import("@/components/reports/StudentModelRecordPanel")
);
const PsychometricsDashboard = lazyPanel(() =>
  import("@/components/psychometrics/PsychometricsDashboard")
);
const SessionBuilder = lazyPanel(() =>
  import("@/components/sessions/SessionBuilder")
);
const TasksManager = lazyPanel(() => import("@/components/tasks/TasksManager"));
const EvidenceAccumulationInspector = lazyPanel(() =>
  import("@/components/delivery/EvidenceAccumulationInspector")
);
const PresentationModelBuilder = lazyPanel(() =>
  import("@/components/presentationModels/PresentationModelBuilder")
);
const TaskModelVariableBuilder = lazyPanel(() =>
  import("@/components/taskModelVariables/TaskModelVariableBuilder")
);
const WorkProductBuilder = lazyPanel(() =>
  import("@/components/workProducts/WorkProductBuilder")
);
const RubricBuilder = lazyPanel(() =>
  import("@/components/rubrics/RubricBuilder")
);
const TemplateBuilder = lazyPanel(() =>
  import("@/components/templates/TemplateBuilder")
);
const DomainAnalysisEditor = lazyPanel(() =>
  import("@/components/domainAnalyses/DomainAnalysisEditor")
);
const DesignPatternBuilder = lazyPanel(() =>
  import("@/components/designPatterns/DesignPatternBuilder")
);
const HumanRatingQueue = lazyPanel(() =>
  import("@/components/rating/HumanRatingQueue")
);
const CurricularPolicyManager = lazyPanel(() =>
  import("@/components/policies/CurricularPolicyManager")
);
const PolicyManager = lazyPanel(() =>
  import("@/components/policies/PolicyManager").then((m) => ({
    default: m.PolicyManager,
  }))
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
      subtitle="Conceptual Assessment Framework (CAF), implementation, and delivery."
      groups={[
        homeWorkbenchGroup([
          {
            id: "curricular-policies",
            label: "Curricular policies",
            content: <CurricularPolicyManager />,
          },
          {
            id: "selection-policies",
            label: "Selection policies",
            content: <PolicyManager />,
          },
        ]),
        {
          id: "models",
          label: "Models",
          tabs: [
            // Authoring order: domain, pattern, then the models they inform.
            // Libraries and estimation sit in their own groups.
            {
              id: "domainanalyses",
              label: "Domain Analysis",
              content: <DomainAnalysisEditor />,
            },
            {
              id: "designpatterns",
              label: "Design Patterns",
              content: <DesignPatternBuilder />,
            },
            { id: "student", label: "Student Model", content: <CompetencyModelBuilder /> },
            { id: "evidence", label: "Evidence Model", content: <EvidenceModelBuilder /> },
            { id: "taskmodels", label: "Task Model", content: <TaskModelBuilder /> },
            // Bound to a Task Model, and one of the four bindings a Template
            // cites, so it sits between those two. The leaf id stays
            // "presentation" so Delivery-era ?tab=presentation addresses
            // still open this Models tab.
            {
              id: "presentation",
              label: "Presentation Model",
              content: <PresentationModelBuilder />,
            },
            {
              id: "templates",
              label: "Templates",
              content: <TemplateBuilder />,
            },
            { id: "assembly", label: "Assembly Model", content: <AssemblyModelBuilder /> },
            {
              id: "deliverymodels",
              label: "Delivery Model",
              content: <DeliveryModelBuilder />,
            },
            { id: "qmatrix", label: "Diagnostic design", content: <QMatrixModelBuilder /> },
          ],
        },
        {
          id: "libraries",
          label: "Libraries",
          tabs: [
            {
              id: "workproducts",
              label: "Work Products",
              content: <WorkProductBuilder />,
            },
            {
              id: "rubrics",
              label: "Rubrics",
              content: <RubricBuilder />,
            },
            {
              id: "taskmodelvariables",
              label: "Task Model Variables",
              content: <TaskModelVariableBuilder />,
            },
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
            { id: "human-rating", label: "Human rating", content: <HumanRatingQueue /> },
            { id: "accumulation", label: "Evidence Accumulation (inspect)", content: <EvidenceAccumulationInspector /> },
            { id: "calibration", label: "Parameter estimation", content: <CalibrationConsole /> },
          ],
        },
        {
          id: "results",
          label: "Results",
          tabs: [
            { id: "psychometrics", label: "Psychometrics", content: <PsychometricsDashboard /> },
            { id: "reports", label: "Reports", content: <AnalyticsReports /> },
            { id: "curriculum", label: "Curriculum", content: <CumulativeEcdReport kind="district" /> },
            { id: "student-model", label: "Student model", content: <StudentModelRecordPanel /> },
          ],
        },
      ]}
    />
  );
}
