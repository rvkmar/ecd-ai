// TaskModelWizard.jsx
// ------------------------------------------------------------
// Task Model Wizard — modular shell
// ------------------------------------------------------------
// Pure orchestration: provider, sidebar rail, step container. No
// business logic, no fetching.
//
// D111: `./WizardSidebar` and `./WizardStepContainer` are thin
// adapters onto `@/components/wizard` (convention B: Next-only rail
// gating, readiness amber-dots, named blocking-reason toasts).
//
// The `competencies` prop is gone. A Task Model binds to Evidence
// Models and derives its construct from them; see the header comment on
// TaskModelWizardContext.jsx for the full rationale.
// ------------------------------------------------------------

import TaskModelWizardProvider from "./TaskModelWizardContext";
import WizardSidebar from "./WizardSidebar";
import WizardStepContainer from "./WizardStepContainer";

export default function TaskModelWizard({
    initialModel,
    evidenceModels = [],
    items = [],
    onCancel,
    onSave,
    onPromote,
}) {
    return (
        <TaskModelWizardProvider
            initialModel={initialModel}
            evidenceModels={evidenceModels}
            items={items}
            onSave={onSave}
            onPromote={onPromote}
        >
            <div className="flex min-h-screen bg-slate-100">
                <WizardSidebar />
                <WizardStepContainer onCancel={onCancel} />
            </div>
        </TaskModelWizardProvider>
    );
}
