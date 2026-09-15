import { describe, it, expect } from "vitest";
import {
  questionNavState,
  QUESTION_STATE,
  WIZARD_PHASE,
} from "../StudentSessionWizard";

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
