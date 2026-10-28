// D115 — Presentation Model chrome: two overlays over the same item change
// what the examinee sees without touching item content (W23 gate).

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { presentationChrome } from "../presentationChrome.js";
import ItemPresenter from "../ItemPresenter.jsx";

const sameItem = {
  id: "item-shared",
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

const pmLarge = {
  presentationModelId: "pm-large",
  name: "Large text delivery",
  status: "operational",
  taskModelId: "tm1",
  taskModelVersion: 1,
  layout: { itemOrder: "authored", navigation: "linear" },
  conditionalDisplay: {
    showFeedback: "none",
    allowSkip: false,
    allowReview: false,
    showProgress: true,
  },
  accessibility: { profile: "large_text", fontScale: 1.5, timeMultiplier: 1 },
};

const pmContrast = {
  presentationModelId: "pm-contrast",
  name: "High contrast delivery",
  status: "operational",
  taskModelId: "tm1",
  taskModelVersion: 1,
  layout: { itemOrder: "authored", navigation: "linear" },
  conditionalDisplay: {
    showFeedback: "none",
    allowSkip: true,
    allowReview: true,
    showProgress: false,
  },
  accessibility: { profile: "high_contrast", fontScale: 1, timeMultiplier: 2 },
};

describe("presentationChrome — pure surface from overlay", () => {
  it("derives different chrome for two Presentation Models without reading the item", () => {
    const a = presentationChrome(pmLarge);
    const b = presentationChrome(pmContrast);

    expect(a.presentationModelId).toBe("pm-large");
    expect(b.presentationModelId).toBe("pm-contrast");
    expect(a.profile).toBe("large_text");
    expect(b.profile).toBe("high_contrast");
    expect(a.showProgress).toBe(true);
    expect(b.showProgress).toBe(false);
    expect(a.allowSkip).toBe(false);
    expect(b.allowSkip).toBe(true);
    expect(a.fontScale).toBe(1.5);
    expect(b.timeMultiplier).toBe(2);

    // Same item content is not part of the chrome derivation.
    expect(JSON.stringify(a)).not.toMatch(/1\/2 \+ 1\/4/);
    expect(JSON.stringify(b)).not.toMatch(/1\/2 \+ 1\/4/);
  });

  it("preserves pre-D115 defaults when no overlay is attached", () => {
    const chrome = presentationChrome(null);
    expect(chrome.hasOverlay).toBe(false);
    expect(chrome.showProgress).toBe(true);
    expect(chrome.allowSkip).toBe(true);
    expect(chrome.allowReview).toBe(true);
    expect(chrome.showFeedback).toBe("none");
    expect(chrome.itemOrder).toBeNull();
    expect(chrome.grouping).toBeNull();
    expect(chrome.navigation).toBeNull();
    expect(chrome.timeMultiplier).toBe(1);
    expect(chrome.profile).toBe("default");
  });

  it("treats a missing allowReview key as review still open", () => {
    const chrome = presentationChrome({
      presentationModelId: "pm-partial",
      layout: {},
      conditionalDisplay: { showProgress: true },
      accessibility: {},
    });
    expect(chrome.allowReview).toBe(true);
    expect(chrome.showFeedback).toBe("none");
    expect(chrome.itemOrder).toBeNull();
    expect(chrome.navigation).toBeNull();
  });
});

describe("ItemPresenter obeys Presentation Model (same item, two overlays)", () => {
  it("renders identical stimulus text under both models", () => {
    const { rerender } = render(
      <ItemPresenter item={sameItem} value={null} onChange={() => {}} presentation={pmLarge} />
    );
    expect(screen.getByText("What is 1/2 + 1/4?")).toBeInTheDocument();
    expect(screen.getByTestId("item-presenter")).toHaveAttribute(
      "data-presentation-profile",
      "large_text"
    );
    expect(screen.getByTestId("item-presenter")).toHaveAttribute(
      "data-presentation-model-id",
      "pm-large"
    );
    expect(screen.getByTestId("item-presenter").className).toMatch(/presentation-large-text/);

    rerender(
      <ItemPresenter
        item={sameItem}
        value={null}
        onChange={() => {}}
        presentation={pmContrast}
      />
    );
    expect(screen.getByText("What is 1/2 + 1/4?")).toBeInTheDocument();
    expect(screen.getByTestId("item-presenter")).toHaveAttribute(
      "data-presentation-profile",
      "high_contrast"
    );
    expect(screen.getByTestId("item-presenter")).toHaveAttribute(
      "data-presentation-model-id",
      "pm-contrast"
    );
    expect(screen.getByTestId("item-presenter").className).toMatch(
      /presentation-high-contrast/
    );
    // Item record unchanged — only the overlay id/profile flipped.
    expect(sameItem.stimulus.blocks[0].content).toBe("What is 1/2 + 1/4?");
  });
});
