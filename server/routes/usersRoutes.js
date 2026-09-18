// usersRoutes.js
// Authentication and user management for ecd-assessment

import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { dbAdapter } from "../utils/dbAdapter.js";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { JWT_SECRET } from "../config/jwt.js";
import { validatePassword, PASSWORD_POLICY_STATEMENT } from "../config/passwordPolicy.js";
import { generateTempPassword } from "../../src/utils/generatePassword.js";
import {
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
  readAuthEpoch,
  setCachedAuthEpoch,
} from "../utils/tokenService.js";
import {
  findUserByLoginIdentifier,
  assertPasswordLoginAllowed,
} from "../auth/localIdentity.js";

const router = express.Router();

router.use(sanitizeRequestInputs);

const VALID_ROLES = ["admin", "district", "teacher", "student"];

// Per-IP brute-force throttle on the login endpoint. This used to be defined
// in server/index.js but was only ever wired to a dead, commented-out
// duplicate login route — the real route below had no rate limiting at all.
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: "Too many login attempts from this address. Please try again shortly." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Per-account lockout on top of the per-IP limiter above, so a distributed
// attempt across many IPs against a single known username is still blocked.
// In-memory only (fine for a single-instance deployment; move to a shared
// store such as Redis if this API is ever scaled horizontally).
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const failedAttempts = new Map(); // username -> { count, lockedUntil }

function getLockoutState(username) {
  const entry = failedAttempts.get(username);
  if (!entry) return { locked: false };
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
    return { locked: true, retryAfterMs: entry.lockedUntil - Date.now() };
  }
  return { locked: false };
}

function recordFailedAttempt(username) {
  const entry = failedAttempts.get(username) || { count: 0, lockedUntil: null };
  entry.count += 1;
  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    entry.count = 0;
  }
  failedAttempts.set(username, entry);
}

function clearFailedAttempts(username) {
  failedAttempts.delete(username);
}

function toSafeUser(u) {
  if (!u) return u;
  const { password, ...safe } = u;
  return safe;
}

// ------------------------------
// Shared create-user logic, used by both POST / (single) and POST /bulk.
// Returns { ok, status, error, user } rather than writing to `res` directly
// so the bulk importer can call this once per row and collect per-row
// results instead of duplicating the validation/hashing/insert logic.
// ------------------------------
export async function createUserRecord(payload = {}) {
  const {
    username,
    password,
    role,
    email,
    profile,
    authProvider = "local",
    mustChangePassword = false,
  } = payload;

  if (!username || !role) {
    return { ok: false, status: 400, error: "username and role are required" };
  }
  if (!VALID_ROLES.includes(role)) {
    return { ok: false, status: 400, error: `role must be one of: ${VALID_ROLES.join(", ")}` };
  }
  if (authProvider !== "local" && authProvider !== "oidc" && authProvider !== "saml") {
    return { ok: false, status: 400, error: "authProvider must be local, oidc, or saml" };
  }
  // Local accounts always need a password. Federated accounts may omit one
  // so SSO can be wired later without inventing throwaway secrets.
  if (authProvider === "local") {
    if (!password) {
      return { ok: false, status: 400, error: "password is required for local accounts" };
    }
    const pw = validatePassword(password);
    if (!pw.ok) {
      return { ok: false, status: 400, error: pw.error };
    }
  }

  const users = await dbAdapter.list("users");
  if (users.some((u) => u.username === username)) {
    return { ok: false, status: 400, error: "Username already exists" };
  }
  const emisId = profile?.emisId;
  const udiseId = profile?.udiseId;
  if (emisId && users.some((u) => u.profile?.emisId === emisId)) {
    return { ok: false, status: 400, error: "emisId already exists" };
  }
  if (udiseId && users.some((u) => u.profile?.udiseId === udiseId)) {
    return { ok: false, status: 400, error: "udiseId already exists" };
  }

  const hashed =
    authProvider === "local" ? await bcrypt.hash(password, 10) : undefined;
  const newUser = {
    id: username,
    username,
    ...(hashed ? { password: hashed } : {}),
    role,
    email: email || "",
    profile: profile || {},
    authProvider,
    mustChangePassword: Boolean(mustChangePassword),
    authEpoch: 0,
  };

  try {
    const inserted = await dbAdapter.insert("users", newUser);
    return { ok: true, status: 201, user: toSafeUser(inserted) };
  } catch (err) {
    const msg = err.message || "Server error creating user";
    if (/duplicate key|E11000/i.test(msg)) {
      return { ok: false, status: 400, error: "Username already exists" };
    }
    return { ok: false, status: 500, error: msg };
  }
}

