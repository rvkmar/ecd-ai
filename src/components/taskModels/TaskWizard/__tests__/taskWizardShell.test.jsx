// D111 — TaskWizard convention B onto the shared wizard shell.
//
// These tests would fail if readiness amber-dots, Next-only forward rail
// gating, named blocking-reason toasts, or the promote/save paths silently
// changed while moving TM onto `@/components/wizard`.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, fireEvent } from "@testing-library/react";
import toast from "react-hot-toast";

import {
    TASK_MODEL_STEP_LABELS,
    TASK_MODEL_STEP_READINESS_KEYS,
    canNavigateTaskModelRail,
    taskModelBlockingReason,
    taskModelLockedNotice,
    taskModelRailSteps,
    taskModelStepHasOutstandingWork,
} from "../taskWizardShellContract";
import { STEPS } from "../TaskModelWizardContext";

vi.mock("react-hot-toast", () => ({
    default: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../steps/Step1Identity", () => ({ default: () => <div>step-identity</div> }));
vi.mock("../steps/Step2EvidenceBinding", () => ({ default: () => <div>step-evidence</div> }));
vi.mock("../steps/Step3Observables", () => ({ default: () => <div>step-observables</div> }));
vi.mock("../steps/Step4TaskStructure", () => ({ default: () => <div>step-structure</div> }));
vi.mock("../steps/Step5Blueprint", () => ({ default: () => <div>step-blueprint</div> }));
vi.mock("../steps/StepVariables", () => ({ default: () => <div>step-variables</div> }));
vi.mock("../steps/Step6ItemMapping", () => ({ default: () => <div>step-itemMapping</div> }));
vi.mock("../steps/Step7Fairness", () => ({ default: () => <div>step-fairness</div> }));
vi.mock("../steps/Step8Review", () => ({ default: () => <div>step-review</div> }));

let mockCtx;
vi.mock("../TaskModelWizardContext", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useTaskModelWizard: () => mockCtx,
    };
});

import TaskModelWizardSidebar from "../WizardSidebar";
import TaskModelWizardStepContainer from "../WizardStepContainer";

const here = dirname(fileURLToPath(import.meta.url));

describe("TaskWizard shared-shell imports", () => {
    it("adapters import @/components/wizard, not a private chrome fork", () => {
        const sidebar = readFileSync(join(here, "../WizardSidebar.jsx"), "utf8");
        const container = readFileSync(join(here, "../WizardStepContainer.jsx"), "utf8");
        const wizard = readFileSync(join(here, "../TaskModelWizard.jsx"), "utf8");
        expect(sidebar).toMatch(/from ["']@\/components\/wizard\/WizardSidebar["']/);
        expect(container).toMatch(
            /from ["']@\/components\/wizard\/WizardStepContainer["']/
        );
        expect(wizard).toMatch(/from ["']\.\/WizardSidebar["']/);
        expect(wizard).toMatch(/from ["']\.\/WizardStepContainer["']/);
        expect(sidebar).not.toMatch(/useTaskModelWizard\(\).*STATUS_COLORS/s);
    });
});

const INCOMPLETE_CHECKS = [
    {
        key: "identity",
        label: "Identity complete",
        detail: "Name and description are both present.",
        valid: false,
    },
    {
        key: "evidence",
        label: "Evidence models bound",
        detail: "At least one linkable Evidence Model, with one nominated primary.",
        valid: false,
    },
    {
        key: "observables",
        label: "Observables targeted",
        detail: "At least one observable, at least one marked required.",
        valid: true,
    },
    {
        key: "weights",
        label: "Observable weights normalized",
        detail: "Weights allocate exactly 1.0 across the targeted observables, and none sits at zero.",
        valid: true,
    },
    {
        key: "structure",
        label: "Task structure specified",
        detail: "Composition type, presentation mode, and response format are set.",
        valid: false,
    },
    {
        key: "blueprint",
        label: "Blueprint constraints set",
        detail: "Difficulty range and allowed interaction types are set.",
        valid: false,
    },
];

function makeCtx(overrides = {}) {
    return {
        STEPS,
        currentStep: 0,
        setCurrentStep: vi.fn(),
        lifecycleStatus: "draft",
        isEditable: true,
        isReviewMode: false,
        readiness: { checks: INCOMPLETE_CHECKS, isComplete: false },
        draft: { locked: false },
        setDraft: vi.fn(),
        canGoNext: false,
        goNext: vi.fn(),
        goBack: vi.fn(),
        linkableEvidenceModels: [],
        items: [],
        observationLookup: {},
        isDirty: false,
        isStructurallyComplete: false,
        handleSaveDraft: vi.fn().mockResolvedValue({ id: "tm1" }),
        handlePromote: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

describe("taskWizardShellContract", () => {
    it("keeps rail labels aligned with STEPS keys (no raw-key fallback)", () => {
        expect(STEPS.every((key) => TASK_MODEL_STEP_LABELS[key])).toBe(true);
        expect(taskModelRailSteps(STEPS).map((s) => s.label)).toEqual([
            "Task Identity",
            "Evidence Binding",
            "Observable Targeting",
            "Task Structure",
            "Blueprint Constraints",
            "Task Model Variables",
            "Item Mapping",
            "Fairness & Accessibility",
            "Review & Lifecycle",
        ]);
    });

    it("never flags advisory steps (variables, itemMapping, fairness, review) as outstanding", () => {
        expect(TASK_MODEL_STEP_READINESS_KEYS.variables).toBeUndefined();
        expect(TASK_MODEL_STEP_READINESS_KEYS.itemMapping).toBeUndefined();
        expect(TASK_MODEL_STEP_READINESS_KEYS.fairness).toBeUndefined();
        expect(TASK_MODEL_STEP_READINESS_KEYS.review).toBeUndefined();
        expect(
            taskModelStepHasOutstandingWork(
                "itemMapping",
                { checks: INCOMPLETE_CHECKS },
                true
            )
        ).toBe(false);
        expect(
            taskModelStepHasOutstandingWork(
                "variables",
                { checks: INCOMPLETE_CHECKS },
                true
            )
        ).toBe(false);
    });

    it("flags observables when either observables or weights fail", () => {
        expect(
            taskModelStepHasOutstandingWork("observables", { checks: INCOMPLETE_CHECKS }, true)
        ).toBe(false);
        const weightsFail = INCOMPLETE_CHECKS.map((c) =>
            c.key === "weights" ? { ...c, valid: false } : c
        );
        expect(
            taskModelStepHasOutstandingWork("observables", { checks: weightsFail }, true)
        ).toBe(true);
    });

    it("suppresses outstanding-work flags when the model is not editable", () => {
        expect(
            taskModelStepHasOutstandingWork("identity", { checks: INCOMPLETE_CHECKS }, false)
        ).toBe(false);
    });

    it("gates the rail forward-only-via-Next while editing, and opens every step when read-only", () => {
        expect(canNavigateTaskModelRail(0, { isEditable: true, currentStep: 2 })).toBe(true);
        expect(canNavigateTaskModelRail(2, { isEditable: true, currentStep: 2 })).toBe(false);
        expect(canNavigateTaskModelRail(3, { isEditable: true, currentStep: 2 })).toBe(false);
        expect(canNavigateTaskModelRail(7, { isEditable: false, currentStep: 0 })).toBe(true);
    });

    it("names the first failing readiness check as the blocking reason", () => {
        expect(taskModelBlockingReason({ checks: INCOMPLETE_CHECKS })).toBe(
            "Name and description are both present."
        );
        expect(taskModelBlockingReason({ checks: [] })).toBe(
            "Resolve required fields before proceeding."
        );
    });

    it("interpolates lifecycle status into the locked notice (not always 'confirmed')", () => {
        expect(taskModelLockedNotice("operational")).toMatch(/is operational and no longer editable/);
        expect(taskModelLockedNotice("confirmed")).toMatch(/is confirmed and no longer editable/);
    });
});

describe("TaskWizard sidebar adapter", () => {
    beforeEach(() => {
        mockCtx = makeCtx({ currentStep: 2 });
    });

    it("imports the shared shell via convention B props (Next-only forward gating)", () => {
        render(<TaskModelWizardSidebar />);
        fireEvent.click(screen.getByText("Blueprint Constraints"));
        expect(mockCtx.setCurrentStep).not.toHaveBeenCalled();
        expect(screen.getByText("Blueprint Constraints").closest("button")).toBeDisabled();

        fireEvent.click(screen.getByText("Task Identity"));
        expect(mockCtx.setCurrentStep).toHaveBeenCalledWith(0);
    });

    it("shows amber outstanding-work dots on incomplete authoring steps", () => {
        render(<TaskModelWizardSidebar />);
        const dots = screen.getAllByTestId("wizard-outstanding-dot");
        // identity, evidence, structure, blueprint — not observables (valid here)
        expect(dots).toHaveLength(4);
        expect(screen.getByText("Task Identity").parentElement).toContainElement(
            screen.getAllByTestId("wizard-outstanding-dot")[0]
        );
        expect(
            screen.getByText("Observable Targeting").parentElement.querySelector(
                "[data-testid='wizard-outstanding-dot']"
            )
        ).toBeNull();
        expect(screen.getByText("Task Model Wizard")).toBeInTheDocument();
        expect(screen.getByText("Task Layer")).toBeInTheDocument();
    });

    it("does not show outstanding-work dots on a read-only model", () => {
        mockCtx = makeCtx({ isEditable: false, lifecycleStatus: "confirmed" });
        render(<TaskModelWizardSidebar />);
        expect(screen.queryByTestId("wizard-outstanding-dot")).not.toBeInTheDocument();
        fireEvent.click(screen.getByText("Review & Lifecycle"));
        expect(mockCtx.setCurrentStep).toHaveBeenCalledWith(8);
    });
});

describe("TaskWizard step-container adapter", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCtx = makeCtx();
    });

    it("puts the named blocking reason on disabled Next and toasts it when invoked", () => {
        render(<TaskModelWizardStepContainer onCancel={() => {}} />);
        expect(screen.getByText("step-identity")).toBeInTheDocument();
        const next = screen.getByText("Next").closest("button");
        expect(next).toBeDisabled();
        expect(next).toHaveAttribute(
            "title",
            "Name and description are both present."
        );
        fireEvent.click(next.closest("[data-wizard-block-wrap]"));
        expect(toast.error).toHaveBeenCalledWith(
            "Name and description are both present."
        );
        expect(mockCtx.goNext).not.toHaveBeenCalled();
        expect(mockCtx.handleSaveDraft).not.toHaveBeenCalled();
    });

    it("saves then advances on Next after step 1, and does not save on step 1", async () => {
        mockCtx = makeCtx({
            currentStep: 0,
            canGoNext: true,
        });
        const { unmount } = render(<TaskModelWizardStepContainer onCancel={() => {}} />);
        fireEvent.click(screen.getByText("Next"));
        await vi.waitFor(() => {
            expect(mockCtx.goNext).toHaveBeenCalledTimes(1);
        });
        expect(mockCtx.handleSaveDraft).not.toHaveBeenCalled();
        unmount();

        mockCtx = makeCtx({
            currentStep: 5,
            canGoNext: true,
        });
        render(<TaskModelWizardStepContainer onCancel={() => {}} />);
        fireEvent.click(screen.getByText("Next"));
        await vi.waitFor(() => {
            expect(mockCtx.handleSaveDraft).toHaveBeenCalledTimes(1);
        });
        expect(mockCtx.goNext).toHaveBeenCalledTimes(1);
        expect(mockCtx.handlePromote).not.toHaveBeenCalled();
    });

    it("Save for Review promotes to reviewed, not confirmed", async () => {
        mockCtx = makeCtx({
            currentStep: 8,
            isStructurallyComplete: true,
            canGoNext: true,
        });
        render(<TaskModelWizardStepContainer onCancel={() => {}} />);
        fireEvent.click(screen.getByText("Save for Review"));
        await vi.waitFor(() => {
            expect(mockCtx.handlePromote).toHaveBeenCalledWith("reviewed");
        });
        expect(mockCtx.handlePromote).not.toHaveBeenCalledWith("confirmed");
        expect(mockCtx.handlePromote).not.toHaveBeenCalledWith("draft");
    });

    it("Lock & Confirm promotes to confirmed", async () => {
        mockCtx = makeCtx({
            currentStep: 8,
            lifecycleStatus: "reviewed",
            isEditable: true,
            isReviewMode: true,
            isStructurallyComplete: true,
            isDirty: false,
        });
        render(<TaskModelWizardStepContainer onCancel={() => {}} />);
        fireEvent.click(screen.getByText("Lock & Confirm"));
        await vi.waitFor(() => {
            expect(mockCtx.handlePromote).toHaveBeenCalledWith("confirmed");
        });
        expect(mockCtx.handlePromote).not.toHaveBeenCalledWith("draft");
        expect(mockCtx.handlePromote).not.toHaveBeenCalledWith("reviewed");
    });

    it("Return to draft promotes to draft without a completeness gate", async () => {
        mockCtx = makeCtx({
            currentStep: 8,
            lifecycleStatus: "reviewed",
            isEditable: true,
            isReviewMode: true,
            isStructurallyComplete: true,
            isDirty: false,
        });
        render(<TaskModelWizardStepContainer onCancel={() => {}} />);
        fireEvent.click(screen.getByText("Return to draft"));
        await vi.waitFor(() => {
            expect(mockCtx.handlePromote).toHaveBeenCalledWith("draft");
        });
        expect(mockCtx.handleSaveDraft).not.toHaveBeenCalled();
    });

    it("Return to draft still persists a dirty incomplete model (reviewer rejection)", async () => {
        mockCtx = makeCtx({
            currentStep: 8,
            lifecycleStatus: "reviewed",
            isEditable: true,
            isReviewMode: true,
            isStructurallyComplete: false,
            isDirty: true,
        });
        render(<TaskModelWizardStepContainer onCancel={() => {}} />);
        expect(screen.getByText("Return to draft")).not.toBeDisabled();
        fireEvent.click(screen.getByText("Return to draft"));
        await vi.waitFor(() => {
            expect(mockCtx.handlePromote).toHaveBeenCalledWith("draft");
        });
        expect(mockCtx.handleSaveDraft).toHaveBeenCalledTimes(1);
    });

    it("shows the status-aware locked notice, not the confirmed-and-locked default", () => {
        mockCtx = makeCtx({
            lifecycleStatus: "operational",
            isEditable: false,
            currentStep: 0,
        });
        render(<TaskModelWizardStepContainer onCancel={() => {}} />);
        expect(
            screen.getByText(/This Task Model is operational and no longer editable/)
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/This Task Model is confirmed and locked/)
        ).not.toBeInTheDocument();
    });
});
