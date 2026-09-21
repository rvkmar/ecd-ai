// server/delivery/__tests__/presentationLiveSelect.test.js
//
// D115: live-select prefers operational PM so switching which model is
// operational changes delivery overlay without touching item content.

import { describe, it, expect } from "vitest";
import {
  selectPresentationModelIdForTaskModel,
  resolvePresentationModel,
} from "../presentationModelResolution.js";

function makePm(overrides = {}) {
  return {
    id: "pm1",
    name: "A",
    taskModelId: "tm1",
    taskModelVersion: 1,
    status: "confirmed",
    locked: true,
    layout: { itemOrder: "authored", navigation: "linear" },
    conditionalDisplay: { showFeedback: "none", showProgress: true, allowSkip: false },
    accessibility: { profile: "large_text", fontScale: 1.5 },
    updatedAt: "2026-09-21T10:00:00.000Z",
    ...overrides,
  };
}

describe("D115 live-select — two PMs, one Task Model", () => {
  it("switching operational model changes resolved profile without item edits", () => {
    const pmLarge = makePm({
      id: "pm-large",
      status: "operational",
      accessibility: { profile: "large_text", fontScale: 1.5 },
      conditionalDisplay: { showFeedback: "none", showProgress: true, allowSkip: false },
    });
    const pmContrast = makePm({
      id: "pm-contrast",
      status: "confirmed",
      accessibility: { profile: "high_contrast", fontScale: 1 },
      conditionalDisplay: { showFeedback: "none", showProgress: false, allowSkip: true },
      updatedAt: "2026-09-21T12:00:00.000Z",
    });
    const db = { presentationModels: [pmLarge, pmContrast] };

    let id = selectPresentationModelIdForTaskModel(db, "tm1", 1);
    expect(id).toBe("pm-large");
    let resolved = resolvePresentationModel(db, {
      presentationModelId: id,
      taskModelId: "tm1",
      taskModelVersion: 1,
    });
    expect(resolved.overlay.accessibility.profile).toBe("large_text");
    expect(resolved.overlay.conditionalDisplay.showProgress).toBe(true);

    // Flip operational — same Task Model, no item touched.
    pmLarge.status = "suspended";
    pmContrast.status = "operational";

    id = selectPresentationModelIdForTaskModel(db, "tm1", 1);
    expect(id).toBe("pm-contrast");
    resolved = resolvePresentationModel(db, {
      presentationModelId: id,
      taskModelId: "tm1",
      taskModelVersion: 1,
    });
    expect(resolved.overlay.accessibility.profile).toBe("high_contrast");
    expect(resolved.overlay.conditionalDisplay.showProgress).toBe(false);
    expect(resolved.overlay.conditionalDisplay.allowSkip).toBe(true);
  });
});
