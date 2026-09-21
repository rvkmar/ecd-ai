// Day 44 + D111 + D112 — shared wizard shell tests.
//
// Convention A (CM/EM): unconditional step-click callback with 0-based
// indices, adaptive Cancel/OK, model-specific locked-notice text, and
// the Next/Save/Lock&Confirm button-gating rules. Completion ticks follow
// the cursor.
//
// Convention B (Task Model, D111): canNavigateTo rail gating, outstanding
// work amber-dots, named blockingReason title + toastOnBlock, status-aware
// lockedNotice, and Save vs Confirm promote paths staying distinct.
//
// Convention C (Item, D112): isStepComplete ticks (not cursor), named
// blockersBanner, hidePromoteActions + toolbarActions, cancelLabel,
// optional editable override. Does not toast on a gated Next.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import toast from "react-hot-toast";
import WizardSidebar from "../WizardSidebar";
import WizardStepContainer from "../WizardStepContainer";

vi.mock("react-hot-toast", () => ({
    default: { error: vi.fn(), success: vi.fn() },
}));

const STEPS = [
    { id: 1, label: "Identity" },
    { id: 2, label: "Details" },
    { id: 3, label: "Review" },
];

describe("shared WizardSidebar", () => {
    it("calls onStepClick with the 0-based index for the clicked step", () => {
        const onStepClick = vi.fn();
        render(
            <WizardSidebar
                steps={STEPS}
                currentStepIndex={0}
                onStepClick={onStepClick}
                status="draft"
                title="Test Wizard"
                brandInitial="T"
                footerLabel="Test Layer"
            />
        );
        fireEvent.click(screen.getByText("Review"));
        expect(onStepClick).toHaveBeenCalledWith(2);
    });

    it("renders the branding passed in by the caller, not a hardcoded name", () => {
        render(
            <WizardSidebar
                steps={STEPS}
                currentStepIndex={0}
                onStepClick={() => {}}
                status="draft"
                title="Evidence Model Wizard"
                brandInitial="E"
                footerLabel="Evidence Layer"
            />
        );
        expect(screen.getByText("Evidence Model Wizard")).toBeInTheDocument();
        expect(screen.getByText("Evidence Layer")).toBeInTheDocument();
    });

    it("does not gate step clicks itself -- locked models stay navigable", () => {
        const onStepClick = vi.fn();
        render(
            <WizardSidebar
                steps={STEPS}
                currentStepIndex={0}
                onStepClick={onStepClick}
                locked
                status="confirmed"
                title="Test Wizard"
                brandInitial="T"
                footerLabel="Test Layer"
            />
        );
        fireEvent.click(screen.getByText("Review"));
        expect(onStepClick).toHaveBeenCalledWith(2);
    });

    it("does not fire onStepClick for a rail step canNavigateTo rejects (convention B)", () => {
        const onStepClick = vi.fn();
        render(
            <WizardSidebar
                steps={STEPS}
                currentStepIndex={0}
                onStepClick={onStepClick}
                canNavigateTo={(index) => index < 0}
                status="draft"
                title="Task Model Wizard"
                brandInitial="T"
                footerLabel="Task Layer"
            />
        );
        fireEvent.click(screen.getByText("Review"));
        expect(onStepClick).not.toHaveBeenCalled();
        expect(screen.getByText("Review").closest("button")).toBeDisabled();
    });

    it("fires onStepClick for a past step when canNavigateTo allows backward-only travel", () => {
        const onStepClick = vi.fn();
        render(
            <WizardSidebar
                steps={STEPS}
                currentStepIndex={2}
                onStepClick={onStepClick}
                canNavigateTo={(index) => index < 2}
                status="draft"
                title="Task Model Wizard"
                brandInitial="T"
                footerLabel="Task Layer"
            />
        );
        fireEvent.click(screen.getByText("Identity"));
        expect(onStepClick).toHaveBeenCalledWith(0);
    });

    it("renders an amber outstanding-work dot only on steps outstandingWork flags", () => {
        render(
            <WizardSidebar
                steps={STEPS}
                currentStepIndex={0}
                onStepClick={() => {}}
                outstandingWork={(step) => step.id === 2}
                status="draft"
                title="Task Model Wizard"
                brandInitial="T"
                footerLabel="Task Layer"
            />
        );
        const dots = screen.getAllByTestId("wizard-outstanding-dot");
        expect(dots).toHaveLength(1);
        expect(dots[0]).toHaveAttribute(
            "title",
            "This step has outstanding required fields"
        );
        expect(screen.getByText("Details").parentElement).toContainElement(dots[0]);
        expect(screen.getByText("Identity").parentElement).not.toContainElement(
            dots[0]
        );
    });

    it("ticks past steps from cursor position when isStepComplete is omitted (convention A)", () => {
        render(
            <WizardSidebar
                steps={STEPS}
                currentStepIndex={2}
                onStepClick={() => {}}
                status="draft"
                title="Test Wizard"
                brandInitial="T"
                footerLabel="Test Layer"
            />
        );
        const identity = screen.getByText("Identity").closest("button");
        const details = screen.getByText("Details").closest("button");
        const review = screen.getByText("Review").closest("button");
        expect(
            identity.querySelector("[data-testid='wizard-step-complete-check']")
        ).not.toBeNull();
        expect(
            details.querySelector("[data-testid='wizard-step-complete-check']")
        ).not.toBeNull();
        expect(
            review.querySelector("[data-testid='wizard-step-complete-check']")
        ).toBeNull();
        expect(review).toHaveTextContent("3");
    });

    it("ticks from isStepComplete, not cursor position (convention C)", () => {
        render(
            <WizardSidebar
                steps={STEPS}
                currentStepIndex={2}
                onStepClick={() => {}}
                isStepComplete={(step) => step.id === 1}
                status="draft"
                title="Item Wizard"
                brandInitial="I"
                footerLabel="Item Layer"
            />
        );
        const identity = screen.getByText("Identity").closest("button");
        const details = screen.getByText("Details").closest("button");
        const review = screen.getByText("Review").closest("button");
        expect(
            identity.querySelector("[data-testid='wizard-step-complete-check']")
        ).not.toBeNull();
        expect(
            details.querySelector("[data-testid='wizard-step-complete-check']")
        ).toBeNull();
        expect(details).toHaveTextContent("2");
        expect(
            review.querySelector("[data-testid='wizard-step-complete-check']")
        ).toBeNull();
    });

    it("renders an active-step blurb and statusLabel when provided (convention C)", () => {
        render(
            <WizardSidebar
                steps={[
                    { id: "instantiation", label: "Instantiation", blurb: "Bind a Task Model." },
                    { id: "review", label: "Review" },
                ]}
                currentStepIndex={0}
                onStepClick={() => {}}
                status="draft"
                statusLabel="draft · v2"
                title="Item Wizard"
                brandInitial="I"
                footerLabel="Item Layer"
            />
        );
        expect(screen.getByText("Bind a Task Model.")).toBeInTheDocument();
        expect(screen.getByText("draft · v2")).toBeInTheDocument();
        expect(screen.queryByText(/^draft$/)).not.toBeInTheDocument();
    });
});

