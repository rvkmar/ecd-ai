import { describe, it, expect } from "vitest";
import { presentationChrome } from "../presentationChrome.js";

const overlay = {
  presentationModelId: "pm1",
  accessibility: { profile: "large_text", fontScale: 1.25, timeMultiplier: 2 },
  timeMultiplier: 2,
};

describe("presentationChrome accommodations", () => {
  it("keeps the presentation surface when no student profile is present", () => {
    const chrome = presentationChrome(overlay);
    expect(chrome.fontScale).toBe(1.25);
    expect(chrome.timeMultiplier).toBe(2);
    expect(chrome.readAloud).toBe(false);
    expect(chrome.highContrast).toBe(false);
    expect(chrome.rootClassName).not.toMatch(/presentation-high-contrast/);
    expect(chrome.dataAttrs["data-read-aloud"]).toBe("false");
  });

  it("raises font scale, turns on high contrast, and does not rescale the clock", () => {
    const chrome = presentationChrome(overlay, {
      fontScale: 1.8,
      highContrast: true,
      readAloud: true,
      timeMultiplier: 1.5,
    });
    expect(chrome.fontScale).toBe(1.8);
    expect(chrome.rootStyle).toEqual({ fontSize: "1.8rem" });
    expect(chrome.rootClassName).toMatch(/presentation-large-text/);
    expect(chrome.rootClassName).toMatch(/presentation-high-contrast/);
    expect(chrome.highContrast).toBe(true);
    expect(chrome.readAloud).toBe(true);
    expect(chrome.timeMultiplier).toBe(2);
    expect(chrome.dataAttrs["data-read-aloud"]).toBe("true");
    expect(chrome.dataAttrs["data-presentation-time-multiplier"]).toBe("2");
  });

  it("applies high contrast and read-aloud with no presentation overlay", () => {
    const chrome = presentationChrome(
      { accommodations: { highContrast: true, readAloud: true, fontScale: 1.5 } }
    );
    expect(chrome.hasOverlay).toBe(false);
    expect(chrome.showProgress).toBe(true);
    expect(chrome.allowSkip).toBe(true);
    expect(chrome.fontScale).toBe(1.5);
    expect(chrome.highContrast).toBe(true);
    expect(chrome.readAloud).toBe(true);
    expect(chrome.rootClassName).toMatch(/presentation-high-contrast/);
  });

  it("does not shrink a larger presentation font", () => {
    const chrome = presentationChrome(overlay, { fontScale: 1.1 });
    expect(chrome.fontScale).toBe(1.25);
  });
});
