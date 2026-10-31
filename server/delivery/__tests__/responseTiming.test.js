import { describe, expect, it } from "vitest";
import {
  RESPONSE_TIMING_RULE,
  classifyRapidGuess,
  configuredMinimumMs,
  noteItemPresentation,
  peerTimesForItem,
  rapidGuessSummary,
  rapidGuessThresholdMs,
  taskResponseTiming,
  timingFieldsForSubmit,
  timingForReport,
} from "../responseTiming.js";

const T0 = new Date("2026-10-31T12:00:00.000Z");

function at(ms) {
  return new Date(T0.getTime() + ms);
}

function withFlag(fields, { peerTimesMs, minimumMs } = {}) {
  if (!fields) return null;
  const threshold = rapidGuessThresholdMs({ peerTimesMs, minimumMs });
  return { ...fields, ...classifyRapidGuess(fields.timeOnItemMs, threshold) };
}

describe("rapid-guess classification", () => {
  it("uses the 3 s floor until five peer times exist", () => {
    const threshold = rapidGuessThresholdMs({
      peerTimesMs: [1000, 2000, 8000, 9000],
    });
    expect(threshold).toMatchObject({
      thresholdMs: RESPONSE_TIMING_RULE.floorMs,
      basis: "floor",
      ruleId: "normative-threshold-v1",
      peerCount: 4,
    });
    expect(classifyRapidGuess(RESPONSE_TIMING_RULE.floorMs - 1, threshold)).toMatchObject({
      rapidGuess: true,
      rapidGuessStatus: "rapid",
    });
    expect(classifyRapidGuess(RESPONSE_TIMING_RULE.floorMs, threshold)).toMatchObject({
      rapidGuess: false,
      rapidGuessStatus: "engaged",
    });
  });

  it("sets the threshold at 10% of the median, then the cap", () => {
    const median = rapidGuessThresholdMs({
      peerTimesMs: [40000, 50000, 60000, 70000, 80000],
    });
    expect(median).toMatchObject({
      thresholdMs: 6000,
      basis: "median",
      medianMs: 60000,
      peerCount: 5,
    });

    const even = rapidGuessThresholdMs({
      peerTimesMs: [20000, 40000, 60000, 80000, 100000, 120000],
    });
    expect(even.medianMs).toBe(70000);
    expect(even.thresholdMs).toBe(7000);

    const capped = rapidGuessThresholdMs({
      peerTimesMs: [100000, 110000, 120000, 130000, 140000],
    });
    expect(capped).toMatchObject({
      thresholdMs: RESPONSE_TIMING_RULE.capMs,
      basis: "cap",
      medianMs: 120000,
    });
  });

  it("lets a per-item minimum raise the floor and ignores a lower one", () => {
    expect(configuredMinimumMs(
      { rapidGuessMinimumMs: 4000 },
      { taskStructure: { timingConstraint: { minimumResponseMs: 8000, timeLimitSeconds: 60 } } }
    )).toBe(8000);
    expect(configuredMinimumMs({ rapidGuessMinimumMs: 1000 }, null)).toBe(1000);

    const raised = rapidGuessThresholdMs({ minimumMs: 8000, peerTimesMs: [] });
    expect(raised).toMatchObject({ thresholdMs: 8000, basis: "item-minimum" });

    const notLowered = rapidGuessThresholdMs({ minimumMs: 1000, peerTimesMs: [] });
    expect(notLowered).toMatchObject({
      thresholdMs: RESPONSE_TIMING_RULE.floorMs,
      basis: "floor",
    });

    const medianBound = rapidGuessThresholdMs({
      minimumMs: 8000,
      peerTimesMs: [20000, 40000, 60000, 80000, 100000],
    });
    expect(medianBound).toMatchObject({ thresholdMs: 8000, basis: "item-minimum" });
  });

  it("does not classify a missing time as a rapid guess", () => {
    const threshold = rapidGuessThresholdMs({});
    expect(classifyRapidGuess(null, threshold).rapidGuess).toBeNull();
    expect(classifyRapidGuess(undefined, threshold).rapidGuessStatus).toBe("unknown");
    expect(classifyRapidGuess(-1, threshold).rapidGuess).toBeNull();
    expect(classifyRapidGuess(1000, {}).rapidGuess).toBeNull();
  });
});

