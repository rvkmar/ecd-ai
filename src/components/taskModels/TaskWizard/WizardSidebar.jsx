// WizardSidebar.jsx
// ------------------------------------------------------------
// Task Model Wizard Sidebar — convention B adapter onto the shared
// `src/components/wizard/WizardSidebar` shell (D111).
//
// Maps `useTaskModelWizard()` onto the shared props: Next-only forward
// rail gating, per-step readiness amber dots, TM branding. The shell
// itself stays props-driven so CM/EM/AM (convention A) are untouched.
// ------------------------------------------------------------

import { useTaskModelWizard } from "./TaskModelWizardContext";
import WizardSidebar from "@/components/wizard/WizardSidebar";
import {
    canNavigateTaskModelRail,
    taskModelRailSteps,
    taskModelStepHasOutstandingWork,
} from "./taskWizardShellContract";

export default function TaskModelWizardSidebar() {
    const {
        STEPS,
        currentStep,
        setCurrentStep,
        lifecycleStatus,
        isEditable,
        readiness,
        draft,
    } = useTaskModelWizard();

    return (
        <WizardSidebar
            steps={taskModelRailSteps(STEPS)}
            currentStepIndex={currentStep}
            onStepClick={setCurrentStep}
            canNavigateTo={(index) =>
                canNavigateTaskModelRail(index, {
                    isEditable,
                    currentStep,
                })
            }
            outstandingWork={(step) =>
                taskModelStepHasOutstandingWork(step.id, readiness, isEditable)
            }
            locked={Boolean(draft.locked)}
            status={lifecycleStatus}
            title="Task Model Wizard"
            brandInitial="T"
            footerLabel="Task Layer"
        />
    );
}
