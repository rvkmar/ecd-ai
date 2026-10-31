import { describe, it, expect } from "vitest";
import { validateEntity } from "../../../src/utils/schema.js";
import {
  CATALOG_SUMMARY_PROJECTION,
  RATING_QUEUE_PROJECTION,
  catalogListSummary,
  projectSession,
} from "../../sessions/sessionListProjection.js";
import {
  canonicalSession,
} from "../../sessions/sessionCanonical.js";
import {
  computeEffectiveDeadline,
  endPause,
  evaluateAttempt,
  deliveryTimingView,
  isPastDeliveryDeadline,
  presentSession,
  stampDeliveryAdministration,
} from "../deliveryAdministration.js";

const MINUTE = 60 * 1000;

describe("computeEffectiveDeadline", () => {
  it("multiplies the limit, adds extra minutes, and shifts by paused time", () => {
    const open = computeEffectiveDeadline({
      timeLimitMinutes: 10,
      timeMultiplier: 2,
      extraTimeMinutes: 5,
    });
    expect(open.durationMs).toBe(25 * MINUTE);
    expect(open.effectiveDeadline).toBeNull();

    const started = computeEffectiveDeadline({
      clockStartedAt: "2026-10-28T12:00:00.000Z",
      timeLimitMinutes: 10,
      timeMultiplier: 2,
      extraTimeMinutes: 5,
      pausedMs: 3 * MINUTE,
    });
    expect(started.effectiveDeadline).toBe("2026-10-28T12:28:00.000Z");
  });

  it("defaults extra time to 0 and the multiplier to 1", () => {
    const result = computeEffectiveDeadline({
      clockStartedAt: "2026-10-28T12:00:00.000Z",
      timeLimitMinutes: 20,
    });
    expect(result.durationMs).toBe(20 * MINUTE);
    expect(result.effectiveDeadline).toBe("2026-10-28T12:20:00.000Z");
  });

  it("returns no duration when the limit is absent", () => {
    expect(computeEffectiveDeadline({ timeLimitMinutes: null }).durationMs).toBeNull();
    expect(computeEffectiveDeadline({}).durationMs).toBeNull();
  });

  it("ignores a multiplier outside [1, 3]", () => {
    const result = computeEffectiveDeadline({
      timeLimitMinutes: 10,
      timeMultiplier: 9,
    });
    expect(result.durationMs).toBe(10 * MINUTE);
  });

  it("applies the student multiplier and extra minutes on top of the presentation factor", () => {
    const result = computeEffectiveDeadline({
      clockStartedAt: "2026-10-28T12:00:00.000Z",
      timeLimitMinutes: 20,
      timeMultiplier: 2,
      accommodationTimeMultiplier: 1.5,
      extraTimeMinutes: 5,
    });
    expect(result.durationMs).toBe(65 * MINUTE);
    expect(result.effectiveDeadline).toBe("2026-10-28T13:05:00.000Z");
  });
});

