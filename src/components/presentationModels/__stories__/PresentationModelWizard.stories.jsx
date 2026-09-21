// D114. Calendar residual: Storybook story for the Presentation Model
// wizard in both themes. Toggle Light / Dark via the Storybook theme
// toolbar (preview.tsx toggles the app `.dark` class).
//
// Stories inject a mocked wizard context so they do not need a live API.

import React, { useState } from "react";
import PresentationModelWizard from "../PresentationModelWizard/PresentationModelWizard";
import { PresentationModelWizardContext } from "../PresentationModelWizard/PresentationModelWizardContext";
import Step4Accessibility from "../PresentationModelWizard/steps/Step4Accessibility";

const meta = {
  title: "Presentation Model/Wizard",
  component: PresentationModelWizard,
  parameters: {
    docs: {
      description: {
        component:
          "Convention-A Presentation Model wizard on the shared shell. Use the theme toolbar for light and dark.",
      },
    },
  },
};
export default meta;

function makeDraft(overrides = {}) {
  return {
    id: "pm-story",
    name: "Large-text delivery",
    description: "Storybook fixture — accessibility profile is the point",
    taskModelId: "tm1",
    taskModelVersion: 1,
    layout: { itemOrder: "authored", navigation: "linear", grouping: "none" },
    conditionalDisplay: {
      showFeedback: "after_item",
      allowSkip: false,
      allowReview: true,
      showProgress: true,
    },
    accessibility: { profile: "large_text", fontScale: 1.25, timeMultiplier: 1.5 },
    status: "draft",
    locked: false,
    ...overrides,
  };
}

function MockWizardProvider({ step = 4, draftOverrides = {}, children }) {
  const [draft, setDraft] = useState(() => makeDraft(draftOverrides));
  const [currentStep, setCurrentStep] = useState(step);

  const value = {
    draft,
    loading: false,
    currentStep,
    setCurrentStep,
    taskModels: [{ id: "tm1", name: "Fractions Task", versionNumber: 1, status: "confirmed" }],
    updateField: () => {},
    selectTaskModel: () => {},
    patchLayout: (patch) => setDraft((d) => ({ ...d, layout: { ...d.layout, ...patch } })),
    patchConditionalDisplay: (patch) =>
      setDraft((d) => ({
        ...d,
        conditionalDisplay: { ...d.conditionalDisplay, ...patch },
      })),
    patchAccessibility: (patch) =>
      setDraft((d) => ({
        ...d,
        accessibility: { ...(d.accessibility || {}), ...patch },
      })),
    canProceed: () => true,
    saveDraft: async () => true,
    saveAndReview: async () => true,
    confirmModel: async () => true,
    returnToDraft: async () => true,
    isDirty: false,
  };

  return (
    <PresentationModelWizardContext.Provider value={value}>
      {children}
    </PresentationModelWizardContext.Provider>
  );
}

/** Full wizard chrome; starts on Accessibility (Step 4). Theme toolbar = light/dark. */
export const AccessibilityStep = {
  render: () => (
    <MockWizardProvider step={4}>
      <PresentationModelWizard onCancel={() => {}} />
    </MockWizardProvider>
  ),
};

/** Isolated accessibility profile editor — same Step4 as production. */
export const AccessibilityProfileOnly = {
  render: () => (
    <MockWizardProvider step={4}>
      <div className="max-w-xl">
        <Step4Accessibility />
      </div>
    </MockWizardProvider>
  ),
};

/** Confirmed + locked: profile persisted, controls disabled. */
export const ConfirmedLocked = {
  render: () => (
    <MockWizardProvider
      step={4}
      draftOverrides={{
        status: "confirmed",
        locked: true,
        accessibility: { profile: "high_contrast", fontScale: 1.5, timeMultiplier: 2 },
      }}
    >
      <div className="max-w-xl">
        <Step4Accessibility />
      </div>
    </MockWizardProvider>
  ),
};
