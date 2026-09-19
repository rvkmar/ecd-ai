// D92 — access/refresh issuance, refresh rotation, and revocation.
// D96 — optional districtId / schoolId claims from user.profile (ADR 0006).
//
// Access tokens are short-lived JWTs (jti + authEpoch). Refresh tokens are
// opaque, hashed at rest in an in-memory session store (same single-instance
// caveat as the login lockout map — document multi-instance as residual).
// Reuse of a rotated refresh token revokes the whole family (rotation replay
// detection). Password / role changes bump the user's authEpoch so every
// outstanding access token fails even before its natural expiry.

import crypto from "crypto";
import jwt from "jsonwebtoken";
import {
  JWT_SECRET,
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
} from "../config/jwt.js";

/** @type {Map<string, { username: string, role: string, authEpoch: number, familyId: string, expiresAt: number, used: boolean, districtId: string | null, schoolId: string | null }>} */
const refreshByHash = new Map();

/** @type {Map<string, number>} jti -> unix exp (seconds) */
const accessDenylist = new Map();

/** @type {Map<string, number>} username -> authEpoch cache */
const authEpochCache = new Map();

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function parseDurationToMs(spec) {
  const m = String(spec).trim().match(/^(\d+)([smhd])$/i);
  if (!m) {
    // jsonwebtoken accepts bare seconds; treat bare number as seconds
    const n = Number(spec);
    if (Number.isFinite(n) && n > 0) return n * 1000;
    return 15 * 60 * 1000;
  }
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return n * mult;
}

function pruneExpired() {
  const now = Date.now();
  for (const [hash, row] of refreshByHash) {
    if (row.expiresAt <= now) refreshByHash.delete(hash);
  }
  const nowSec = Math.floor(now / 1000);
  for (const [jti, exp] of accessDenylist) {
    if (exp <= nowSec) accessDenylist.delete(jti);
  }
}

export function getCachedAuthEpoch(username) {
  return authEpochCache.has(username) ? authEpochCache.get(username) : null;
}

export function setCachedAuthEpoch(username, epoch) {
  authEpochCache.set(username, Number(epoch) || 0);
}

export function readAuthEpoch(user) {
  const epoch = Number(user?.authEpoch) || 0;
  if (user?.username) setCachedAuthEpoch(user.username, epoch);
  return epoch;
}

export function isAccessDenied(jti) {
  if (!jti) return false;
  pruneExpired();
  const exp = accessDenylist.get(jti);
  if (exp == null) return false;
  if (exp <= Math.floor(Date.now() / 1000)) {
    accessDenylist.delete(jti);
    return false;
  }
  return true;
}

function denyAccessToken(jti, expUnixSec) {
  if (!jti) return;
  const exp = Number(expUnixSec) || Math.floor(Date.now() / 1000) + 60;
  accessDenylist.set(jti, exp);
}

function issueAccessToken({ username, role, authEpoch, districtId = null, schoolId = null }) {
  const jti = crypto.randomUUID();
  const payload = { username, role, ae: authEpoch, typ: "access" };
  // D96: omit empty tenancy claims so admin tokens stay unscoped by absence.
  if (districtId) payload.districtId = districtId;
  if (schoolId) payload.schoolId = schoolId;
  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    jwtid: jti,
  });
  return { token, jti };
}

function issueRefreshToken({
  username,
  role,
  authEpoch,
  familyId,
  districtId = null,
  schoolId = null,
}) {
  const raw = crypto.randomBytes(32).toString("base64url");
  const hash = hashToken(raw);
  const expiresAt = Date.now() + parseDurationToMs(REFRESH_TOKEN_EXPIRES_IN);
  refreshByHash.set(hash, {
    username,
    role,
    authEpoch,
    familyId,
    expiresAt,
    used: false,
    districtId: districtId || null,
    schoolId: schoolId || null,
  });
  return raw;
}