describe("stampDeliveryAdministration", () => {
  it("lets the stricter review flag win and keeps the override multiplier", () => {
    const stamp = stampDeliveryAdministration({
      administration: {
        timeLimitMinutes: 20,
        attempts: 2,
        allowedReview: true,
        feedbackMode: "delayed_end",
      },
      presentations: [
        { source: "task", id: "pm-task", timeMultiplier: 1, allowReview: true },
        { source: "override", id: "pm-over", timeMultiplier: 1.5, allowReview: false },
      ],
    });
    expect(stamp.timeMultiplier).toBe(1.5);
    expect(stamp.presentationModelId).toBe("pm-over");
    expect(stamp.presentationAllowReview).toBe(false);
    expect(stamp.reviewAllowed).toBe(false);
    expect(stamp.allowedReview).toBe(true);
    expect(stamp.attempts).toBe(2);
    expect(stamp.feedbackMode).toBe("delayed_end");
    expect(stamp.extraTimeMinutes).toBe(0);
    expect(stamp.clockStartedAt).toBeNull();
  });

  it("uses the largest task multiplier when the delivery model has no override", () => {
    const stamp = stampDeliveryAdministration({
      administration: { timeLimitMinutes: 10, allowedReview: true, feedbackMode: "none" },
      presentations: [
        { source: "task", id: "pm-a", timeMultiplier: 1, allowReview: true },
        { source: "task", id: "pm-b", timeMultiplier: 2, allowReview: true },
      ],
    });
    expect(stamp.timeMultiplier).toBe(2);
    expect(stamp.presentationModelId).toBeNull();
    expect(stamp.reviewAllowed).toBe(true);
  });

  it("stamps review from a presentation model even when the delivery model omitted the flag", () => {
    const stamp = stampDeliveryAdministration({
      administration: { feedbackMode: "immediate" },
      presentations: [{ source: "override", id: "pm", allowReview: false, timeMultiplier: 1 }],
    });
    expect(stamp.reviewAllowed).toBe(false);
    expect(stamp.allowedReview).toBeUndefined();
  });

  it("returns null when nothing was saved", () => {
    expect(stampDeliveryAdministration({ administration: {} })).toBeNull();
    expect(stampDeliveryAdministration({ administration: null, presentations: [] })).toBeNull();
  });

  it("stores student timing on the session limit and on task limits", () => {
    const stamp = stampDeliveryAdministration({
      administration: { timeLimitMinutes: 20 },
      presentations: [{ source: "override", id: "pm", timeMultiplier: 2, allowReview: true }],
      extraTimeMinutes: 5,
      accommodationTimeMultiplier: 1.5,
      accommodations: { extraTimeMinutes: 5, timeMultiplier: 1.5, readAloud: true },
      taskLimits: [
        { taskId: "t1", timeLimitSeconds: 60 },
        { taskId: "t2", timeLimitSeconds: 0 },
      ],
    });
    expect(stamp.timeMultiplier).toBe(2);
    expect(stamp.accommodationTimeMultiplier).toBe(1.5);
    expect(stamp.extraTimeMinutes).toBe(5);
    expect(stamp.accommodations.readAloud).toBe(true);
    expect(stamp.taskTimeLimits).toEqual({ t1: 390 });
    const open = computeEffectiveDeadline(stamp);
    expect(open.durationMs).toBe(65 * MINUTE);
  });

  it("keeps a read-aloud profile off the delivery clock", () => {
    const stamp = stampDeliveryAdministration({
      accommodations: { readAloud: true, fontScale: 1.4 },
    });
    expect(stamp.timeLimitMinutes).toBeUndefined();
    expect(stamp.accommodations).toEqual({ readAloud: true, fontScale: 1.4 });
    expect(deliveryTimingView({ deliveryAdministration: stamp })).toBeNull();
  });

  it("passes schema validation and rejects a bad feedback mode", () => {
    const stamp = stampDeliveryAdministration({
      administration: {
        timeLimitMinutes: 15,
        attempts: 1,
        allowedReview: false,
        feedbackMode: "none",
      },
    });
    const ok = validateEntity("sessions", {
      id: "s1",
      status: "ready",
      taskIds: ["t1"],
      responses: [],
      studentModel: {},
      deliveryAdministration: stamp,
    }, { tasks: [{ id: "t1" }], deliveryModels: [] });
    expect(ok.valid).toBe(true);

    const bad = validateEntity("sessions", {
      id: "s1",
      status: "ready",
      responses: [],
      deliveryAdministration: { ...stamp, feedbackMode: "whisper" },
    }, {});
    expect(bad.valid).toBe(false);
    expect(bad.errors.join(" ")).toMatch(/feedbackMode/);
  });
});

