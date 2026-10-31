// TU10 / T19. Server authority for a task time limit and the timeout flag.
//
// Timeout policy "record-current-work":
// The clock is the server presentation visit (TU9 taskResponseTiming):
// accrued closed visits, plus the open visit's wall time, plus time already
// stored on this task's response. It is not scaled by an accommodation
// factor. deliveryAdministration.taskTimeLimits[taskId] is used as stored
// when that key is a positive number. Otherwise the raw
// timingConstraint.timeLimitSeconds is the limit. No positive limit, or no
// server present clock, means today's submit.
//
// Elapsed time strictly greater than the limit is late. Equal to the limit
// is on time, and the response is not flagged.
//
// A late submit with no stored response for that task is accepted and
// scored, including an empty answer. Every row from that submit gets
// timedOut, timeoutPolicy, taskTimeLimitSeconds, and taskTimeLimitSource.
// A later submit is refused with 409 task_timed_out. The stored answer
// stays. The player auto-submits the current answer when its countdown
// reaches zero. The server decides the flag. A client timedOut field is
// ignored.
//
// Session pause does not freeze this clock. That matches TU9: pause stays
// on the delivery-administration deadline. The player does not auto-submit
// while the session is paused.
//
// Attempt caps are evaluateAttempt's taskMaxAttempts option. This file
// does not count them.

import { taskResponseTiming } from "./responseTiming.js";
import {
  TASK_TIMEOUT_POLICY,
  effectiveTaskTimeLimit,
  storedTaskTimeMs,
  taskLimitElapsedMs,
} from "../../src/utils/taskConstraints.js";

export { TASK_TIMEOUT_POLICY, effectiveTaskTimeLimit };

export function decideTaskSubmit({ session, taskId, taskModel, now = new Date() } = {}) {
  const limit = effectiveTaskTimeLimit(session, taskId, taskModel);
  if (!limit) return { enforced: false, timedOut: false, refuse: false, limit: null };

  const view = taskResponseTiming(session, taskId, now);
  const clockStarted = Boolean(view && (view.presentedAt || view.openPresentedAt));
  if (!clockStarted) {
    return { enforced: false, timedOut: false, refuse: false, limit };
  }

  const elapsedMs = taskLimitElapsedMs({
    accruedMs: view.accruedMs,
    openElapsedMs: view.openElapsedMs,
    storedMs: storedTaskTimeMs(session, taskId),
  });
  const late = elapsedMs > limit.limitMs;
  if (!late) {
    return { enforced: true, timedOut: false, refuse: false, elapsedMs, limit };
  }

  const hasResponse = (session?.responses || []).some((row) => row && row.taskId === taskId);
  if (hasResponse) {
    return {
      enforced: true,
      timedOut: true,
      refuse: true,
      status: 409,
      code: "task_timed_out",
      error: "Time for this task has expired. The recorded answer is locked.",
      elapsedMs,
      limit,
    };
  }

  return {
    enforced: true,
    timedOut: true,
    refuse: false,
    elapsedMs,
    limit,
  };
}

export function applyTaskTimeout(response, decision) {
  if (!response || decision?.timedOut !== true || !decision.limit) return response;
  response.timedOut = true;
  response.timeoutPolicy = TASK_TIMEOUT_POLICY;
  response.taskTimeLimitSeconds = decision.limit.seconds;
  response.taskTimeLimitSource = decision.limit.source;
  return response;
}