describe("timing capture and accumulation", () => {
  it("subtracts plausible hidden time and refuses an inflated client time", () => {
    const session = { id: "s1", responses: [] };
    noteItemPresentation(session, { taskId: "t1", now: T0 });
    const hidden = timingFieldsForSubmit(session, {
      taskId: "t1",
      hiddenMs: 2000,
      visibleMs: 3000,
      now: at(10000),
    });
    expect(hidden.timeOnItemMs).toBe(3000);

    const inflated = { id: "s2", responses: [] };
    noteItemPresentation(inflated, { taskId: "t1", now: T0 });
    expect(timingFieldsForSubmit(inflated, {
      taskId: "t1",
      visibleMs: 999999,
      hiddenMs: 999999,
      now: at(4000),
    }).timeOnItemMs).toBe(4000);
  });

  it("keeps the first server presentedAt and accumulates a revisit", () => {
    const session = { id: "s1", responses: [] };
    const first = noteItemPresentation(session, {
      taskId: "t1",
      clientPresentedAt: "2026-10-31T12:00:00.100Z",
      now: T0,
    });
    expect(first).toMatchObject({
      presentedAt: T0.toISOString(),
      presentedAtSource: "server",
      clientPresentedAt: "2026-10-31T12:00:00.100Z",
    });

    const again = noteItemPresentation(session, {
      taskId: "t1",
      clientPresentedAt: "2026-10-31T12:00:01.000Z",
      now: at(1000),
    });
    expect(again.presentedAt).toBe(T0.toISOString());
    expect(again.openPresentedAt).toBe(T0.toISOString());
    expect(taskResponseTiming(session, "t1", at(1000)).openElapsedMs).toBe(1000);

    const submitted = timingFieldsForSubmit(session, {
      taskId: "t1",
      visibleMs: 10000,
      hiddenMs: 0,
      now: at(10000),
      priorResponses: [],
    });
    expect(withFlag(submitted)).toMatchObject({
      presentedAt: T0.toISOString(),
      presentedAtSource: "server",
      clientPresentedAt: "2026-10-31T12:00:00.100Z",
      timeOnItemMs: 10000,
      timeOnItemSource: "server",
      rapidGuess: false,
      rapidGuessBasis: "floor",
    });
    expect(taskResponseTiming(session, "t1").openPresentedAt).toBeNull();
    expect(taskResponseTiming(session, "t1").accruedMs).toBe(0);

    noteItemPresentation(session, { taskId: "t1", now: at(20000) });
    const revisited = timingFieldsForSubmit(session, {
      taskId: "t1",
      hiddenMs: 1000,
      visibleMs: 3000,
      now: at(24000),
      priorResponses: [{ taskId: "t1", timeOnItemMs: submitted.timeOnItemMs }],
    });
    expect(revisited.presentedAt).toBe(T0.toISOString());
    expect(revisited.timeOnItemMs).toBe(13000);
    expect(revisited.timeOnItemSource).toBe("server");
    expect(withFlag(revisited).rapidGuess).toBe(false);
  });

  it("accumulates a visit that was closed by moving to another task", () => {
    const session = { id: "s1", responses: [] };
    noteItemPresentation(session, { taskId: "t1", now: T0 });
    noteItemPresentation(session, {
      taskId: "t2",
      now: at(10000),
      leaving: { taskId: "t1", hiddenMs: 2000, visibleMs: 8000 },
    });
    expect(taskResponseTiming(session, "t1").accruedMs).toBe(8000);
    expect(taskResponseTiming(session, "t1").openPresentedAt).toBeNull();

    noteItemPresentation(session, { taskId: "t1", now: at(20000) });
    const fields = timingFieldsForSubmit(session, {
      taskId: "t1",
      visibleMs: 5000,
      hiddenMs: 0,
      now: at(25000),
    });
    expect(fields.timeOnItemMs).toBe(13000);
    expect(fields.presentedAtSource).toBe("server");
    expect(taskResponseTiming(session, "t2").accruedMs).toBe(10000);
  });

  it("uses the client timestamp when the server never saw a presentation", () => {
    const session = { id: "s1", responses: [] };
    const fields = timingFieldsForSubmit(session, {
      taskId: "t1",
      clientPresentedAt: "2026-10-31T12:00:00.000Z",
      visibleMs: 1200,
      hiddenMs: 400,
      now: at(5000),
    });
    expect(withFlag(fields)).toMatchObject({
      presentedAt: "2026-10-31T12:00:00.000Z",
      presentedAtSource: "client",
      timeOnItemMs: 1200,
      timeOnItemSource: "client",
      rapidGuess: true,
    });
    expect(session.responseTiming).toBeUndefined();
  });

  it("omits timing when neither clock has a measurement", () => {
    const session = { id: "s1", responses: [] };
    expect(timingFieldsForSubmit(session, { taskId: "t1", now: T0 })).toBeNull();
  });

  it("counts one peer time per session and task", () => {
    const times = peerTimesForItem([
      {
        id: "s-other",
        responses: [
          { taskId: "t1", itemId: "item1", timeOnItemMs: 4000 },
          { taskId: "t1", itemId: "item1", timeOnItemMs: 4000 },
          { taskId: "t2", itemId: "item1", timeOnItemMs: 9000 },
        ],
      },
      { id: "s1", responses: [{ taskId: "t1", itemId: "item1", timeOnItemMs: 100 }] },
      { id: "s-blank", responses: [{ taskId: "t9", itemId: "item1" }] },
    ], "item1", "s1");
    expect(times).toEqual([4000, 9000]);
  });
});