// ------------------------------
// POST /api/users/login
// ------------------------------
// Body: { username, password, role }
// `username` may be the account username, EMIS id, or UDISE id.
// Response: { token, username, role, mustChangePassword? }
router.post("/login", loginLimiter, async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ error: "username, password, and role are required" });
  }

  const lockoutKey = String(username);
  const lockoutState = getLockoutState(lockoutKey);
  if (lockoutState.locked) {
    return res.status(423).json({
      error: "Account temporarily locked due to repeated failed login attempts. Please try again later.",
    });
  }

  try {
    const users = await dbAdapter.list("users");
    const user = findUserByLoginIdentifier(users, username);

    // Same generic error for "no such user" and "wrong password" so a caller
    // can't use this endpoint to enumerate valid usernames / EMIS ids.
    if (!user) {
      recordFailedAttempt(lockoutKey);
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const allowed = assertPasswordLoginAllowed(user);
    if (!allowed.ok) {
      recordFailedAttempt(lockoutKey);
      return res.status(allowed.status).json({ error: allowed.error });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      recordFailedAttempt(lockoutKey);
      return res.status(401).json({ error: "Invalid username or password" });
    }

    if (user.role !== role) {
      recordFailedAttempt(lockoutKey);
      return res.status(401).json({ error: "Invalid username or password" });
    }

    clearFailedAttempts(lockoutKey);

    const authEpoch = readAuthEpoch(user);
    const pair = issueTokenPair({
      username: user.username,
      role: user.role,
      authEpoch,
    });

    res.json({
      token: pair.token,
      refreshToken: pair.refreshToken,
      expiresIn: pair.expiresIn,
      username: user.username,
      role: user.role,
      mustChangePassword: Boolean(user.mustChangePassword),
    });
  } catch (err) {
    console.error("Login failed:", err);
    res.status(500).json({ error: "Server error during login" });
  }
});

// ------------------------------
// POST /api/users/refresh
// Body: { refreshToken } — rotates refresh; detects replay.
// ------------------------------
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body || {};
  const result = rotateRefreshToken(refreshToken);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  res.json({
    token: result.token,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn,
    username: result.username,
    role: result.role,
  });
});

// ------------------------------
// POST /api/users/logout
// Body: { refreshToken? }. Bearer access optional — when present, its jti
// is denylisted until natural expiry.
// ------------------------------
router.post("/logout", (req, res) => {
  const { refreshToken } = req.body || {};
  const authHeader = req.headers["authorization"];
  const access = authHeader && authHeader.split(" ")[1];
  let accessPayload = null;
  if (access) {
    try {
      accessPayload = jwt.verify(access, JWT_SECRET);
    } catch {
      accessPayload = null;
    }
  }
  revokeRefreshToken(refreshToken, accessPayload);
  res.status(204).end();
});

// ------------------------------
// GET /api/users/password-policy (any authenticated role)
// ------------------------------
router.get(
  "/password-policy",
  authenticateToken,
  authorizeRole(["admin", "district", "teacher", "student"]),
  (_req, res) => {
    res.json({ policy: PASSWORD_POLICY_STATEMENT });
  }
);

// ------------------------------
// GET /api/users (Admin only)
// ------------------------------
router.get(
  "/",
  authenticateToken,
  authorizeRole(["admin"]),
  async (req, res) => {
    try {
      const { role } = req.query; // optional ?role=teacher|student|district|admin
      const users = await dbAdapter.list("users");

      let filtered = users;
      if (role) {
        filtered = users.filter((u) => u.role === role);
      }

      // Return essential fields only
      const result = filtered.map((u) => ({
        username: u.username,
        role: u.role,
        email: u.email,
        profile: u.profile || {},
        createdAt: u.createdAt,
      }));

      res.json(result);
    } catch (err) {
      console.error("Fetch users failed:", err);
      res.status(500).json({ error: "Failed to load users" });
    }
  }
);

// ------------------------------
// POST /api/users (Admin can create)
// ------------------------------
router.post(
  "/",
  authenticateToken,
  authorizeRole(["admin"]),
  async (req, res) => {
    const result = await createUserRecord(req.body);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.status(result.status).json(result.user);
  }
);

// ------------------------------
// POST /api/users/bulk (Admin only)
// body: { username, password, role, email?, profile? }[] -- each row
// validated and inserted with the exact same rules as POST / above
// (createUserRecord), including the username-uniqueness check against
// users already in the DB *and* against earlier rows in this same batch
// (since createUserRecord re-reads the live list each call).
// ------------------------------
router.post(
  "/bulk",
  authenticateToken,
  authorizeRole(["admin"]),
  async (req, res) => {
    const rows = req.body;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: "Request body must be a JSON array of users." });
    }

    const results = [];
    for (let i = 0; i < rows.length; i++) {
      const result = await createUserRecord(rows[i] || {});
      results.push(
        result.ok
          ? { index: i, ok: true, username: result.user.username }
          : { index: i, ok: false, error: result.error }
      );
    }

    const created = results.filter((r) => r.ok).length;
    res.status(207).json({ created, failed: results.length - created, results });
  }
);

