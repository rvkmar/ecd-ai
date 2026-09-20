/**
 * D105 — in-process session-submit outcome counters for the four alerts.
 * Rolling window; process restart clears (alerts re-arm from live traffic).
 */
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** @type {{ at: number, ok: boolean }[]} */
let outcomes = [];

function prune(now = Date.now()) {
  const cutoff = now - WINDOW_MS;
  outcomes = outcomes.filter((o) => o.at >= cutoff);
}

export function recordSubmitOutcome(ok) {
  outcomes.push({ at: Date.now(), ok: !!ok });
  prune();
}

export function getSubmitStats() {
  prune();
  let ok = 0;
  let failed = 0;
  for (const o of outcomes) {
    if (o.ok) ok += 1;
    else failed += 1;
  }
  const total = ok + failed;
  return {
    windowMs: WINDOW_MS,
    ok,
    failed,
    total,
    errorRate: total === 0 ? 0 : failed / total,
  };
}

export const __testing__ = {
  reset() {
    outcomes = [];
  },
  push(at, ok) {
    outcomes.push({ at, ok: !!ok });
  },
};
