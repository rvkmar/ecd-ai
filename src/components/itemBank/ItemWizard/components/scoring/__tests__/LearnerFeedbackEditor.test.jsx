import React, { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LearnerFeedbackEditor from "../LearnerFeedbackEditor.jsx";

const baseItem = {
  interaction: {
    type: "mcq",
    responseComponents: [
      { id: "opt_a", label: "Leaf" },
      { id: "opt_b", label: "Root" },
    ],
  },
};

function Harness({ initial = baseItem }) {
  const [item, setItem] = useState(initial);
  return (
    <LearnerFeedbackEditor
      item={item}
      canEdit
      onChange={(next) => setItem((prev) => ({ ...prev, feedback: next }))}
    />
  );
}

describe("LearnerFeedbackEditor", () => {
  it("stores option text, a score rule, and the general note", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByTestId("feedback-option-opt_a"), "The leaf makes food.");
    expect(screen.getByTestId("feedback-option-opt_a")).toHaveValue("The leaf makes food.");

    await user.type(screen.getByTestId("feedback-general"), "Review the diagram.");
    expect(screen.getByTestId("feedback-general")).toHaveValue("Review the diagram.");

    await user.click(screen.getByRole("button", { name: "Add score rule" }));
    await user.type(screen.getByTestId("feedback-score-key-0"), "1");
    await user.type(screen.getByTestId("feedback-score-text-0"), "Full credit.");
    expect(screen.getByTestId("feedback-score-key-0")).toHaveValue("1");
    expect(screen.getByTestId("feedback-score-text-0")).toHaveValue("Full credit.");
  });

  it("shows authoring errors for overlapping score ranges", () => {
    render(
      <LearnerFeedbackEditor
        item={{
          ...baseItem,
          feedback: { byScore: { "0..1": "Low.", "1..2": "High." } },
        }}
        canEdit={false}
        onChange={() => {}}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("overlap");
    expect(screen.getByTestId("feedback-general")).toBeDisabled();
  });
});
