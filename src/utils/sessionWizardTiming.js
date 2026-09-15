// Wizard phase timing for student Session Play
// (Draft → Review → Completed → Submit). Server stores
// `session.wizardPhaseTimings`; the client displays and advances phases.

export const WIZARD_TIMING_PHASES = Object.freeze([
  "draft",
  "review",
  "completed",
  "submitted",
]);

export function emptyPhaseTimings() {
  const out = {};
  for (const id of WIZARD_TIMING_PHASES) {
    out[id] = { startedAt: null, endedAt: null, durationMs: null };
  }
  return out;
}

function isoOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function withDuration(row) {
  const startedAt = row.startedAt || null;
  const endedAt = row.endedAt || null;
  let durationMs = null;
  if (startedAt && endedAt) {
    durationMs = Math.max(
      0,
      new Date(endedAt).getTime() - new Date(startedAt).getTime()
    );
  }
  return { startedAt, endedAt, durationMs };
}

/** Normalize any stored/posted timings blob into the canonical shape. */
export function normalizePhaseTimings(raw) {
  const base = emptyPhaseTimings();
  if (!raw || typeof raw !== "object") return base;
  for (const id of WIZARD_TIMING_PHASES) {
    const row = raw[id];
    if (!row || typeof row !== "object") continue;
    base[id] = withDuration({
      startedAt: isoOrNull(row.startedAt),
      endedAt: isoOrNull(row.endedAt),
    });
  }
  return base;
}

/** Split milliseconds into hours, minutes, seconds (floored). */
export function durationParts(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1_000);
  return { hours, minutes, seconds, totalMs: total };
}

export function formatDurationHms(ms) {
  const { hours, minutes, seconds } = durationParts(ms);
  return `${hours}h ${minutes}m ${seconds}s`;
}

export function formatClockTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function phaseElapsedMs(row, nowMs = Date.now()) {
  if (!row?.startedAt) return 0;
  if (Number.isFinite(row.durationMs) && row.endedAt) {
    return Math.max(0, row.durationMs);
  }
  const start = new Date(row.startedAt).getTime();
  if (Number.isNaN(start)) return 0;
  const end = row.endedAt ? new Date(row.endedAt).getTime() : nowMs;
  if (Number.isNaN(end)) return 0;
  return Math.max(0, end - start);
}

/**
 * Ensure `phase` has a startedAt; close the previous open phase when
 * advancing. Returns a new timings object (does not mutate).
 */
export function syncPhaseTimings(timings, phase, atIso = new Date().toISOString()) {
  const next = normalizePhaseTimings(timings);
  const at = isoOrNull(atIso) || new Date().toISOString();
  if (!phase || !WIZARD_TIMING_PHASES.includes(phase)) return next;

  const idx = WIZARD_TIMING_PHASES.indexOf(phase);
  for (let i = 0; i < idx; i++) {
    const id = WIZARD_TIMING_PHASES[i];
    if (next[id].startedAt && !next[id].endedAt) {
      next[id] = withDuration({ startedAt: next[id].startedAt, endedAt: at });
    }
  }
  if (!next[phase].startedAt) {
    next[phase] = withDuration({
      startedAt: at,
      endedAt: next[phase].endedAt,
    });
  }
  return next;
}

/** Close the named phase (e.g. on Submit). */
export function closePhaseTiming(timings, phase, atIso = new Date().toISOString()) {
  const at = isoOrNull(atIso) || new Date().toISOString();
  const next = syncPhaseTimings(timings, phase, at);
  if (phase && next[phase]) {
    next[phase] = withDuration({
      startedAt: next[phase].startedAt || at,
      endedAt: at,
    });
  }
  return next;
}

/** Recover which wizard phase the student was in from persisted timings. */
export function inferWizardPhase(timings, sessionClosed = false) {
  if (sessionClosed) return "submitted";
  const normalized = normalizePhaseTimings(timings);
  for (let i = WIZARD_TIMING_PHASES.length - 1; i >= 0; i--) {
    const id = WIZARD_TIMING_PHASES[i];
    if (normalized[id].startedAt && !normalized[id].endedAt) return id;
  }
  for (let i = WIZARD_TIMING_PHASES.length - 1; i >= 0; i--) {
    const id = WIZARD_TIMING_PHASES[i];
    if (normalized[id].startedAt) return id;
  }
  return "draft";
}

/** Apply a timing advance on a session object (mutates and returns it). */
export function applyWizardTimingToSession(
  session,
  { phase, close = false, atIso = new Date().toISOString() } = {}
) {
  if (!session) return session;
  let timings = normalizePhaseTimings(session.wizardPhaseTimings);
  const active = phase || inferWizardPhase(timings, false);
  timings = close
    ? closePhaseTiming(timings, active, atIso)
    : syncPhaseTimings(timings, active, atIso);
  session.wizardPhaseTimings = timings;
  session.wizardPhase = close && active === "submitted" ? "submitted" : active;
  return session;
}