describe("pause and attempts", () => {
  function running(overrides = {}) {
    return {
      status: "in_progress",
      deliveryAdministration: {
        timeLimitMinutes: 30,
        timeMultiplier: 1,
        extraTimeMinutes: 0,
        pausedMs: 0,
        clockStartedAt: "2026-10-28T12:00:00.000Z",
        pauseStartedAt: null,
        effectiveDeadline: "2026-10-28T12:30:00.000Z",
        ...overrides,
      },
    };
  }

  it("freezes remaining time while paused and extends the deadline on resume", () => {
    const session = running();
    session.deliveryAdministration.pauseStartedAt = "2026-10-28T12:10:00.000Z";
    session.status = "paused";
    const during = deliveryTimingView(session, new Date("2026-10-28T12:40:00.000Z")).remainingMs;
    expect(during).toBe(20 * MINUTE);
    expect(isPastDeliveryDeadline(session, new Date("2026-10-28T12:40:00.000Z"))).toBe(false);

    endPause(session, new Date("2026-10-28T12:25:00.000Z"));
    expect(session.deliveryAdministration.pauseStartedAt).toBeNull();
    expect(session.deliveryAdministration.pausedMs).toBe(15 * MINUTE);
    expect(session.deliveryAdministration.effectiveDeadline).toBe("2026-10-28T12:45:00.000Z");
    expect(deliveryTimingView(session, new Date("2026-10-28T12:25:00.000Z")).remainingMs).toBe(20 * MINUTE);
  });

  it("treats a session with no stamp as having no deadline and no attempt cap", () => {
    const session = { responses: [{ taskId: "t1" }] };
    expect(isPastDeliveryDeadline(session, new Date())).toBe(false);
    expect(evaluateAttempt(session, "t1").action).toBe("legacy");
    expect(evaluateAttempt(session, "t2").action).toBe("append");
    expect(evaluateAttempt(session, "t2").nextAttempt).toBeUndefined();
  });

  it("blocks a change when review is off and counts a replacement when review is on", () => {
    const blocked = {
      responses: [{ taskId: "t1", attempt: 1 }],
      deliveryAdministration: { reviewAllowed: false, attempts: 3 },
    };
    const refused = evaluateAttempt(blocked, "t1");
    expect(refused.ok).toBe(false);
    expect(refused.code).toBe("review_not_allowed");
    expect(refused.error).toMatch(/Review is not allowed/);

    const open = {
      responses: [{ taskId: "t1", attempt: 1 }],
      deliveryAdministration: { reviewAllowed: true, attempts: 2 },
    };
    expect(evaluateAttempt(open, "t1")).toMatchObject({ ok: true, action: "replace", nextAttempt: 2 });
    open.responses[0].attempt = 2;
    const spent = evaluateAttempt(open, "t1");
    expect(spent.ok).toBe(false);
    expect(spent.code).toBe("attempts_exhausted");
    expect(spent.error).toMatch(/all 2 attempts/);
  });

  it("counts a task maxAttempts budget and then refuses, without a delivery stamp", () => {
    const session = { responses: [] };
    expect(evaluateAttempt(session, "t1", { taskMaxAttempts: 2 })).toMatchObject({
      ok: true,
      action: "append",
      nextAttempt: 1,
    });
    session.responses = [{ taskId: "t1", attempt: 1 }];
    expect(evaluateAttempt(session, "t1", { taskMaxAttempts: 2 })).toMatchObject({
      ok: true,
      action: "replace",
      nextAttempt: 2,
    });
    session.responses[0].attempt = 2;
    const refused = evaluateAttempt(session, "t1", { taskMaxAttempts: 2 });
    expect(refused).toMatchObject({
      ok: false,
      status: 409,
      code: "task_attempts_exhausted",
      maxAttempts: 2,
      attemptsUsed: 2,
    });
    expect(refused.error).toMatch(/allows 2 attempts/);
    expect(refused.error).toMatch(/No further answers are accepted/);
  });

  it("ignores a missing or non-positive task cap", () => {
    const session = { responses: [{ taskId: "t1" }] };
    expect(evaluateAttempt(session, "t1", {}).action).toBe("legacy");
    expect(evaluateAttempt(session, "t1", { taskMaxAttempts: null }).action).toBe("legacy");
    expect(evaluateAttempt(session, "t1", { taskMaxAttempts: 0 }).action).toBe("legacy");
    expect(evaluateAttempt(session, "t1").action).toBe("legacy");
  });

  it("allows a task retry when review is off, and still honors the smaller delivery cap", () => {
    const open = {
      responses: [{ taskId: "t1", attempt: 1 }],
      deliveryAdministration: { reviewAllowed: false, attempts: 3 },
    };
    expect(evaluateAttempt(open, "t1", { taskMaxAttempts: 2 })).toMatchObject({
      ok: true,
      action: "replace",
      nextAttempt: 2,
    });

    const spentDelivery = {
      responses: [{ taskId: "t1", attempt: 2 }],
      deliveryAdministration: { reviewAllowed: true, attempts: 2 },
    };
    expect(evaluateAttempt(spentDelivery, "t1", { taskMaxAttempts: 5 }).code).toBe(
      "attempts_exhausted"
    );
  });
});

