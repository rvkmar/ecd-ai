// WizardSidebar.jsx
// ------------------------------------------------------------
// Item Wizard Sidebar — convention C adapter onto the shared
// `src/components/wizard/WizardSidebar` shell (D112).
//
// Maps `useItemWizard()` onto the shared props: inclusive current-step
// rail gating, real step-completion ticks (not cursor position), Item
// branding, status · version pill. No amber outstanding-work dots.
// ------------------------------------------------------------

import { useItemWizard } from "./ItemWizardContext";
import WizardSidebar from "@/components/wizard/WizardSidebar";
import {
    canNavigateItemRail,
    itemStepIsComplete,
    itemStatusLabel,
    itemWizardRailSteps,
} from "./itemWizardShellContract";

export default function ItemWizardSidebar() {
    const { item, currentStep, goToStep, steps, isLocked, stepCompletion } =
        useItemWizard();

    const status = item.status || "draft";

    return (
        <WizardSidebar
            steps={itemWizardRailSteps(steps)}
            currentStepIndex={currentStep}
            onStepClick={goToStep}
            canNavigateTo={(index) =>
                canNavigateItemRail(index, { isLocked, currentStep })
            }
            isStepComplete={(step) => itemStepIsComplete(step.id, stepCompletion)}
            locked={isLocked}
            status={status}
            statusLabel={itemStatusLabel(status, item.versionNumber)}
            title="Item Wizard"
            subtitle={item.id || "New item"}
            brandInitial="I"
            footerLabel="Item Layer"
        />
    );
}
