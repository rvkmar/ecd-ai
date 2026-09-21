// src/components/itemBank/ItemWizard/ItemWizard.jsx
// ------------------------------------------------------------
// Item Wizard — orchestration only (D112).
//
// `./WizardSidebar` and `./WizardStepContainer` are thin adapters onto
// `@/components/wizard` (convention C: inclusive current-step rail
// gating, real completion ticks, named step-blocker banner, Item
// lifecycle toolbar). Step routing and item-domain logic stay in the
// adapters / context, not in the shared shell.
// ------------------------------------------------------------

import { ItemWizardProvider } from "./ItemWizardContext";
import WizardSidebar from "./WizardSidebar";
import WizardStepContainer from "./WizardStepContainer";

export default function ItemWizard({ item, onClose }) {
    return (
        <ItemWizardProvider initialItem={item}>
            <div className="flex min-h-screen bg-slate-100">
                <WizardSidebar />
                <WizardStepContainer onClose={onClose} />
            </div>
        </ItemWizardProvider>
    );
}
