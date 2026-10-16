// src/components/sessions/__tests__/ItemPresenter.test.jsx
//
// D47. The examinee-facing half of the item cutover.
//
// The single most important assertion here is the last one: this
// component must never read a correctness field. The whole point of D47
// is that the client stops having an opinion about whether an answer is
// right — identifyEvidence() on the server decides, from the item's
// evidenceActivationMap. A renderer that peeks at `correctOptionId` would
// reintroduce finding F3 through the back door.

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import fs from "fs";
import path from "path";
import ItemPresenter, { canPresentItem } from "../ItemPresenter.jsx";

const mcqItem = {
  id: "item-1",
  stimulus: {
    layout: "single",
    blocks: [{ type: "text", content: "Which fraction is equivalent to 2/4?" }],
  },
  interaction: {
    type: "mcq",
    responseComponents: [
      { id: "opt_a", label: "1/2" },
      { id: "opt_b", label: "3/8" },
    ],
  },
  // Deliberately present, and deliberately never consulted. A legacy
  // question record carries this; an item must not be scored by it.
  correctOptionId: "opt_a",
};

describe("ItemPresenter", () => {
  it("renders stimulus text stored as an object", () => {
    const objectStem = {
      ...mcqItem,
      stimulus: {
        layout: "single",
        blocks: [{ type: "text", content: { text: "Name the part", format: "plain" } }],
      },
    };
    render(<ItemPresenter item={objectStem} value={null} onChange={() => {}} />);
    expect(screen.getByText("Name the part")).toBeInTheDocument();
    expect(screen.queryByText("[object Object]")).not.toBeInTheDocument();
  });

  it("renders the item's stimulus blocks", () => {
    render(<ItemPresenter item={mcqItem} value={null} onChange={() => {}} />);
    expect(
      screen.getByText("Which fraction is equivalent to 2/4?")
    ).toBeInTheDocument();
  });

  it("reports the chosen option id upward, unscored", () => {
    const onChange = vi.fn();
    render(<ItemPresenter item={mcqItem} value={null} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("3/8"));

    // The raw option id — not 0, not 1, not a judgement.
    expect(onChange).toHaveBeenCalledWith("opt_b");
    expect(onChange).not.toHaveBeenCalledWith(0);
    expect(onChange).not.toHaveBeenCalledWith(1);
  });

  it("accumulates and removes selections for multiselect", () => {
    const onChange = vi.fn();
    const item = {
      ...mcqItem,
      interaction: { ...mcqItem.interaction, type: "multiselect" },
    };
    const { rerender } = render(
      <ItemPresenter item={item} value={[]} onChange={onChange} />
    );

    fireEvent.click(screen.getByLabelText("1/2"));
    expect(onChange).toHaveBeenCalledWith(["opt_a"]);

    rerender(<ItemPresenter item={item} value={["opt_a"]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("1/2"));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("refuses rather than guesses on an interaction type it cannot present", () => {
    // An unanswerable item must say so, not render blank and let a null
    // response be recorded as though the examinee had chosen it.
    const item = {
      ...mcqItem,
      interaction: { type: "process_trace", responseComponents: [] },
    };
    render(<ItemPresenter item={item} value={null} onChange={() => {}} />);
    expect(screen.getByText(/cannot present yet/i)).toBeInTheDocument();
    expect(canPresentItem(item)).toBe(false);
    expect(canPresentItem(mcqItem)).toBe(true);
  });

  it("disables every input when the session is not answerable", () => {
    render(
      <ItemPresenter item={mcqItem} value={null} onChange={() => {}} disabled />
    );
    expect(screen.getByLabelText("1/2")).toBeDisabled();
    expect(screen.getByLabelText("3/8")).toBeDisabled();
  });

  it("never reads a correctness field from the item", () => {
    // Static, and deliberately so: a behavioural test can only prove the
    // component did not use it for the inputs tried. This proves the
    // source contains no such read at all.
    const src = fs.readFileSync(
      path.resolve(__dirname, "../ItemPresenter.jsx"),
      "utf8"
    );
    const code = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");

    expect(code).not.toMatch(/correctOptionId/);
    expect(code).not.toMatch(/isCorrect/);
    expect(code).not.toMatch(/scoredValue/);
  });
});
