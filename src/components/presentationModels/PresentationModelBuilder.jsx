// src/components/presentationModels/PresentationModelBuilder.jsx
// D113 -- top-level shell: List <-> Wizard. Mirrors AssemblyModelBuilder.jsx
// (no Dashboard sub-tab). Mounted on Admin Delivery > Presentation and
// /admin/presentation-models.

import React, { useState } from "react";

import PresentationModelList from "./PresentationModelList";
import PresentationModelWizard from "./PresentationModelWizard/PresentationModelWizard";
import { PresentationModelWizardProvider } from "./PresentationModelWizard/PresentationModelWizardContext";

export default function PresentationModelBuilder() {
  const [view, setView] = useState({ mode: "list" }); // { mode: "list" } | { mode: "wizard", id?: string }

  if (view.mode === "wizard") {
    return (
      <PresentationModelWizardProvider
        presentationModelId={view.id}
        onSaved={() => setView({ mode: "list" })}
      >
        <PresentationModelWizard onCancel={() => setView({ mode: "list" })} />
      </PresentationModelWizardProvider>
    );
  }

  return (
    <PresentationModelList
      onCreate={() => setView({ mode: "wizard" })}
      onEdit={(id) => setView({ mode: "wizard", id })}
    />
  );
}