describe("legacy responses", () => {
  it("renders a missing time as unknown, even if a rapid-guess flag is stored", () => {
    expect(timingForReport({ taskId: "t-old", rapidGuess: true })).toMatchObject({
      timeOnItemMs: null,
      rapidGuess: null,
      rapidGuessStatus: "unknown",
    });
    expect(timingForReport({ taskId: "t-time", timeOnItemMs: 500 })).toMatchObject({
      timeOnItemMs: 500,
      rapidGuess: null,
      rapidGuessStatus: "unknown",
    });
    expect(timingForReport({
      taskId: "t-rapid",
      timeOnItemMs: 500,
      rapidGuess: true,
      presentedAt: "2026-10-31T12:00:00.000Z",
    })).toMatchObject({
      rapidGuess: true,
      rapidGuessStatus: "rapid",
    });
  });

  it("excludes unknown responses from the rapid-guess rate", () => {
    const summary = rapidGuessSummary([
      { taskId: "t1", timeOnItemMs: 500, rapidGuess: true },
      { taskId: "t1", timeOnItemMs: 500, rapidGuess: true },
      { taskId: "t2", timeOnItemMs: 9000, rapidGuess: false },
      { taskId: "t3", rapidGuess: true },
      { taskId: "t4" },
    ]);
    expect(summary).toMatchObject({
      rapidGuessCount: 1,
      timedResponseCount: 2,
      unknownResponseCount: 2,
      rapidGuessRate: 0.5,
      ruleId: RESPONSE_TIMING_RULE.id,
    });

    expect(rapidGuessSummary([{ taskId: "t-old" }])).toMatchObject({
      rapidGuessRate: null,
      timedResponseCount: 0,
      unknownResponseCount: 1,
    });
  });
});
