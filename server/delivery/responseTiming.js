// TU9 / T18. Optional response timing. Absent fields keep today's behaviour.
//
// presentedAt is the server clock of the first POST /present for that task.
// clientPresentedAt is stored beside it when the client sends one. A submit
// that never presented falls back to the client timestamp and is labeled
// presentedAtSource "client".
//
// timeOnItemMs sums visible time across visits. Leaving an item and coming
// back adds to the same total, including the time already stored on a
// replaced response. Tab-hidden milliseconds are removed when the client
// reports them inside the server-measured visit (plus clientSlackMs). A
// client visibleMs figure cannot raise the total above that server window.
//
// Rapid-guess rule "normative-threshold-v1" (Wise and Ma 2012, adapted):
//   threshold = min(capMs, max(floorMs, medianFraction * median))
//   medianFraction 0.10, floorMs 3000, capMs 10000.
// The median is other sessions' timeOnItemMs for the same itemId. One
// time per session and task, so multi-observable rows are not counted
// twice. Fewer than minMedianSample peers and the threshold is the floor.
// An optional per-item minimum replaces that floor when it is higher:
//   item.rapidGuessMinimumMs
//   taskModel.taskStructure.timingConstraint.minimumResponseMs
// The 10 s cap bounds the percentage. An authored minimum above 10 s is
// kept. This module does not enforce timingConstraint.timeLimitSeconds
// or maxAttempts. TU10 reads taskResponseTiming and the response fields
// from server/delivery/taskConstraints.js. The limit uses the open visit's
// wall time. Rapid-guess timeOnItemMs still drops tab-hidden time.
//
// A response with no finite timeOnItemMs is not a rapid guess. The teacher
// report renders that as unknown, including a stored rapidGuess flag with
// no time.

export const RESPONSE_TIMING_RULE = Object.freeze({
  id: "normative-threshold-v1",
  medianFraction: 0.1,
  floorMs: 3000,
  capMs: 10000,
  minMedianSample: 5,
  clientSlackMs: 1500,
  summary:
    "10% of the median time on this item, with a 3 s floor and a 10 s cap. A higher per-item minimum replaces the floor.",
});

function finiteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function asDate(now) {
  if (now instanceof Date && !Number.isNaN(now.getTime())) return now;
  const parsed = now != null ? new Date(now) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function isoOrNull(value) {
  if (typeof value !== "string" || value === "") return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function configuredMinimumMs(item, taskModel) {
  const candidates = [
    item?.rapidGuessMinimumMs,
    taskModel?.taskStructure?.timingConstraint?.minimumResponseMs,
  ];
  let best = null;
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      best = best == null ? value : Math.max(best, value);
    }
  }
  return best;
}

export function rapidGuessThresholdMs({ peerTimesMs = [], minimumMs = null } = {}) {
  const configured =
    typeof minimumMs === "number" && Number.isFinite(minimumMs) && minimumMs > 0
      ? minimumMs
      : null;
  const floor = Math.max(RESPONSE_TIMING_RULE.floorMs, configured || 0);
  const raised = configured != null && configured > RESPONSE_TIMING_RULE.floorMs;
  const peers = (peerTimesMs || []).filter((value) => finiteNonNegative(value));
  const base = {
    ruleId: RESPONSE_TIMING_RULE.id,
    peerCount: peers.length,
    medianMs: null,
  };
  if (peers.length < RESPONSE_TIMING_RULE.minMedianSample) {
    return {
      ...base,
      thresholdMs: floor,
      basis: raised ? "item-minimum" : "floor",
    };
  }
  const medianMs = medianOf(peers);
  const scaled = RESPONSE_TIMING_RULE.medianFraction * medianMs;
  if (floor > RESPONSE_TIMING_RULE.capMs) {
    return { ...base, thresholdMs: floor, basis: "item-minimum", medianMs };
  }
  if (scaled > RESPONSE_TIMING_RULE.capMs) {
    return {
      ...base,
      thresholdMs: RESPONSE_TIMING_RULE.capMs,
      basis: "cap",
      medianMs,
    };
  }
  if (scaled < floor) {
    return {
      ...base,
      thresholdMs: floor,
      basis: raised ? "item-minimum" : "floor",
      medianMs,
    };
  }
  return { ...base, thresholdMs: scaled, basis: "median", medianMs };
}

export function classifyRapidGuess(timeOnItemMs, threshold) {
  const thresholdMs = threshold?.thresholdMs;
  const knownThreshold = typeof thresholdMs === "number" && Number.isFinite(thresholdMs);
  const knownTime = finiteNonNegative(timeOnItemMs);
  if (!knownTime || !knownThreshold) {
    return {
      rapidGuess: null,
      rapidGuessStatus: "unknown",
      rapidGuessThresholdMs: knownThreshold ? thresholdMs : null,
      rapidGuessBasis: threshold?.basis || null,
      rapidGuessRule: RESPONSE_TIMING_RULE.id,
    };
  }
  const rapid = timeOnItemMs < thresholdMs;
  return {
    rapidGuess: rapid,
    rapidGuessStatus: rapid ? "rapid" : "engaged",
    rapidGuessThresholdMs: thresholdMs,
    rapidGuessBasis: threshold?.basis || null,
    rapidGuessRule: RESPONSE_TIMING_RULE.id,
    ...(threshold?.medianMs != null ? { rapidGuessMedianMs: threshold.medianMs } : {}),
  };
}