describe("feedback redaction", () => {
  const session = {
    id: "s1",
    status: "in_progress",
    isCompleted: false,
    studentModel: { irtTheta: 1.2 },
    assemblyProgress: { assemblyModelId: "am", delivered: 1 },
    deliveryAdministration: { feedbackMode: "none", attempts: 1 },
    responses: [{
      taskId: "t1",
      rawAnswer: "opt_a",
      activated: true,
      rationale: "Correct.",
      scoredValue: 1,
      feedback: { text: "Check the units.", rule: "byOption", key: "opt_a" },
    }],
  };
  const student = { role: "student", username: "stud1" };
  const teacher = { role: "teacher", username: "teach1" };

  it("hides scores from a student and leaves the stored session and the staff view intact", () => {
    const view = presentSession(session, student);
    expect(view.responses[0].rawAnswer).toBe("opt_a");
    expect(view.responses[0].activated).toBeUndefined();
    expect(view.responses[0].rationale).toBeUndefined();
    expect(view.responses[0].scoredValue).toBeUndefined();
    expect(view.responses[0].feedback).toBeUndefined();
    expect(view.studentModel).toBeUndefined();
    expect(view.assemblyProgress).toBeUndefined();
    expect(view.deliveryTiming.feedbackMode).toBe("none");
    expect(session.responses[0].activated).toBe(true);
    expect(session.studentModel.irtTheta).toBe(1.2);

    const staff = presentSession(session, teacher);
    expect(staff.responses[0].activated).toBe(true);
    expect(staff.responses[0].feedback.text).toBe("Check the units.");
    expect(staff.studentModel.irtTheta).toBe(1.2);
  });

  it("shows immediate feedback and withholds delayed feedback until the session is closed", () => {
    const immediate = presentSession(
      { ...session, deliveryAdministration: { feedbackMode: "immediate" } },
      student
    );
    expect(immediate.responses[0].activated).toBe(true);
    expect(immediate.responses[0].feedback.text).toBe("Check the units.");
    const delayed = presentSession(
      { ...session, deliveryAdministration: { feedbackMode: "delayed_end" } },
      student
    );
    expect(delayed.responses[0].activated).toBeUndefined();
    expect(delayed.responses[0].feedback).toBeUndefined();
    const released = presentSession(
      { ...session, status: "submitted", isCompleted: true, deliveryAdministration: { feedbackMode: "delayed_end" } },
      student
    );
    expect(released.responses[0].activated).toBe(true);
    expect(released.responses[0].feedback.text).toBe("Check the units.");
    const unstamped = { id: "plain", responses: [{ activated: true }] };
    expect(presentSession(unstamped, student)).toBe(unstamped);
  });

  it("returns the same object when there is no stamp", () => {
    const plain = { id: "s", responses: [{ activated: true }] };
    expect(presentSession(plain, student)).toBe(plain);
  });
});

describe("list projection", () => {
  it("keeps deliveryAdministration on catalog lists and omits it from the rating queue", () => {
    const doc = {
      id: "s",
      studentId: "stu",
      deliveryAdministration: { attempts: 1, feedbackMode: "none" },
      studentModel: { irtTheta: 0 },
      responses: [{ taskId: "t1", rationale: "secret", evaluationStatus: "pending_human" }],
    };
    const summary = catalogListSummary(doc);
    expect(summary.deliveryAdministration.attempts).toBe(1);
    expect(summary.responses).toBeUndefined();
    expect(summary.studentModel).toBeUndefined();
    expect(summary.responseCount).toBe(1);
    expect(summary.answeredTaskIds).toEqual(["t1"]);
    expect(projectSession(doc, CATALOG_SUMMARY_PROJECTION).deliveryAdministration.attempts).toBe(1);
    const queued = projectSession(doc, RATING_QUEUE_PROJECTION);
    expect(queued.deliveryAdministration).toBeUndefined();
    expect(queued.responses[0].rationale).toBeUndefined();
    expect(queued.responses[0].taskId).toBe("t1");
  });
});

describe("mongo session store", () => {
  const run = process.env.MONGO_URI ? it : it.skip;

  run("round-trips a delivery administration stamp and lists it", async () => {
    const previous = process.env.SESSIONS_BACKEND;
    process.env.SESSIONS_BACKEND = "mongo";
    const { resetSessionStoreForTests, upsertSessions, getSessionById, querySessions } = await import("../../sessions/sessionRepository.js");
    const { mongoRemove } = await import("../../sessions/mongoSessionStore.js");
    resetSessionStoreForTests();
    const source = {
      id: "mongo-admin-s",
      studentId: "a",
      status: "in_progress",
      responses: [],
      studentModel: { smvPosteriors: {} },
      deliveryAdministration: {
        timeLimitMinutes: 20,
        attempts: 1,
        reviewAllowed: false,
        feedbackMode: "none",
        timeMultiplier: 1,
        extraTimeMinutes: 0,
        pausedMs: 0,
        clockStartedAt: null,
        pauseStartedAt: null,
        effectiveDeadline: null,
      },
    };
    try {
      await upsertSessions([source]);
      const got = await getSessionById({ students: [], users: [] }, source.id);
      expect(got.deliveryAdministration.attempts).toBe(1);
      expect(canonicalSession(got)).toBe(canonicalSession(source));
      const listed = await querySessions(
        { students: [], users: [] },
        { id: source.id },
        { projection: CATALOG_SUMMARY_PROJECTION }
      );
      expect(listed[0].deliveryAdministration.feedbackMode).toBe("none");
      expect(listed[0].deliveryAdministration.reviewAllowed).toBe(false);
      expect(listed[0].studentModel).toBeUndefined();
    } finally {
      await mongoRemove(source.id);
      resetSessionStoreForTests();
      if (previous === undefined) delete process.env.SESSIONS_BACKEND;
      else process.env.SESSIONS_BACKEND = previous;
    }
  });
});
