/**
 * D103 — structured JSON logging with request-id and hard redaction.
 *
 * Hard rule: no student response content and no personal data in logs.
 * Ids only. A log line with an answer or a child's name is a disclosure
 * that outlives W19/W20 access control.
 *
 * Every record includes `requestId` from the D101 audit ALS bag when a
 * request is in flight (same id returned as X-Request-Id).
 */
import { getAuditRequestId, getAuditActor } from "./auditContext.js";

/** Field names (case-insensitive) that must never appear in log output. */
const REDACTED_FIELD_NAMES = Object.freeze([
  "password",
  "newpassword",
  "temporarypassword",
  "rawanswer",
  "answer",
  "response",
  "responses",
  "scoredvalue",
  "selectedoptionid",
  "workproduct",
  "name",
  "displayname",
  "studentname",
  "fullname",
  "email",
  "emisid",
  "apaarid",
  "udise",
]);

const REDACTED = "[REDACTED]";

const defaultSink = (line) => {
  // One JSON object per line — machine-parseable.
  console.log(line);
};

let sink = defaultSink;

/** @param {(line: string) => void} [fn] Pass nothing/non-function to restore default. */
function setLogSink(fn) {
  sink = typeof fn === "function" ? fn : defaultSink;
}

function shouldRedactKey(key) {
  if (typeof key !== "string") return false;
  return REDACTED_FIELD_NAMES.includes(key.toLowerCase());
}

/**
 * Deep-clone fields for logging, replacing forbidden keys with [REDACTED].
 */
function redactForLog(value, depth = 0) {
  if (depth > 8) return "[TRUNCATED]";
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactForLog(v, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = shouldRedactKey(k) ? REDACTED : redactForLog(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * @param {"debug"|"info"|"warn"|"error"} level
 * @param {string} event
 * @param {object} [fields]
 */
export function log(level, event, fields = {}) {
  const safe = redactForLog(fields && typeof fields === "object" ? fields : {});
  const actor = getAuditActor();
  const record = {
    ts: new Date().toISOString(),
    level,
    event: String(event || "unknown"),
    requestId: getAuditRequestId(),
    ...(actor?.userId ? { actorUserId: actor.userId } : {}),
    ...(actor?.role ? { actorRole: actor.role } : {}),
    ...safe,
  };
  sink(JSON.stringify(record));
  return record;
}

export const logger = {
  debug: (event, fields) => log("debug", event, fields),
  info: (event, fields) => log("info", event, fields),
  warn: (event, fields) => log("warn", event, fields),
  error: (event, fields) => log("error", event, fields),
};

/** Test harness — inject/capture sink without exporting setLogSink alone. */
export const __testing__ = { setLogSink };