// ------------------------------
// PUT /api/users/:username (Admin only)
// Edits role/email/profile. Password changes go through the dedicated
// reset-password endpoint below, not this one -- this route silently
// ignores a `password` field in the body rather than accepting a raw,
// unhashed password into a generic edit payload.
// ------------------------------
router.put(
  "/:username",
  authenticateToken,
  authorizeRole(["admin"]),
  async (req, res) => {
    const { username } = req.params;
    const { role, email, profile } = req.body || {};

    try {
      const users = await dbAdapter.list("users");
      const target = users.find((u) => u.username === username);
      if (!target) {
        return res.status(404).json({ error: "User not found" });
      }

      if (role !== undefined && !VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` });
      }

      const updates = {};
      if (role !== undefined) updates.role = role;
      if (email !== undefined) updates.email = email;
      if (profile !== undefined) updates.profile = profile;

      const roleChanged = role !== undefined && role !== target.role;
      if (roleChanged) {
        updates.authEpoch = (Number(target.authEpoch) || 0) + 1;
      }

      // Users are the credential store, not an ECD schema collection —
      // validateEntity("users") always returns "Unknown collection".
      // Role enum is checked above; email/profile are free-form.

      // Same username-keyed lookup as reset-password below, and for the
      // same reason: seed accounts have no `id` to match on.
      const updated = await dbAdapter.updateWhere("users", { username }, {
        ...updates,
        id: target.id || username,
      });
      if (!updated) {
        return res.status(500).json({ error: "Failed to update user" });
      }
      if (roleChanged) {
        setCachedAuthEpoch(username, updates.authEpoch);
        revokeAllForUser(username);
      }
      res.json(toSafeUser(updated));
    } catch (err) {
      console.error("User update failed:", err);
      res.status(500).json({ error: "Failed to update user" });
    }
  }
);

// ------------------------------
// POST /api/users/:username/reset-password (Admin only)
// Body: { newPassword? } -- if omitted, a random temporary password is
// generated and returned once (same "show it to the admin once" pattern
// account creation already uses).
// ------------------------------
router.post(
  "/:username/reset-password",
  authenticateToken,
  authorizeRole(["admin"]),
  async (req, res) => {
    const { username } = req.params;
    const { newPassword } = req.body || {};

    try {
      const users = await dbAdapter.list("users");
      const target = users.find((u) => u.username === username);
      if (!target) {
        return res.status(404).json({ error: "User not found" });
      }

      const generated = !newPassword;
      const passwordToSet = newPassword || generateTempPassword();
      const pw = validatePassword(passwordToSet);
      if (!pw.ok) {
        return res.status(400).json({ error: pw.error });
      }

      const hashed = await bcrypt.hash(passwordToSet, 10);
      const nextEpoch = (Number(target.authEpoch) || 0) + 1;

      // Match on { username }, not on the synthetic `id`. The four seed
      // accounts (admin1/dist1/teach1/stud1) are created by initMongo.js
      // (and server/users.json) without an `id` field, so the old
      // update("users", target.id || username, ...) matched no document --
      // in Mongo mode findOneAndUpdate returned null without throwing, so
      // the endpoint reported success while the password was never
      // actually changed. Backfilling `id` at the same time makes every
      // later id-keyed lookup on that record work too.
      const updated = await dbAdapter.updateWhere(
        "users",
        { username },
        { password: hashed, authEpoch: nextEpoch, id: target.id || username }
      );
      if (!updated) {
        return res.status(500).json({ error: "Failed to reset password" });
      }

      setCachedAuthEpoch(username, nextEpoch);
      revokeAllForUser(username);

      res.json({
        success: true,
        username,
        // Only present when the server generated it -- an admin-supplied
        // password is never echoed back.
        temporaryPassword: generated ? passwordToSet : undefined,
      });
    } catch (err) {
      console.error("Password reset failed:", err);
      res.status(500).json({ error: "Failed to reset password" });
    }
  }
);

// ------------------------------
// DELETE /api/users/:username (Admin only)
// ------------------------------
router.delete(
  "/:username",
  authenticateToken,
  authorizeRole(["admin"]),
  async (req, res) => {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({ error: "username is required" });
    }

    try {
      const users = await dbAdapter.list("users");
      const target = users.find((u) => u.username === username);
      if (!target) {
        return res.status(404).json({ error: "User not found" });
      }

      // Username-keyed for the same reason as the two routes above --
      // and because in JSON mode remove("users", undefined) matched every
      // id-less record, i.e. deleting one seed account wiped them all.
      await dbAdapter.removeWhere("users", { username });
      revokeAllForUser(username);
      setCachedAuthEpoch(username, (Number(target.authEpoch) || 0) + 1);
      res.json({ success: true, deleted: username });
    } catch (err) {
      console.error("User deletion failed:", err);
      res.status(500).json({ error: "Failed to delete user" });
    }
  }
);

export default router;