/**
 * Issue a fresh access + refresh pair for a login (new family).
 * @param {{ username: string, role: string, authEpoch?: number, districtId?: string | null, schoolId?: string | null }} user
 */
export function issueTokenPair(user) {
  pruneExpired();
  const authEpoch = Number(user.authEpoch) || 0;
  const districtId = user.districtId || null;
  const schoolId = user.schoolId || null;
  setCachedAuthEpoch(user.username, authEpoch);
  const familyId = crypto.randomUUID();
  const { token } = issueAccessToken({
    username: user.username,
    role: user.role,
    authEpoch,
    districtId,
    schoolId,
  });
  const refreshToken = issueRefreshToken({
    username: user.username,
    role: user.role,
    authEpoch,
    familyId,
    districtId,
    schoolId,
  });
  return {
    token,
    refreshToken,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    authEpoch,
  };
}

function revokeFamily(familyId) {
  for (const [hash, row] of refreshByHash) {
    if (row.familyId === familyId) refreshByHash.delete(hash);
  }
}

/** Revoke every refresh session for a user (password / role change). */
export function revokeAllForUser(username) {
  pruneExpired();
  for (const [hash, row] of refreshByHash) {
    if (row.username === username) refreshByHash.delete(hash);
  }
}

/**
 * Rotate a refresh token. Detects reuse of an already-rotated token and
 * revokes the family.
 * @returns {{ ok: true, token: string, refreshToken: string, expiresIn: string, username: string, role: string }
 *   | { ok: false, status: number, error: string, replay?: boolean }}
 */
export function rotateRefreshToken(rawRefresh) {
  pruneExpired();
  if (typeof rawRefresh !== "string" || !rawRefresh) {
    return { ok: false, status: 400, error: "refreshToken is required" };
  }
  const hash = hashToken(rawRefresh);
  const row = refreshByHash.get(hash);
  if (!row) {
    return { ok: false, status: 401, error: "Invalid or expired refresh token" };
  }
  if (row.expiresAt <= Date.now()) {
    refreshByHash.delete(hash);
    return { ok: false, status: 401, error: "Invalid or expired refresh token" };
  }
  if (row.used) {
    // Replay of a rotated refresh token — revoke the family.
    revokeFamily(row.familyId);
    return {
      ok: false,
      status: 401,
      error: "Refresh token reuse detected; session revoked",
      replay: true,
    };
  }

  // Mark current as used (keep briefly so a second present triggers replay).
  row.used = true;

  const cached = getCachedAuthEpoch(row.username);
  const authEpoch = cached == null ? row.authEpoch : cached;
  if (authEpoch !== row.authEpoch) {
    revokeFamily(row.familyId);
    return { ok: false, status: 401, error: "Session invalidated" };
  }

  const districtId = row.districtId || null;
  const schoolId = row.schoolId || null;
  const { token } = issueAccessToken({
    username: row.username,
    role: row.role,
    authEpoch,
    districtId,
    schoolId,
  });
  const refreshToken = issueRefreshToken({
    username: row.username,
    role: row.role,
    authEpoch,
    familyId: row.familyId,
    districtId,
    schoolId,
  });

  return {
    ok: true,
    token,
    refreshToken,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    username: row.username,
    role: row.role,
  };
}

/**
 * Revoke one refresh session (logout). Optionally denylist the current access jti.
 */
export function revokeRefreshToken(rawRefresh, accessPayload) {
  pruneExpired();
  if (typeof rawRefresh === "string" && rawRefresh) {
    const hash = hashToken(rawRefresh);
    const row = refreshByHash.get(hash);
    if (row) {
      // Drop this family so sibling rotated tokens cannot linger.
      revokeFamily(row.familyId);
    }
  }
  if (accessPayload?.jti) {
    denyAccessToken(accessPayload.jti, accessPayload.exp);
  }
}

/** Test helper — clear in-memory stores between suites. */
export function _resetTokenServiceForTests() {
  refreshByHash.clear();
  accessDenylist.clear();
  authEpochCache.clear();
}
