// D113 — Presentation Model wizard on the shared shell (convention A).
//
// These tests would fail if authoring returned to PresentationModelStub,
// or if the wizard grew a private chrome fork instead of
// `@/components/wizard`.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, fireEvent } from "@testing-library/react";
import toast from "react-hot-toast";

import PresentationModelWizard, { STEP_CONFIG } from "../PresentationModelWizard/PresentationModelWizard";

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../PresentationModelWizard/steps/Step1Identity", () => ({
  default: () => <div>step-identity</div>,
}));
vi.mock("../PresentationModelWizard/steps/Step2Layout", () => ({
  default: () => <div>step-layout</div>,
}));
vi.mock("../PresentationModelWizard/steps/Step3ConditionalDisplay", () => ({
  default: () => <div>step-conditional</div>,
}));
vi.mock("../PresentationModelWizard/steps/Step4Accessibility", () => ({
  default: () => <div>step-a11y</div>,
}));
vi.mock("../PresentationModelWizard/steps/Step5Review", () => ({
  default: () => <div>step-review</div>,
}));

let mockCtx;
vi.mock("../PresentationModelWizard/PresentationModelWizardContext", () => ({
  usePresentationModelWizard: () => mockCtx,
}));

const here = dirname(fileURLToPath(import.meta.url));

describe("Presentation Model authoring is not the stub", () => {
  it("AdminPage mounts Presentation Model under Models, not Delivery", () => {
    const admin = readFileSync(join(here, "../../../pages/AdminPage.jsx"), "utf8");
    const models = admin.slice(admin.indexOf('id: "models"'), admin.indexOf('id: "libraries"'));
    const delivery = admin.slice(admin.indexOf('id: "delivery"'), admin.indexOf('id: "results"'));
    expect(admin).toMatch(/PresentationModelBuilder/);
    expect(admin).not.toMatch(/PresentationModelStub/);
    expect(models).toMatch(/id: "presentation"/);
    expect(models).toMatch(/Presentation Model/);
    expect(delivery).not.toMatch(/id: "presentation"/);
    expect(delivery).not.toMatch(/PresentationModelBuilder/);
  });

  it("stub file is gone", () => {
    expect(existsSync(join(here, "../../delivery/PresentationModelStub.jsx"))).toBe(false);
  });

  it("D114 Storybook stories exist for light/dark toolbar review", () => {
    expect(
      existsSync(join(here, "../__stories__/PresentationModelWizard.stories.jsx"))
    ).toBe(true);
  });
});

describe("PresentationModelWizard shared-shell imports (convention A)", () => {
  it("imports @/components/wizard directly, not a private chrome fork", () => {
    const wizard = readFileSync(
      join(here, "../PresentationModelWizard/PresentationModelWizard.jsx"),
      "utf8"
    );
    expect(wizard).toMatch(/from ["']@\/components\/wizard\/WizardSidebar["']/);
    expect(wizard).toMatch(/from ["']@\/components\/wizard\/WizardStepContainer["']/);
    expect(wizard).not.toMatch(/canNavigateTo/);
    expect(wizard).not.toMatch(/blockersBanner/);
    expect(wizard).not.toMatch(/toastOnBlock/);
  });
});

describe("PresentationModelWizard convention A chrome", () => {
  beforeEach(() => {
    toast.error.mockReset();
    mockCtx = {
      draft: {
        id: "pm1",
        name: "PM",
        taskModelId: "tm1",
        layout: { itemOrder: "authored", navigation: "linear" },
        status: "draft",
        locked: false,
      },
      loading: false,
      currentStep: 1,
      setCurrentStep: vi.fn(),
      canProceed: () => true,
      saveDraft: vi.fn().mockResolvedValue(true),
      saveAndReview: vi.fn(),
      confirmModel: vi.fn(),
      returnToDraft: vi.fn(),
      isDirty: false,
    };
  });

  it("renders shared-shell branding and step labels", () => {
    render(<PresentationModelWizard onCancel={() => {}} />);
    expect(screen.getByText("Presentation Model Wizard")).toBeInTheDocument();
    expect(screen.getByText("Presentation Layer")).toBeInTheDocument();
    for (const step of STEP_CONFIG) {
      expect(screen.getByText(step.label)).toBeInTheDocument();
    }
    expect(screen.getByText("step-identity")).toBeInTheDocument();
  });

  it("forwards step clicks to the parent (convention A rail)", () => {
    render(<PresentationModelWizard onCancel={() => {}} />);
    fireEvent.click(screen.getByText("Review"));
    expect(mockCtx.setCurrentStep).toHaveBeenCalledWith(5);
  });
});
