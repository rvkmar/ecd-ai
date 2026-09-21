// D112 — ItemWizard convention C onto the shared wizard shell.
//
// These tests would fail if Next gating, the named step-blocker banner,
// real completion ticks (vs cursor-position ticks), or the extra
// lifecycle transitions (reject / activate / suspend / reactivate /
// archive / clone) silently changed while moving Item onto
// `@/components/wizard`.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, fireEvent, within } from "@testing-library/react";
import toast from "react-hot-toast";

import { ITEM_WIZARD_STEPS, ITEM_WIZARD_STEP_KEYS } from "../../itemConstants";
import {
    canNavigateItemRail,
    itemLockedNotice,
    itemStatusLabel,
    itemStepBlockersCopy,
    itemStepIsComplete,
    itemWizardRailSteps,
} from "../itemWizardShellContract";
import { ITEM_WIZARD_RENDERED_STEP_KEYS } from "../WizardStepContainer";

vi.mock("react-hot-toast", () => ({
    default: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../steps/Step1Instantiation", () => ({
    default: () => <div>step-instantiation</div>,
}));
vi.mock("../steps/Step2Blueprint", () => ({ default: () => <div>step-blueprint</div> }));
vi.mock("../steps/Step3Stimulus", () => ({ default: () => <div>step-stimulus</div> }));
vi.mock("../steps/Step4Interaction", () => ({
    default: () => <div>step-interaction</div>,
}));
vi.mock("../steps/Step5Scoring", () => ({ default: () => <div>step-scoring</div> }));
vi.mock("../steps/Step6Metadata", () => ({ default: () => <div>step-metadata</div> }));
vi.mock("../steps/Step7Operations", () => ({
    default: () => <div>step-operations</div>,
}));
vi.mock("../steps/Step8Review", () => ({ default: () => <div>step-review</div> }));

let mockCtx;
vi.mock("../ItemWizardContext", () => ({
    useItemWizard: () => mockCtx,
}));

import ItemWizardSidebar from "../WizardSidebar";
import ItemWizardStepContainer from "../WizardStepContainer";

const here = dirname(fileURLToPath(import.meta.url));

