import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/jwt.js";
import {
  getCachedAuthEpoch,
  isAccessDenied,
  setCachedAuthEpoch,
} from "./tokenService.js";
import { dbAdapter } from "./dbAdapter.js";

async function resolveAuthEpoch(username) {
  const cached = getCachedAuthEpoch(username);
  if (cached != null) return cached;
  try {
    const users = await dbAdapter.list("users");
    const user = users.find((u) => u.username === username);
    if (!user) return null;
    const epoch = Number(user.authEpoch) || 0;
    setCachedAuthEpoch(username, epoch);
    return epoch;
  } catch {
    // If the user store is unreachable, refuse rather than accept a stale token.
    return null;
  }
}

// Already defined: authenticateToken
export function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) return res.sendStatus(403);
    if (user?.typ && user.typ !== "access") return res.sendStatus(403);
    if (isAccessDenied(user?.jti)) return res.sendStatus(403);

    const expected = await resolveAuthEpoch(user.username);
    if (expected == null) return res.sendStatus(403);
    const claimEpoch = Number(user.ae) || 0;
    if (claimEpoch !== expected) return res.sendStatus(403);

    req.user = user; // { username, role, ae, jti, iat, exp, typ }
    next();
  });
}

// Role-based guard
export function authorizeRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.sendStatus(403);
    }
    next();
  };
}
