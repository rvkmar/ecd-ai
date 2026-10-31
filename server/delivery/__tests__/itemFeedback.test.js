import { describe, expect, it } from "vitest";
import { stampItemFeedback, visibleItemFeedback } from "../itemFeedback.js";

const item = {
  id: "it1",
  feedback: {
    byOption: { opt_a: "That option is right." },
    byScore: { 0: "Not this time." },
    general: "Read the stem again.",
  },
};

describe("stampItemFeedback", () => {
  it("writes the resolved text and the rule that matched", () => {
    const response = { rawAnswer: "opt_a", value: 0 };
    stampItemFeedback(item, response);
    expect(response.feedback).toEqual({
      text: "That option is right.",
      rule: "byOption",
      key: "opt_a",
    });
  });

  it("leaves a response unchanged when the item has no feedback", () => {
    const response = { rawAnswer: "opt_a", rationale: "Keyed." };
    stampItemFeedback({ id: "it1" }, response);
    expect(response.feedback).toBeUndefined();
    expect(response.rationale).toBe("Keyed.");
  });

  it("replaces a previous rule when a later score matches", () => {
    const response = {
      rawAnswer: "opt_c",
      value: null,
      feedback: { text: "Read the stem again.", rule: "general", key: null },
    };
    stampItemFeedback(item, { ...response, value: 0 });
    const rescored = { rawAnswer: "opt_c", value: 0 };
    stampItemFeedback(item, rescored);
    expect(rescored.feedback).toEqual({
      text: "Not this time.",
      rule: "byScore",
      key: "0",
    });
  });
});

describe("visibleItemFeedback timing", () => {
  const session = {
    id: "s1",
    status: "in_progress",
    isCompleted: false,
    responses: [
      {
        taskId: "t1",
        itemId: "it1",
        rawAnswer: "opt_a",
        feedback: { text: "That option is right.", rule: "byOption", key: "opt_a" },
      },
    ],
  };
  const student = { role: "student", username: "stud1" };
  const teacher = { role: "teacher", username: "teach1" };

  it("hides authored feedback from a learner until timing allows it", () => {
    expect(
      visibleItemFeedback(
        { ...session, deliveryAdministration: { feedbackMode: "none" } },
        student
      )
    ).toEqual([]);

    expect(
      visibleItemFeedback(
        { ...session, deliveryAdministration: { feedbackMode: "delayed_end" } },
        student
      )
    ).toEqual([]);

    expect(
      visibleItemFeedback(
        { ...session, deliveryAdministration: { feedbackMode: "immediate" } },
        student
      )
    ).toEqual([
      {
        taskId: "t1",
        itemId: "it1",
        text: "That option is right.",
        rule: "byOption",
        key: "opt_a",
      },
    ]);

    expect(
      visibleItemFeedback(
        {
          ...session,
          status: "submitted",
          isCompleted: true,
          deliveryAdministration: { feedbackMode: "delayed_end" },
        },
        student
      )[0].text
    ).toBe("That option is right.");
  });

  it("keeps the text for staff even when learners are not shown it", () => {
    const rows = visibleItemFeedback(
      { ...session, deliveryAdministration: { feedbackMode: "none" } },
      teacher
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].rule).toBe("byOption");
  });

  it("includes stored feedback when the session has no feedback mode", () => {
    expect(visibleItemFeedback(session, student)).toHaveLength(1);
  });
});
