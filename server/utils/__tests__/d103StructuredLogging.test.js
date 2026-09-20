// server/utils/__tests__/d103StructuredLogging.test.js
//
// D103 exit check: one request id traces session submit from edge through
// scoring to persistence; no log call retains a response body or student name.

import { describe, it, expect, afterEach, vi } from "vitest";
import { logger, log, __testing__ } from "../logger.js";
import { runWithAudit } from "../auditContext.js";

const { setLogSink } = __testing__;

describe("D103 structured logging", () => {
  afterEach(() => {
    setLogSink();
    vi.unstubAllGlobals();
  });

  it("redacts response bodies and student names", () => {
    const lines = [];
    setLogSink((line) => lines.push(line));

    runWithAudit({ requestId: "req-redact", actor: null }, () => {
      log("info", "probe", {
        sessionId: "s1",
        name: "Alice Student",
        response: { selected: "opt_a", rawAnswer: "secret" },
        rawAnswer: "should-not-appear",
        email: "alice@school.test",
        itemId: "item1",
      });
    });

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.name).toBe("[REDACTED]");
    expect(parsed.response).toBe("[REDACTED]");
    expect(parsed.rawAnswer).toBe("[REDACTED]");
    expect(parsed.email).toBe("[REDACTED]");
    expect(parsed.sessionId).toBe("s1");
    expect(parsed.itemId).toBe("item1");
    expect(JSON.stringify(parsed)).not.toMatch(/Alice/);
    expect(JSON.stringify(parsed)).not.toMatch(/secret/);
  });

  it("includes the same requestId across submit start → scored → persisted", () => {
    const lines = [];
    setLogSink((line) => lines.push(line));

    runWithAudit(
      { requestId: "req-d103-trace", actor: { userId: "stud1", role: "student" } },
      () => {
        logger.info("session.submit.start", { sessionId: "s1", taskId: "t1" });
        logger.info("session.submit.scored", { sessionId: "s1", itemId: "i1" });
        logger.info("session.submit.persisted", { sessionId: "s1", responseCount: 1 });
      }
    );

    expect(lines).toHaveLength(3);
    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed.every((p) => p.requestId === "req-d103-trace")).toBe(true);
    expect(parsed.map((p) => p.event)).toEqual([
      "session.submit.start",
      "session.submit.scored",
      "session.submit.persisted",
    ]);
  });

  it("propagates request id into R client headers", async () => {
    const lines = [];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: "healthy" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();

    const { runWithAudit: runAudit } = await import("../auditContext.js");
    const { __testing__: logTesting } = await import("../logger.js");
    logTesting.setLogSink((line) => lines.push(line));
    const { getRHealth } = await import("../../r/rClient.js");

    await runAudit({ requestId: "req-d103-r", actor: null }, async () => {
      await getRHealth({ timeoutMs: 1000 });
    });

    expect(fetchMock).toHaveBeenCalled();
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers["X-Request-Id"]).toBe("req-d103-r");

    const rLogs = lines.map((l) => JSON.parse(l)).filter((p) => p.event === "r.request");
    expect(rLogs.length).toBeGreaterThanOrEqual(1);
    expect(rLogs[0].requestId).toBe("req-d103-r");
  });
});
