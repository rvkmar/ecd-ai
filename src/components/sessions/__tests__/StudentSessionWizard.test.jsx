import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudentSessionWizard, {
  questionNavState,
  QUESTION_STATE,
  WIZARD_PHASE,
} from "../StudentSessionWizard.jsx";

describe("questionNavState", () => {
  const answered = new Set(["t1"]);

  it("marks unanswered non-current as yet to attend", () => {
    expect(
      questionNavState({
        taskId: "t2",
        currentTaskId: "t1",
        answeredIds: answered,
        phase: WIZARD_PHASE.DRAFT,
      })
    ).toBe(QUESTION_STATE.YET_TO_ATTEND);
  });

  it("marks current unanswered as attend", () => {
    expect(
      questionNavState({
        taskId: "t2",
        currentTaskId: "t2",
        answeredIds: answered,
        phase: WIZARD_PHASE.DRAFT,
      })
    ).toBe(QUESTION_STATE.ATTEND);
  });

  it("marks answered as review", () => {
    expect(
      questionNavState({
        taskId: "t1",
        currentTaskId: "t2",
        answeredIds: answered,
        phase: WIZARD_PHASE.DRAFT,
      })
    ).toBe(QUESTION_STATE.REVIEW);
  });

  it("marks all as submit when session closed", () => {
    expect(
      questionNavState({
        taskId: "t1",
        currentTaskId: "t1",
        answeredIds: answered,
        phase: WIZARD_PHASE.DRAFT,
        sessionClosed: true,
      })
    ).toBe(QUESTION_STATE.SUBMIT);
  });
});

describe("StudentSessionWizard chrome", () => {
  // Do not use fake timers here: WizardPhaseTimer sets a 1s interval, and
  // vi.useRealTimers() in afterEach then hangs waiting on that pending timer.
  afterEach(() => {
    cleanup();
  });

  it("does not render a Pause button", () => {
    render(
      <StudentSessionWizard
        sessionId="s-timer"
        phase={WIZARD_PHASE.DRAFT}
        taskIds={["t1"]}
        currentTaskId="t1"
        answeredIds={new Set()}
      />
    );
    expect(screen.queryByText("Pause")).toBeNull();
  });

  it("shows a phase timer with start and duration for Draft", () => {
    render(
      <StudentSessionWizard
        sessionId="s-timer"
        phase={WIZARD_PHASE.DRAFT}
        taskIds={["t1"]}
        currentTaskId="t1"
        answeredIds={new Set()}
      />
    );
    const timer = screen.getByTestId("wizard-phase-timer");
    expect(timer).toBeInTheDocument();
    expect(screen.getByTestId("wizard-live-elapsed")).toHaveTextContent(
      /\d+h \d+m \d+s/
    );
    expect(within(timer).getByText("Draft")).toBeInTheDocument();
    expect(within(timer).getByText("Start")).toBeInTheDocument();
    expect(within(timer).getByText("End")).toBeInTheDocument();
    expect(within(timer).getByText("Duration")).toBeInTheDocument();
  });

  it("records end of Draft when entering Review", async () => {
    const user = userEvent.setup();
    const onEnterReview = vi.fn();
    const { rerender } = render(
      <StudentSessionWizard
        sessionId="s-timer"
        phase={WIZARD_PHASE.DRAFT}
        taskIds={["t1"]}
        currentTaskId="t1"
        answeredIds={new Set(["t1"])}
        canEnterReview
        onEnterReview={onEnterReview}
      />
    );
    await user.click(screen.getByRole("button", { name: "Enter review" }));
    expect(onEnterReview).toHaveBeenCalled();

    rerender(
      <StudentSessionWizard
        sessionId="s-timer"
        phase={WIZARD_PHASE.REVIEW}
        taskIds={["t1"]}
        currentTaskId="t1"
        answeredIds={new Set(["t1"])}
      />
    );
    expect(screen.getByText(/Current \(Review\)/)).toBeInTheDocument();
  });
});
