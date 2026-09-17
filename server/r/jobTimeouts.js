// server/r/jobTimeouts.js
// D86: per-job wall-clock timeout. Default 15 minutes; G-DINA (and other
// heavy calibrations) may override. A job that only aborts the HTTP client
// without reclaiming the R worker leaves the queue starved — see killRBackend.

export const DEFAULT_JOB_TIMEOUT_MS = 15 * 60 * 1000;

/** @type {Record<string, number>} */
const JOB_TIMEOUT_MS_BY_KIND = {
  "irt-parameters": DEFAULT_JOB_TIMEOUT_MS,
  "dina-parameters": 30 * 60 * 1000, // G-DINA on a large bank is not item analysis
  "ctt-statistics": DEFAULT_JOB_TIMEOUT_MS,
  "dif-analysis": DEFAULT_JOB_TIMEOUT_MS,
  equating: DEFAULT_JOB_TIMEOUT_MS,
  "item-analysis": 10 * 60 * 1000,
  "test-information": 10 * 60 * 1000,
  "attribute-profile-summary": 5 * 60 * 1000,
};

/**
 * Resolve wall-clock timeout for a job kind.
 * Precedence: explicit override → R_JOB_TIMEOUT_MS env → per-kind map → default.
 */
export function jobTimeoutMsForKind(kind, overrideMs) {
  if (Number.isFinite(overrideMs) && overrideMs > 0) return Math.floor(overrideMs);
  const fromEnv = Number(process.env.R_JOB_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);
  if (kind && Number.isFinite(JOB_TIMEOUT_MS_BY_KIND[kind])) {
    return JOB_TIMEOUT_MS_BY_KIND[kind];
  }
  return DEFAULT_JOB_TIMEOUT_MS;
}
