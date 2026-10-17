// Off-calendar — Design Pattern authoring on the shared wizard shell.
// Convention C: real completion ticks, named confirm-blocker banner,
// hidePromoteActions + toolbar Save/Confirm, editable so a confirmed
// pattern stays editable. The rail does not gate. Not D146.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DesignPatternLibraryView } from "../DesignPatternBuilder.jsx";
import {
  DESIGN_PATTERN_WIZARD_STEPS,
  DESIGN_PATTERN_WIZARD_STEP_IDS,
  canNavigateDesignPatternRail,
  designPatternBlockersCopy,
  designPatternStepComplete,
} from "../designPatternWizardContract.js";
import { openDesignPatternStep } from "./openDesignPatternStep.js";

const here = dirname(fileURLToPath(import.meta.url));

const RATIONALE_BLOCK =
  "Design pattern rationale is required. An empty rationale is not a pattern.";

describe("Design Pattern shared-shell imports", () => {
  it("uses @/components/wizard convention C and does not fork the chrome", () => {
    const source = readFileSync(join(here, "../DesignPatternBuilder.jsx"), "utf8");
    expect(source).toMatch(/from ["']@\/components\/wizard\/WizardSidebar["']/);
    expect(source).toMatch(/from ["']@\/components\/wizard\/WizardStepContainer["']/);
    expect(source).toMatch(/hidePromoteActions/);
    expect(source).toMatch(/toolbarActions/);
    expect(source).toMatch(/editable/);
    expect(source).not.toMatch(/STATUS_COLORS/);
    expect(source).not.toMatch(/Save for Review/);
    expect(source).not.toMatch(/Lock & Confirm/);
  });
});

describe("designPatternWizardContract", () => {
  it("names the nine steps in authoring order", () => {
    expect(DESIGN_PATTERN_WIZARD_STEPS.map((step) => step.label)).toEqual([
      "Identity",
      "Rationale",
      "Focal KSAs",
      "Additional KSAs",
      "Potential observations",
      "Work products & rubrics",
      "Characteristic & variable features",
      "Relations (kind-of) & references",
      "Review & confirm",
    ]);
    expect(DESIGN_PATTERN_WIZARD_STEP_IDS).toEqual([
      "identity",
      "rationale",
      "focalKsas",
      "additionalKsas",
      "observations",
      "workProducts",
      "features",
      "relations",
      "review",
    ]);
  });

  it("lets every step be opened from the first step", () => {
    for (let index = 0; index < DESIGN_PATTERN_WIZARD_STEPS.length; index += 1) {
      expect(canNavigateDesignPatternRail(index)).toBe(true);
    }
    expect(canNavigateDesignPatternRail(-1)).toBe(false);
    expect(canNavigateDesignPatternRail(DESIGN_PATTERN_WIZARD_STEPS.length)).toBe(false);
  });

  it("ticks filled steps and leaves an empty earlier step unticked", () => {
    const form = {
      name: "Explain a diagram",
      summary: "Students explain a diagram.",
      rationale: "",
      focalKsas: [{ label: "Model-based explanation" }],
      additionalKsas: [],
      potentialObservations: [],
      potentialWorkProducts: [],
      potentialRubrics: [{ label: "Explanation rubric", rubricId: "rb1" }],
      characteristicFeatures: [],
      variableFeatures: [],
      relationships: [],
      references: [{ label: "PADI", url: "" }],
    };
    expect(designPatternStepComplete("identity", form)).toBe(true);
    expect(designPatternStepComplete("identity", { ...form, summary: "" })).toBe(false);
    expect(designPatternStepComplete("rationale", form)).toBe(false);
    expect(designPatternStepComplete("focalKsas", form)).toBe(true);
    expect(designPatternStepComplete("additionalKsas", form)).toBe(false);
    expect(designPatternStepComplete("observations", form)).toBe(false);
    expect(designPatternStepComplete("workProducts", form)).toBe(true);
    expect(designPatternStepComplete("features", form)).toBe(false);
    expect(designPatternStepComplete("relations", form)).toBe(true);
    expect(designPatternStepComplete("review", form, { confirmReady: false })).toBe(false);
    expect(designPatternStepComplete("review", form, { confirmReady: true })).toBe(true);
  });

  it("keeps the readiness sentences as the blocker banner", () => {
    expect(designPatternBlockersCopy([])).toBe("");
    expect(designPatternBlockersCopy([RATIONALE_BLOCK])).toBe(RATIONALE_BLOCK);
    expect(designPatternBlockersCopy(["Name is required.", RATIONALE_BLOCK])).toBe(
      `Name is required. ${RATIONALE_BLOCK}`
    );
  });
});

describe("Design Pattern wizard shell", () => {
  const pattern = {
    id: "dp1",
    name: "Explain a diagram",
    status: "confirmed",
    summary: "Students explain a diagram.",
    rationale: "",
    focalKsas: [],
    additionalKsas: [],
  };

  function renderPattern() {
    render(
      <DesignPatternLibraryView
        patterns={[pattern]}
        onCreate={() => {}}
        onUpdate={() => {}}
        onConfirm={() => {}}
        onDelete={() => {}}
      />
    );
  }

  it("ticks a finished identity step and does not tick an empty rationale after a forward jump", async () => {
    const user = userEvent.setup({ delay: null });
    renderPattern();
    await user.click(screen.getByRole("button", { name: "Edit" }));

    const rail = () => screen.getByRole("navigation", { name: "Wizard steps" });
    const identity = within(rail()).getByRole("button", { name: /Identity/ });
    expect(identity.querySelector("[data-testid='wizard-step-complete-check']")).not.toBeNull();

    const observations = within(rail()).getByRole("button", { name: /Potential observations/ });
    expect(observations).toBeEnabled();
    await openDesignPatternStep(user, "Potential observations");

    expect(
      within(rail()).getByRole("button", { name: /Identity/ }).querySelector(
        "[data-testid='wizard-step-complete-check']"
      )
    ).not.toBeNull();
    const rationale = within(rail()).getByRole("button", { name: /Rationale/ });
    expect(rationale.querySelector("[data-testid='wizard-step-complete-check']")).toBeNull();
    expect(rationale).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: "Add Potential Observations" })).toBeInTheDocument();
  });

  it("hides shell promote actions, keeps Confirm wording, and leaves a confirmed pattern editable", async () => {
    const user = userEvent.setup({ delay: null });
    renderPattern();
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.queryByRole("button", { name: "Save for Review" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lock & Confirm" })).not.toBeInTheDocument();
    expect(screen.queryByText(/confirmed and locked/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    expect(screen.getByTestId("wizard-step-blockers")).toHaveTextContent(RATIONALE_BLOCK);
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

    const title = screen.getByLabelText("Title");
    expect(title).toBeEnabled();
    await user.type(title, " revised");
    expect(title).toHaveValue("Explain a diagram revised");
  });
});