describe("ItemWizard shared-shell imports", () => {
    it("adapters import @/components/wizard, not a private chrome fork", () => {
        const sidebar = readFileSync(join(here, "../WizardSidebar.jsx"), "utf8");
        const container = readFileSync(join(here, "../WizardStepContainer.jsx"), "utf8");
        const wizard = readFileSync(join(here, "../ItemWizard.jsx"), "utf8");
        expect(sidebar).toMatch(/from ["']@\/components\/wizard\/WizardSidebar["']/);
        expect(container).toMatch(
            /from ["']@\/components\/wizard\/WizardStepContainer["']/
        );
        expect(wizard).toMatch(/from ["']\.\/WizardSidebar["']/);
        expect(wizard).toMatch(/from ["']\.\/WizardStepContainer["']/);
        expect(wizard).not.toMatch(/STATUS_COLORS/);
        expect(wizard).not.toMatch(/<aside/);
    });
});

const INSTANTIATION_BLOCKERS = [
    {
        id: "taskModel",
        label: "Task Model is bound",
        detail: "Pick a Task Model before continuing.",
        ok: false,
        step: "instantiation",
    },
];

function makeCtx(overrides = {}) {
    return {
        item: { id: "it1", status: "draft", versionNumber: 1, locked: false },
        currentStep: 0,
        currentStepKey: "instantiation",
        steps: ITEM_WIZARD_STEPS,
        nextStep: vi.fn().mockResolvedValue(true),
        prevStep: vi.fn(),
        goToStep: vi.fn(),
        isStepValid: true,
        stepBlockers: [],
        stepCompletion: {
            instantiation: false,
            blueprint: false,
            stimulus: false,
            interaction: false,
            scoring: false,
            metadata: false,
            operations: false,
            review: false,
        },
        isDirty: false,
        saveDraft: vi.fn().mockResolvedValue({ success: true }),
        transitionLifecycle: vi.fn().mockResolvedValue({ success: true }),
        cloneItem: vi.fn().mockResolvedValue({ success: true }),
        canEdit: true,
        isLocked: false,
        canConfirm: false,
        canActivate: false,
        canSuspend: false,
        canReactivate: false,
        canArchive: false,
        canReject: false,
        canClone: false,
        isReady: false,
        blocking: [],
        ...overrides,
    };
}

describe("itemWizardShellContract", () => {
    it("keeps rail labels aligned with ITEM_WIZARD_STEPS (no raw-key fallback)", () => {
        expect(itemWizardRailSteps(ITEM_WIZARD_STEPS).map((s) => s.id)).toEqual(
            ITEM_WIZARD_STEP_KEYS
        );
        expect(itemWizardRailSteps(ITEM_WIZARD_STEPS).map((s) => s.label)).toEqual([
            "Instantiation",
            "Blueprint & Alignment",
            "Stimulus",
            "Interaction",
            "Scoring & Activation",
            "Domain & Metadata",
            "Psychometrics & Exposure",
            "Review & Confirm",
        ]);
        expect(ITEM_WIZARD_RENDERED_STEP_KEYS).toEqual(ITEM_WIZARD_STEP_KEYS);
    });

    it("gates the rail: current and earlier while editing, every step when locked", () => {
        expect(
            canNavigateItemRail(0, { isLocked: false, currentStep: 2 })
        ).toBe(true);
        expect(
            canNavigateItemRail(2, { isLocked: false, currentStep: 2 })
        ).toBe(true);
        expect(
            canNavigateItemRail(3, { isLocked: false, currentStep: 2 })
        ).toBe(false);
        expect(
            canNavigateItemRail(7, { isLocked: true, currentStep: 0 })
        ).toBe(true);
    });

    it("treats stepCompletion as the tick source, not cursor position", () => {
        const completion = { instantiation: true, blueprint: false, stimulus: true };
        expect(itemStepIsComplete("instantiation", completion)).toBe(true);
        expect(itemStepIsComplete("blueprint", completion)).toBe(false);
        expect(itemStepIsComplete("stimulus", completion)).toBe(true);
        expect(itemStepIsComplete("review", completion)).toBe(false);
    });

    it("joins named step blockers into the banner copy", () => {
        expect(itemStepBlockersCopy(INSTANTIATION_BLOCKERS)).toBe(
            "Task Model is bound — Pick a Task Model before continuing."
        );
        expect(
            itemStepBlockersCopy([
                { label: "A" },
                { label: "B", detail: "fix B" },
            ])
        ).toBe("A · B");
        expect(itemStepBlockersCopy([])).toBe("");
    });

    it("interpolates lifecycle status into the locked notice and status pill", () => {
        expect(itemLockedNotice("operational")).toMatch(
            /This item is operational and locked/
        );
        expect(itemLockedNotice("confirmed")).toMatch(
            /This item is confirmed and locked/
        );
        expect(itemStatusLabel("draft", 3)).toBe("draft · v3");
        expect(itemStatusLabel("draft")).toBe("draft");
    });
});

describe("ItemWizard sidebar adapter", () => {
    beforeEach(() => {
        mockCtx = makeCtx({
            currentStep: 2,
            currentStepKey: "stimulus",
            stepCompletion: {
                instantiation: true,
                blueprint: false,
                stimulus: false,
                interaction: false,
                scoring: false,
                metadata: false,
                operations: false,
                review: false,
            },
        });
    });

    it("ticks completed steps even when the cursor has walked past an incomplete one", () => {
        render(<ItemWizardSidebar />);
        const instantiation = screen.getByText("Instantiation").closest("button");
        const blueprint = screen.getByText("Blueprint & Alignment").closest("button");
        const stimulus = screen.getByText("Stimulus").closest("button");
        expect(
            instantiation.querySelector("[data-testid='wizard-step-complete-check']")
        ).not.toBeNull();
        expect(
            blueprint.querySelector("[data-testid='wizard-step-complete-check']")
        ).toBeNull();
        expect(blueprint).toHaveTextContent("2");
        expect(
            stimulus.querySelector("[data-testid='wizard-step-complete-check']")
        ).toBeNull();
        expect(screen.queryByTestId("wizard-outstanding-dot")).not.toBeInTheDocument();
        expect(screen.getByText("Item Wizard")).toBeInTheDocument();
        expect(screen.getByText("Item Layer")).toBeInTheDocument();
        expect(screen.getByText("draft · v1")).toBeInTheDocument();
    });

    it("does not fire goToStep for a forward rail jump while editing", () => {
        render(<ItemWizardSidebar />);
        fireEvent.click(screen.getByText("Review & Confirm"));
        expect(mockCtx.goToStep).not.toHaveBeenCalled();
        expect(screen.getByText("Review & Confirm").closest("button")).toBeDisabled();

        fireEvent.click(screen.getByText("Instantiation"));
        expect(mockCtx.goToStep).toHaveBeenCalledWith(0);
        fireEvent.click(screen.getByText("Stimulus"));
        expect(mockCtx.goToStep).toHaveBeenCalledWith(2);
    });

    it("opens every step on a locked item", () => {
        mockCtx = makeCtx({
            isLocked: true,
            currentStep: 0,
            item: { id: "it1", status: "operational", versionNumber: 2, locked: true },
        });
        render(<ItemWizardSidebar />);
        fireEvent.click(screen.getByText("Review & Confirm"));
        expect(mockCtx.goToStep).toHaveBeenCalledWith(7);
        expect(screen.queryByTestId("wizard-outstanding-dot")).not.toBeInTheDocument();
    });
});

describe("ItemWizard step-container adapter", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCtx = makeCtx();
    });

    it("disables Next and names the blockers in the banner (no toast)", () => {
        mockCtx = makeCtx({
            isStepValid: false,
            stepBlockers: INSTANTIATION_BLOCKERS,
        });
        render(<ItemWizardStepContainer onClose={() => {}} />);
        expect(screen.getByText("step-instantiation")).toBeInTheDocument();
        const next = screen.getByText("Next").closest("button");
        expect(next).toBeDisabled();
        expect(next).toHaveAttribute(
            "title",
            "Task Model is bound — Pick a Task Model before continuing."
        );
        expect(screen.getByTestId("wizard-step-blockers")).toHaveTextContent(
            "Task Model is bound — Pick a Task Model before continuing."
        );
        fireEvent.click(next);
        expect(next.closest("[data-wizard-block-wrap]")).toBeNull();
        expect(toast.error).not.toHaveBeenCalled();
        expect(mockCtx.nextStep).not.toHaveBeenCalled();
    });

    it("advances on Next when the current step is valid, and does not toast", async () => {
        render(<ItemWizardStepContainer onClose={() => {}} />);
        fireEvent.click(screen.getByText("Next"));
        await vi.waitFor(() => {
            expect(mockCtx.nextStep).toHaveBeenCalledTimes(1);
        });
        expect(toast.error).not.toHaveBeenCalled();
        expect(mockCtx.transitionLifecycle).not.toHaveBeenCalled();
        expect(screen.queryByText("Save for Review")).not.toBeInTheDocument();
        expect(screen.getByText("Close")).toBeInTheDocument();
    });

    it("does not show Save for Review or Lock & Confirm on the last step", () => {
        mockCtx = makeCtx({
            currentStep: 7,
            currentStepKey: "review",
            isStepValid: true,
        });
        render(<ItemWizardStepContainer onClose={() => {}} />);
        expect(screen.getByText("step-review")).toBeInTheDocument();
        expect(screen.queryByText("Next")).not.toBeInTheDocument();
        expect(screen.queryByText("Save for Review")).not.toBeInTheDocument();
        expect(screen.queryByText("Lock & Confirm")).not.toBeInTheDocument();
        expect(screen.queryByText("Return to draft")).not.toBeInTheDocument();
    });

    it("Review & confirm jumps to the last step rather than confirming", () => {
        mockCtx = makeCtx({
            canConfirm: true,
            item: { id: "it1", status: "reviewed", versionNumber: 1, locked: false },
        });
        render(<ItemWizardStepContainer onClose={() => {}} />);
        fireEvent.click(screen.getByText("Review & confirm"));
        expect(mockCtx.goToStep).toHaveBeenCalledWith(ITEM_WIZARD_STEPS.length - 1);
        expect(mockCtx.transitionLifecycle).not.toHaveBeenCalled();
    });

    it("Send back to draft transitions to draft", async () => {
        mockCtx = makeCtx({
            canReject: true,
            item: { id: "it1", status: "reviewed", versionNumber: 1, locked: false },
        });
        render(<ItemWizardStepContainer onClose={() => {}} />);
        fireEvent.click(screen.getByText("Send back to draft"));
        await vi.waitFor(() => {
            expect(mockCtx.transitionLifecycle).toHaveBeenCalledWith("draft", {
                force: false,
            });
        });
    });

    it("Activate transitions to operational without a confirm modal", async () => {
        mockCtx = makeCtx({
            canActivate: true,
            canEdit: false,
            isLocked: true,
            item: { id: "it1", status: "confirmed", versionNumber: 1, locked: true },
        });
        render(<ItemWizardStepContainer onClose={() => {}} />);
        fireEvent.click(screen.getByText("Activate"));
        await vi.waitFor(() => {
            expect(mockCtx.transitionLifecycle).toHaveBeenCalledWith("operational", {
                force: false,
            });
        });
        expect(screen.queryByText("Suspend this item?")).not.toBeInTheDocument();
    });

    it("Suspend asks for confirmation, then transitions", async () => {
        mockCtx = makeCtx({
            canSuspend: true,
            canArchive: true,
            canClone: true,
            canEdit: false,
            isLocked: true,
            item: { id: "it1", status: "operational", versionNumber: 1, locked: true },
        });
        render(<ItemWizardStepContainer onClose={() => {}} />);
        fireEvent.click(screen.getByText("Suspend"));
        expect(screen.getByText("Suspend this item?")).toBeInTheDocument();
        expect(mockCtx.transitionLifecycle).not.toHaveBeenCalled();
        fireEvent.click(
            within(screen.getByRole("dialog")).getByRole("button", {
                name: "Suspend",
            })
        );
        await vi.waitFor(() => {
            expect(mockCtx.transitionLifecycle).toHaveBeenCalledWith("suspended", {
                force: false,
            });
        });
    });

    it("Archive asks for confirmation, then transitions", async () => {
        mockCtx = makeCtx({
            canArchive: true,
            canClone: true,
            canEdit: false,
            isLocked: true,
            item: { id: "it1", status: "operational", versionNumber: 1, locked: true },
        });
        render(<ItemWizardStepContainer onClose={() => {}} />);
        fireEvent.click(screen.getByText("Archive"));
        expect(screen.getByText("Archive this item?")).toBeInTheDocument();
        fireEvent.click(
            within(screen.getByRole("dialog")).getByRole("button", {
                name: "Archive",
            })
        );
        await vi.waitFor(() => {
            expect(mockCtx.transitionLifecycle).toHaveBeenCalledWith("archived", {
                force: false,
            });
        });
    });

    it("Reactivate transitions to operational", async () => {
        mockCtx = makeCtx({
            canReactivate: true,
            canArchive: true,
            canClone: true,
            canEdit: false,
            isLocked: true,
            item: { id: "it1", status: "suspended", versionNumber: 1, locked: true },
        });
        render(<ItemWizardStepContainer onClose={() => {}} />);
        fireEvent.click(screen.getByText("Reactivate"));
        await vi.waitFor(() => {
            expect(mockCtx.transitionLifecycle).toHaveBeenCalledWith("operational", {
                force: false,
            });
        });
    });

    it("Clone calls cloneItem and does not change status", async () => {
        mockCtx = makeCtx({
            canClone: true,
            canEdit: false,
            isLocked: true,
            item: { id: "it1", status: "confirmed", versionNumber: 1, locked: true },
        });
        render(<ItemWizardStepContainer onClose={() => {}} />);
        fireEvent.click(screen.getByText("Clone"));
        await vi.waitFor(() => {
            expect(mockCtx.cloneItem).toHaveBeenCalledTimes(1);
        });
        expect(mockCtx.transitionLifecycle).not.toHaveBeenCalled();
    });

    it("saves a dirty editable item before a lifecycle transition", async () => {
        mockCtx = makeCtx({
            canReject: true,
            isDirty: true,
            canEdit: true,
            item: { id: "it1", status: "reviewed", versionNumber: 1, locked: false },
        });
        render(<ItemWizardStepContainer onClose={() => {}} />);
        fireEvent.click(screen.getByText("Send back to draft"));
        await vi.waitFor(() => {
            expect(mockCtx.saveDraft).toHaveBeenCalledTimes(1);
            expect(mockCtx.transitionLifecycle).toHaveBeenCalledWith("draft", {
                force: false,
            });
        });
    });

    it("shows the status-aware locked notice, not the confirmed-and-locked default", () => {
        mockCtx = makeCtx({
            isLocked: true,
            canEdit: false,
            editable: false,
            item: { id: "it1", status: "operational", versionNumber: 2, locked: true },
        });
        render(<ItemWizardStepContainer onClose={() => {}} />);
        expect(
            screen.getByText(/This item is operational and locked/)
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/This Item is confirmed and locked/)
        ).not.toBeInTheDocument();
    });

    it("does not gate Next on a locked item even when the step would fail if edited", () => {
        mockCtx = makeCtx({
            isLocked: true,
            canEdit: false,
            isStepValid: true,
            stepBlockers: INSTANTIATION_BLOCKERS,
            item: { id: "it1", status: "confirmed", versionNumber: 1, locked: true },
        });
        render(<ItemWizardStepContainer onClose={() => {}} />);
        expect(screen.getByText("Next").closest("button")).not.toBeDisabled();
        expect(screen.queryByTestId("wizard-step-blockers")).not.toBeInTheDocument();
    });
});
