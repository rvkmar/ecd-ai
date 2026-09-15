import { describe, it, expect } from "vitest";
import {
  durationParts,
  formatDurationHms,
  syncPhaseTimings,
  closePhaseTiming,
  phaseElapsedMs,
  emptyPhaseTimings,
  normalizePhaseTimings,
  inferWizardPhase,
  applyWizardTimingToSession,
} from "../../utils/sessionWizardTiming.js";

describe("sessionWizardTiming", () => {
  it("splits duration into hours, minutes, and seconds", () => {
    expect(durationParts(3_725_000)).toEqual({
      hours: 1,
      minutes: 2,
      seconds: 5,
      totalMs: 3_725_000,
    });
    expect(formatDurationHms(3_725_000)).toBe("1h 2m 5s");
  });

  it("starts draft timing and closes prior phases when advancing", () => {
    const t0 = "2026-09-15T10:00:00.000Z";
    const t1 = "2026-09-15T10:05:00.000Z";
    let timings = syncPhaseTimings(emptyPhaseTimings(), "draft", t0);
    expect(timings.draft.startedAt).toBe(t0);
    expect(timings.draft.endedAt).toBeNull();

    timings = syncPhaseTimings(timings, "review", t1);
    expect(timings.draft.endedAt).toBe(t1);
    expect(timings.draft.durationMs).toBe(5 * 60 * 1000);
    expect(timings.review.startedAt).toBe(t1);
    expect(timings.review.endedAt).toBeNull();
  });

  it("closes submit phase on finalize", () => {
    const t0 = "2026-09-15T10:00:00.000Z";
    const t1 = "2026-09-15T10:10:00.000Z";
    let timings = syncPhaseTimings(emptyPhaseTimings(), "submitted", t0);
    timings = closePhaseTiming(timings, "submitted", t1);
    expect(timings.submitted.startedAt).toBe(t0);
    expect(timings.submitted.endedAt).toBe(t1);
    expect(phaseElapsedMs(timings.submitted)).toBe(10 * 60 * 1000);
  });

  it("infers the open wizard phase from stored timings", () => {
    const timings = syncPhaseTimings(
      syncPhaseTimings(emptyPhaseTimings(), "draft", "2026-09-15T10:00:00.000Z"),
      "review",
      "2026-09-15T10:05:00.000Z"
    );
    expect(inferWizardPhase(timings)).toBe("review");
    expect(inferWizardPhase(timings, true)).toBe("submitted");
  });

  it("applies timing onto a session record", () => {
    const session = { id: "s1", status: "in_progress" };
    applyWizardTimingToSession(session, {
      phase: "draft",
      atIso: "2026-09-15T10:00:00.000Z",
    });
    expect(session.wizardPhase).toBe("draft");
    expect(session.wizardPhaseTimings.draft.startedAt).toBe(
      "2026-09-15T10:00:00.000Z"
    );
    expect(normalizePhaseTimings(session.wizardPhaseTimings).draft.endedAt).toBeNull();
  });
});