export function peerTimesForItem(sessions, itemId, excludeSessionId) {
  if (!itemId) return [];
  const times = [];
  const seen = new Set();
  for (const session of sessions || []) {
    if (!session || (excludeSessionId != null && session.id === excludeSessionId)) continue;
    for (const row of session.responses || []) {
      if (!row || row.itemId !== itemId) continue;
      if (!finiteNonNegative(row.timeOnItemMs)) continue;
      const key = `${session.id}:${row.taskId || row.itemId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      times.push(row.timeOnItemMs);
    }
  }
  return times;
}

function blankTask() {
  return {
    presentedAt: null,
    clientPresentedAt: null,
    presentedAtSource: null,
    accruedMs: 0,
    open: null,
  };
}

function responseTimingState(session) {
  if (!session || typeof session !== "object") return null;
  if (
    !session.responseTiming ||
    typeof session.responseTiming !== "object" ||
    Array.isArray(session.responseTiming)
  ) {
    session.responseTiming = { tasks: {} };
  }
  if (
    !session.responseTiming.tasks ||
    typeof session.responseTiming.tasks !== "object" ||
    Array.isArray(session.responseTiming.tasks)
  ) {
    session.responseTiming.tasks = {};
  }
  return session.responseTiming;
}

function taskTiming(state, taskId) {
  if (!state.tasks[taskId]) state.tasks[taskId] = blankTask();
  return state.tasks[taskId];
}

function trustedVisibleMs(elapsedMs, { hiddenMs, visibleMs } = {}) {
  const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const slack = RESPONSE_TIMING_RULE.clientSlackMs;
  let hidden = 0;
  if (finiteNonNegative(hiddenMs) && hiddenMs <= elapsed + slack) {
    hidden = Math.min(hiddenMs, elapsed);
  }
  let visible = elapsed - hidden;
  if (finiteNonNegative(visibleMs) && visibleMs <= elapsed + slack) {
    visible = Math.min(visible, visibleMs);
  }
  return Math.round(Math.max(0, visible));
}

function closeOpenVisit(task, now, client = {}) {
  if (!task?.open?.presentedAt) return 0;
  const started = Date.parse(task.open.presentedAt);
  const elapsed = Number.isNaN(started) ? 0 : Math.max(0, now.getTime() - started);
  const visible = trustedVisibleMs(elapsed, client);
  task.accruedMs = Math.round((finiteNonNegative(task.accruedMs) ? task.accruedMs : 0) + visible);
  task.open = null;
  return visible;
}

export function noteItemPresentation(session, {
  taskId,
  clientPresentedAt,
  leaving,
  now = new Date(),
} = {}) {
  if (!session || typeof taskId !== "string" || taskId === "") {
    return { ok: false, error: "taskId is required" };
  }
  const state = responseTimingState(session);
  const when = asDate(now);
  const clientIso = isoOrNull(clientPresentedAt);

  if (leaving && typeof leaving === "object" && !Array.isArray(leaving)) {
    const leavingId = leaving.taskId;
    if (typeof leavingId === "string" && leavingId && leavingId !== taskId && state.tasks[leavingId]?.open) {
      closeOpenVisit(state.tasks[leavingId], when, leaving);
    }
  }

  for (const [id, task] of Object.entries(state.tasks)) {
    if (id !== taskId && task?.open) closeOpenVisit(task, when, {});
  }

  const task = taskTiming(state, taskId);
  if (!task.presentedAt) {
    task.presentedAt = when.toISOString();
    task.presentedAtSource = "server";
  }
  if (clientIso && !task.clientPresentedAt) task.clientPresentedAt = clientIso;

  if (task.open?.presentedAt) {
    if (clientIso && !task.open.clientPresentedAt) task.open.clientPresentedAt = clientIso;
  } else {
    task.open = {
      presentedAt: when.toISOString(),
      clientPresentedAt: clientIso,
    };
  }

  return {
    ok: true,
    taskId,
    presentedAt: task.presentedAt,
    clientPresentedAt: task.clientPresentedAt,
    presentedAtSource: task.presentedAtSource,
    openPresentedAt: task.open.presentedAt,
  };
}

function priorTimeOnItemMs(responses, taskId) {
  let max = 0;
  let found = false;
  for (const row of responses || []) {
    if (!row || row.taskId !== taskId) continue;
    if (!finiteNonNegative(row.timeOnItemMs)) continue;
    found = true;
    if (row.timeOnItemMs > max) max = row.timeOnItemMs;
  }
  return found ? max : 0;
}

export function timingFieldsForSubmit(session, {
  taskId,
  clientPresentedAt,
  visibleMs,
  hiddenMs,
  now = new Date(),
  priorResponses = null,
} = {}) {
  const when = asDate(now);
  const task = session?.responseTiming?.tasks?.[taskId] || null;
  const clientIso = isoOrNull(clientPresentedAt);
  const priorMs = priorTimeOnItemMs(priorResponses ?? session?.responses, taskId);
  const hadOpen = Boolean(task?.open?.presentedAt);

  if (hadOpen) closeOpenVisit(task, when, { hiddenMs, visibleMs });

  const accrued = task && finiteNonNegative(task.accruedMs) ? task.accruedMs : 0;
  let visitMs = 0;
  let timeOnItemSource = null;

  if (hadOpen || accrued > 0) {
    visitMs = accrued;
    timeOnItemSource = "server";
  } else if (finiteNonNegative(visibleMs)) {
    visitMs = visibleMs;
    timeOnItemSource = "client";
  } else if (!(priorMs > 0 && (task?.presentedAt || clientIso))) {
    return null;
  }

  if (task) {
    task.accruedMs = 0;
    task.open = null;
    if (clientIso && !task.clientPresentedAt) task.clientPresentedAt = clientIso;
  }

  const presentedAt = task?.presentedAt || clientIso || null;
  if (!presentedAt && visitMs === 0 && priorMs === 0) return null;

  const presentedAtSource = task?.presentedAt
    ? (task.presentedAtSource || "server")
    : (clientIso ? "client" : null);
  const storedClient = task?.clientPresentedAt || clientIso || null;
  const timeOnItemMs = Math.round(visitMs + priorMs);

  return {
    ...(presentedAt ? { presentedAt, presentedAtSource } : {}),
    ...(storedClient ? { clientPresentedAt: storedClient } : {}),
    timeOnItemMs,
    timeOnItemSource,
  };
}

export function taskResponseTiming(session, taskId, now = new Date()) {
  const task = session?.responseTiming?.tasks?.[taskId];
  if (!task) return null;
  const when = asDate(now);
  let openElapsedMs = null;
  if (task.open?.presentedAt) {
    const started = Date.parse(task.open.presentedAt);
    openElapsedMs = Number.isNaN(started) ? null : Math.max(0, when.getTime() - started);
  }
  return {
    presentedAt: task.presentedAt || null,
    clientPresentedAt: task.clientPresentedAt || null,
    presentedAtSource: task.presentedAtSource || null,
    accruedMs: finiteNonNegative(task.accruedMs) ? task.accruedMs : 0,
    openPresentedAt: task.open?.presentedAt || null,
    openElapsedMs,
  };
}

export function timingForReport(response) {
  const presentedAt = isoOrNull(response?.presentedAt);
  const clientPresentedAt = isoOrNull(response?.clientPresentedAt);
  const hasTime = finiteNonNegative(response?.timeOnItemMs);
  const flag = response?.rapidGuess;
  const knownFlag = flag === true || flag === false;
  if (!hasTime || !knownFlag) {
    return {
      presentedAt,
      clientPresentedAt,
      presentedAtSource: response?.presentedAtSource || null,
      timeOnItemMs: hasTime ? response.timeOnItemMs : null,
      timeOnItemSource: response?.timeOnItemSource || null,
      rapidGuess: null,
      rapidGuessStatus: "unknown",
    };
  }
  return {
    presentedAt,
    clientPresentedAt,
    presentedAtSource: response.presentedAtSource || null,
    timeOnItemMs: response.timeOnItemMs,
    timeOnItemSource: response.timeOnItemSource || null,
    rapidGuess: flag,
    rapidGuessStatus: flag ? "rapid" : "engaged",
    rapidGuessThresholdMs: finiteNonNegative(response.rapidGuessThresholdMs)
      ? response.rapidGuessThresholdMs
      : null,
    rapidGuessBasis: response.rapidGuessBasis || null,
    rapidGuessRule: response.rapidGuessRule || RESPONSE_TIMING_RULE.id,
  };
}

export function rapidGuessSummary(responses) {
  const byTask = new Map();
  for (const row of responses || []) {
    const key = row?.taskId || row?.itemId || `row-${byTask.size}`;
    if (!byTask.has(key)) byTask.set(key, timingForReport(row));
  }
  let rapidGuessCount = 0;
  let timedResponseCount = 0;
  let unknownResponseCount = 0;
  for (const timing of byTask.values()) {
    if (timing.rapidGuess !== true && timing.rapidGuess !== false) {
      unknownResponseCount += 1;
      continue;
    }
    timedResponseCount += 1;
    if (timing.rapidGuess) rapidGuessCount += 1;
  }
  return {
    rapidGuessCount,
    timedResponseCount,
    unknownResponseCount,
    rapidGuessRate: timedResponseCount === 0 ? null : rapidGuessCount / timedResponseCount,
    ruleId: RESPONSE_TIMING_RULE.id,
    floorMs: RESPONSE_TIMING_RULE.floorMs,
    capMs: RESPONSE_TIMING_RULE.capMs,
    medianFraction: RESPONSE_TIMING_RULE.medianFraction,
    ruleSummary: RESPONSE_TIMING_RULE.summary,
  };
}