describe("shared WizardStepContainer", () => {
    const baseProps = {
        step: 1,
        totalSteps: 3,
        onNext: vi.fn(),
        onBack: vi.fn(),
        onCancel: vi.fn(),
        canProceed: true,
        isLast: false,
        locked: false,
        status: "draft",
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("always shows Cancel + icon when adaptiveCancelLabel is not set (Competency behavior)", () => {
        render(
            <WizardStepContainer {...baseProps} locked status="confirmed">
                <div>content</div>
            </WizardStepContainer>
        );
        expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    it("swaps Cancel for a bare OK once read-only when adaptiveCancelLabel is set (Evidence behavior)", () => {
        render(
            <WizardStepContainer {...baseProps} locked status="confirmed" adaptiveCancelLabel>
                <div>content</div>
            </WizardStepContainer>
        );
        expect(screen.getByText("OK")).toBeInTheDocument();
        expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
    });

    it("names the model type in the locked notice via modelLabel", () => {
        render(
            <WizardStepContainer {...baseProps} locked status="confirmed" modelLabel="Evidence Model">
                <div>content</div>
            </WizardStepContainer>
        );
        expect(
            screen.getByText(/This Evidence Model is confirmed and locked\./)
        ).toBeInTheDocument();
    });

    it("disables Next while editing when canProceed is false", () => {
        render(
            <WizardStepContainer {...baseProps} canProceed={false}>
                <div>content</div>
            </WizardStepContainer>
        );
        expect(screen.getByText("Next").closest("button")).toBeDisabled();
    });

    it("does not gate Next on canProceed once the model is locked", () => {
        render(
            <WizardStepContainer {...baseProps} canProceed={false} locked status="confirmed">
                <div>content</div>
            </WizardStepContainer>
        );
        expect(screen.getByText("Next").closest("button")).not.toBeDisabled();
    });

    it("shows Save for Review only on the last step while still a draft", () => {
        render(
            <WizardStepContainer {...baseProps} isLast status="draft">
                <div>content</div>
            </WizardStepContainer>
        );
        expect(screen.getByText("Save for Review")).toBeInTheDocument();
    });

    it("shows Lock & Confirm and Return to draft on the last step in review mode", () => {
        render(
            <WizardStepContainer
                {...baseProps}
                isLast
                status="reviewed"
                onReturnToDraft={vi.fn()}
            >
                <div>content</div>
            </WizardStepContainer>
        );
        expect(screen.getByText("Lock & Confirm")).toBeInTheDocument();
        expect(screen.getByText("Return to draft")).toBeInTheDocument();
    });

    it("names the blocking reason on disabled Next when blockingReason is set", () => {
        render(
            <WizardStepContainer
                {...baseProps}
                canProceed={false}
                blockingReason="Name and description are both present."
                toastOnBlock
            >
                <div>content</div>
            </WizardStepContainer>
        );
        const next = screen.getByText("Next").closest("button");
        expect(next).toBeDisabled();
        expect(next).toHaveAttribute(
            "title",
            "Name and description are both present."
        );
    });

    it("toasts the named blocking reason when Next is invoked while gated (toastOnBlock)", () => {
        render(
            <WizardStepContainer
                {...baseProps}
                canProceed={false}
                blockingReason="Name and description are both present."
                toastOnBlock
            >
                <div>content</div>
            </WizardStepContainer>
        );
        const next = screen.getByText("Next").closest("button");
        expect(next).toBeDisabled();
        fireEvent.click(next.closest("[data-wizard-block-wrap]"));
        expect(toast.error).toHaveBeenCalledWith(
            "Name and description are both present."
        );
        expect(baseProps.onNext).not.toHaveBeenCalled();
    });

    it("does not toast on a gated Next when toastOnBlock is omitted (convention A)", () => {
        render(
            <WizardStepContainer {...baseProps} canProceed={false}>
                <div>content</div>
            </WizardStepContainer>
        );
        const next = screen.getByText("Next").closest("button");
        fireEvent.click(next);
        expect(next.closest("[data-wizard-block-wrap]")).toBeNull();
        expect(toast.error).not.toHaveBeenCalled();
        expect(baseProps.onNext).not.toHaveBeenCalled();
    });

    it("uses lockedNotice verbatim instead of the confirmed-and-locked default", () => {
        render(
            <WizardStepContainer
                {...baseProps}
                locked
                status="operational"
                modelLabel="Task Model"
                lockedNotice="This Task Model is operational and no longer editable. Structural changes require cloning to a new version."
            >
                <div>content</div>
            </WizardStepContainer>
        );
        expect(
            screen.getByText(
                /This Task Model is operational and no longer editable/
            )
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/This Task Model is confirmed and locked/)
        ).not.toBeInTheDocument();
    });

    it("Save for Review calls onSaveAndReview, not onConfirm (draft promote path)", async () => {
        const onSaveDraft = vi.fn().mockResolvedValue(true);
        const onSaveAndReview = vi.fn().mockResolvedValue(undefined);
        const onConfirm = vi.fn();
        render(
            <WizardStepContainer
                {...baseProps}
                isLast
                status="draft"
                canProceed
                onSaveDraft={onSaveDraft}
                onSaveAndReview={onSaveAndReview}
                onConfirm={onConfirm}
            >
                <div>content</div>
            </WizardStepContainer>
        );
        fireEvent.click(screen.getByText("Save for Review"));
        await vi.waitFor(() => {
            expect(onSaveAndReview).toHaveBeenCalledTimes(1);
        });
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it("Lock & Confirm calls onConfirm, not onSaveAndReview (review promote path)", async () => {
        const onSaveAndReview = vi.fn();
        const onConfirm = vi.fn().mockResolvedValue(undefined);
        render(
            <WizardStepContainer
                {...baseProps}
                isLast
                status="reviewed"
                canProceed
                onSaveAndReview={onSaveAndReview}
                onConfirm={onConfirm}
                onReturnToDraft={vi.fn()}
            >
                <div>content</div>
            </WizardStepContainer>
        );
        fireEvent.click(screen.getByText("Lock & Confirm"));
        await vi.waitFor(() => {
            expect(onConfirm).toHaveBeenCalledTimes(1);
        });
        expect(onSaveAndReview).not.toHaveBeenCalled();
    });

    it("renders the named blockers banner and does not toast (convention C)", () => {
        render(
            <WizardStepContainer
                {...baseProps}
                canProceed={false}
                blockingReason="Task Model is bound."
                blockersBanner="Task Model is bound. — Pick a Task Model before continuing."
            >
                <div>content</div>
            </WizardStepContainer>
        );
        const banner = screen.getByTestId("wizard-step-blockers");
        expect(banner).toHaveTextContent(
            "Task Model is bound. — Pick a Task Model before continuing."
        );
        const next = screen.getByText("Next").closest("button");
        expect(next).toBeDisabled();
        expect(next).toHaveAttribute("title", "Task Model is bound.");
        fireEvent.click(next);
        expect(next.closest("[data-wizard-block-wrap]")).toBeNull();
        expect(toast.error).not.toHaveBeenCalled();
        expect(baseProps.onNext).not.toHaveBeenCalled();
    });

    it("hides Save for Review / Lock & Confirm when hidePromoteActions is set (convention C)", () => {
        const { rerender } = render(
            <WizardStepContainer
                {...baseProps}
                isLast
                status="draft"
                hidePromoteActions
                toolbarActions={<button type="button">Activate</button>}
            >
                <div>content</div>
            </WizardStepContainer>
        );
        expect(screen.queryByText("Save for Review")).not.toBeInTheDocument();
        expect(screen.getByText("Activate")).toBeInTheDocument();

        rerender(
            <WizardStepContainer
                {...baseProps}
                isLast
                status="reviewed"
                hidePromoteActions
                onReturnToDraft={vi.fn()}
                toolbarActions={<button type="button">Send back to draft</button>}
            >
                <div>content</div>
            </WizardStepContainer>
        );
        expect(screen.queryByText("Lock & Confirm")).not.toBeInTheDocument();
        expect(screen.queryByText("Return to draft")).not.toBeInTheDocument();
        expect(screen.getByText("Send back to draft")).toBeInTheDocument();
    });

    it("uses cancelLabel verbatim instead of Cancel (convention C)", () => {
        render(
            <WizardStepContainer {...baseProps} cancelLabel="Close">
                <div>content</div>
            </WizardStepContainer>
        );
        expect(screen.getByText("Close")).toBeInTheDocument();
        expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
    });

    it("does not gate Next on canProceed when editable is false (convention C locked override)", () => {
        render(
            <WizardStepContainer
                {...baseProps}
                canProceed={false}
                status="draft"
                locked={false}
                editable={false}
            >
                <div>content</div>
            </WizardStepContainer>
        );
        expect(screen.getByText("Next").closest("button")).not.toBeDisabled();
    });
});
