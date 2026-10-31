import { describe, expect, it } from "vitest";
import {
  TASK_TIMEOUT_POLICY,
  effectiveTaskTimeLimit,
  storedMsForOpenVisit,
  taskLimitElapsedMs,
  taskModelAttemptCap,
  taskRemainingMs,
  taskRevisionOpen,
} from "../taskConstraints.js";

describe("effectiveTaskTimeLimit", () => {
  const model = {
    taskStructure: { timingConstraint: { timeLimitSeconds: 60 } },
  };

  it("uses the accommodated stamp and does not scale it again", () => {
    const session = {
      deliveryAdministration: {
        accommodationTimeMultiplier: 2,
        extraTimeMinutes: 1,
        taskTimeLimits: { t1: 120 },
      },
    };
    expect(effectiveTaskTimeLimit(session, "t1", model)).toEqual({
      seconds: 120,
      limitMs: 120000,
      source: "taskTimeLimits",
    });
  });

  it("keeps the raw limit when the stamp has no key for the task", () => {
    const session = {
      deliveryAdministration: { accommodationTimeMultiplier: 2, extraTimeMinutes: 1 },
    };
    expect(effectiveTaskTimeLimit(session, "t1", model)).toEqual({
      seconds: 60,
      limitMs: 60000,
      source: "timingConstraint",
    });
  });

  it("is unlimited when the constraint is missing, zero, or blank", () => {
    expect(effectiveTaskTimeLimit({}, "t1", {})).toBeNull();
    expect(effectiveTaskTimeLimit({}, "t1", {
      taskStructure: { timingConstraint: { timeLimitSeconds: 0 } },
    })).toBeNull();
    expect(effectiveTaskTimeLimit({}, "t1", {
      taskStructure: { timingConstraint: {} },
    })).toBeNull();
    expect(taskModelAttemptCap({})).toBeNull();
    expect(taskModelAttemptCap({
      taskStructure: { resourceConstraints: { maxAttempts: 0 } },
    })).toBeNull();
    expect(taskModelAttemptCap({
      taskStructure: { resourceConstraints: { maxAttempts: 2 } },
    })).toBe(2);
  });
});

describe("task clocks", () => {
  it("adds stored time only after a new present", () => {
    const session = {
      responses: [{ taskId: "t1", timeOnItemMs: 4000, timestamp: "2026-10-31T12:00:04.000Z" }],
    };
    expect(storedMsForOpenVisit(session, "t1", "2026-10-31T12:00:00.000Z")).toBe(0);
    expect(storedMsForOpenVisit(session, "t1", "2026-10-31T12:00:04.100Z")).toBe(4000);
    expect(taskLimitElapsedMs({ storedMs: 4000, openElapsedMs: 1000, accruedMs: 0 })).toBe(5000);
  });

  it("counts remaining time from the given limit", () => {
    const start = "2026-10-31T12:00:00.000Z";
    const now = Date.parse(start) + 30000;
    expect(taskRemainingMs({
      limitMs: 120000,
      openPresentedAt: start,
      now,
    })).toBe(90000);
  });
});

describe("taskRevisionOpen", () => {
  const capped = { taskStructure: { resourceConstraints: { maxAttempts: 2 } } };

  it("stays open under the task cap and closes after a timeout or a spent cap", () => {
    expect(taskRevisionOpen({ responses: [] }, "t1", capped)).toBe(true);
    expect(taskRevisionOpen({
      responses: [{ taskId: "t1", attempt: 1 }],
      deliveryAdministration: { reviewAllowed: false, attempts: 3 },
    }, "t1", capped)).toBe(true);
    expect(taskRevisionOpen({
      responses: [{ taskId: "t1", attempt: 2 }],
    }, "t1", capped)).toBe(false);
    expect(taskRevisionOpen({
      responses: [{ taskId: "t1", attempt: 1, timedOut: true }],
    }, "t1", capped)).toBe(false);
    expect(taskRevisionOpen({
      responses: [{ taskId: "t1" }],
    }, "t1", {})).toBe(false);
    expect(TASK_TIMEOUT_POLICY).toBe("record-current-work");
  });
});
