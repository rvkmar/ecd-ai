import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ItemPresenter from "../ItemPresenter.jsx";
import ReadAloudButton from "../ReadAloudButton.jsx";
import { readAloudScript, speakAloud } from "../readAloudText.js";

const item = {
  id: "item1",
  stimulus: {
    layout: "single",
    blocks: [{ type: "text", content: "What is 1/2 + 1/4?" }],
  },
  interaction: {
    type: "mcq",
    responseComponents: [
      { id: "a", label: "3/4" },
      { id: "b", label: "2/6" },
    ],
  },
};

describe("readAloudScript", () => {
  it("joins the stem and numbered options", () => {
    expect(readAloudScript({ stem: "Stem", options: ["Yes", "No"] })).toBe(
      "Stem Option 1. Yes Option 2. No"
    );
  });
});

describe("ReadAloudButton", () => {
  let speak;
  let cancel;

  beforeEach(() => {
    speak = vi.fn();
    cancel = vi.fn();
    window.speechSynthesis = { speak, cancel };
    window.SpeechSynthesisUtterance = class FakeUtterance {
      constructor(text) {
        this.text = text;
      }
    };
  });

  afterEach(() => {
    delete window.speechSynthesis;
    delete window.SpeechSynthesisUtterance;
  });

  it("is hidden when read-aloud is off", () => {
    render(<ItemPresenter item={item} value={null} onChange={() => {}} />);
    expect(screen.queryByTestId("read-aloud")).toBeNull();
  });

  it("speaks the item stem and options", () => {
    render(
      <ItemPresenter
        item={item}
        value={null}
        onChange={() => {}}
        presentation={{ accommodations: { readAloud: true } }}
      />
    );
    fireEvent.click(screen.getByTestId("read-aloud"));
    expect(speak).toHaveBeenCalledTimes(1);
    const utterance = speak.mock.calls[0][0];
    expect(utterance.text).toMatch(/What is 1\/2 \+ 1\/4\?/);
    expect(utterance.text).toMatch(/Option 1\. 3\/4/);
    expect(utterance.text).toMatch(/Option 2\. 2\/6/);
    expect(screen.getByTestId("read-aloud")).toHaveAttribute("aria-pressed", "true");
  });

  it("stops on the second click", () => {
    render(<ReadAloudButton stem="Stem" options={["Yes"]} enabled />);
    fireEvent.click(screen.getByTestId("read-aloud"));
    fireEvent.click(screen.getByTestId("read-aloud"));
    expect(cancel).toHaveBeenCalled();
    expect(screen.getByTestId("read-aloud")).toHaveAttribute("aria-pressed", "false");
  });

  it("does nothing when speechSynthesis is missing", () => {
    delete window.speechSynthesis;
    delete window.SpeechSynthesisUtterance;
    render(<ReadAloudButton stem="Stem" options={["Yes"]} enabled />);
    expect(() => fireEvent.click(screen.getByTestId("read-aloud"))).not.toThrow();
    expect(speakAloud("Stem")).toBeNull();
    expect(screen.getByTestId("read-aloud")).toHaveAttribute("aria-pressed", "false");
  });
});
