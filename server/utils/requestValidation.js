// D93 — non-body request input validation (path + query) and submit rate limit.
//
// validateEntity() only shapes entity bodies on insert. Query strings and
// path params are a separate surface: Express's qs parser can turn
// `?x[$gt]=1` into an object, and a filter object handed to Mongo is an
// injection. This module refuses operator-shaped keys/values on every
// mounted router (static-scan enforced) and hardens dbAdapter filters.

import rateLimit from "express-rate-limit";

/** Path ids / usernames used across ECD routes (synthetic ids, seed names). */
const SAFE_PATH_VALUE_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

const MAX_QUERY_STRING_LEN = 512;

function isOperatorKey(key) {
  return typeof key === "string" && (key.startsWith("$") || key.includes("[$"));
}

/**
 * True when a path/query value is not a safe scalar (objects from qs
 * operator injection, nested arrays of objects, oversized strings, null bytes).
 * Arrays of scalars are allowed (e.g. `?status=a&status=b`).
 */
function isUnsafeInputValue(value) {
  if (value == null) return false;
  if (Array.isArray(value)) {
    return value.some((v) => {
      if (v != null && typeof v === "object") return true;
      return isUnsafeInputValue(v);
    });
  }
  if (typeof value === "object") return true;
  if (typeof value === "boolean" || typeof value === "number") return false;
  if (typeof value !== "string") return true;
  if (value.length > MAX_QUERY_STRING_LEN) return true;
  if (value.includes("\0")) return true;
  return false;
}

/**
 * Flat equality filters only — no Mongo operators, no nested objects.
 * Used by dbAdapter.updateWhere/removeWhere.
 */
export function assertSafeEqualityFilter(filter) {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
    const err = new Error("Filter must be a flat object of equality predicates");
    err.status = 400;
    throw err;
  }
  for (const [key, value] of Object.entries(filter)) {
    if (isOperatorKey(key)) {
      const err = new Error(`Filter key not allowed: ${key}`);
      err.status = 400;
      throw err;
    }
    if (value !== null && typeof value === "object") {
      const err = new Error(`Filter value for '${key}' must be a scalar`);
      err.status = 400;
      throw err;
    }
  }
}

/**
 * Express middleware: reject unsafe path/query inputs before handlers run.
 * Marker name `sanitizeRequestInputs` is what the D93 static scan looks for.
 *
 * Path segments are read from `req.path` (not `req.params`) because
 * `router.use(fn)` runs before route match fills `:id` params.
 */
export function sanitizeRequestInputs(req, res, next) {
  const segments = String(req.path || "")
    .split("/")
    .filter(Boolean);
  for (const segment of segments) {
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return res.status(400).json({ error: "Invalid path segment encoding" });
    }
    if (isOperatorKey(decoded) || isUnsafeInputValue(decoded)) {
      return res.status(400).json({ error: `Invalid path segment: ${decoded}` });
    }
    if (!SAFE_PATH_VALUE_RE.test(decoded)) {
      return res.status(400).json({ error: `Invalid path segment: ${decoded}` });
    }
  }

  for (const [key, value] of Object.entries(req.params || {})) {
    if (isOperatorKey(key) || isUnsafeInputValue(value)) {
      return res.status(400).json({ error: `Invalid path parameter: ${key}` });
    }
    if (!SAFE_PATH_VALUE_RE.test(String(value))) {
      return res.status(400).json({ error: `Invalid path parameter: ${key}` });
    }
  }

  for (const [key, value] of Object.entries(req.query || {})) {
    if (isOperatorKey(key) || isUnsafeInputValue(value)) {
      return res.status(400).json({ error: `Invalid query parameter: ${key}` });
    }
  }

  return next();
}

/**
 * Per-authenticated-user submit throttle (D92 design). Place after
 * authenticateToken so `req.user.username` is the key; fall back to IP.
 */
export const submitRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.SUBMIT_RATE_LIMIT_MAX) > 0
    ? Number(process.env.SUBMIT_RATE_LIMIT_MAX)
    : 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const user = req.user?.username;
    return user ? `submit:${user}` : `submit-ip:${req.ip}`;
  },
  message: { error: "Too many submits. Please try again shortly." },
  validate: { keyGeneratorIpFallback: false },
});
