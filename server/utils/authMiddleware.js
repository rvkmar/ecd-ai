import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/jwt.js";
import {
  getCachedAuthEpoch,
  isAccessDenied,
  setCachedAuthEpoch,
} from "./tokenService.js";
import { dbAdapter } from "./dbAdapter.js";
import { viewScopeForRole } from "./tenancy.js";
import {
  bindTenancyContext,
  runWithTenancy,
  tenancyContextFromReq,
} from "./tenancyContext.js";

const UNSCOPED_AUTH = Object.freeze({
  role: "admin",
  username: "",
  viewScope: null,
  districtId: null,
  schoolId: null,
  unscoped: true,
});

async function resolveAuthEpoch(username) {
  const cached = getCachedAuthEpoch(username);
  if (cached != null) return cached;
  try {
    const users = await runWithTenancy(UNSCOPED_AUTH, () =>
      dbAdapter.list("users")
    );
    const user = users.find((u) => u.username === username);
    if (!user) return null;
    const epoch = Number(user.authEpoch) || 0;
    setCachedAuthEpoch(username, epoch);
    return epoch;
  } catch {
    return null;
  }
}

function attachUser(req, user) {
  req.user = user;
  req.viewScope = viewScopeForRole(user.role);
  return tenancyContextFromReq(req);
}

/**
 * Sync JWT verify + ALS run around next() so tenant filters apply to
 * synchronous route handlers (most loadDB paths). Cache-miss epoch
 * lookup stays async and binds via enterWith/bag after resolve.
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);

  let user;
  try {
    user = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.sendStatus(403);
  }
  if (user?.typ && user.typ !== "access") return res.sendStatus(403);
  if (isAccessDenied(user?.jti)) return res.sendStatus(403);

  const cached = getCachedAuthEpoch(user.username);
  if (cached != null) {
    const claimEpoch = Number(user.ae) || 0;
    if (claimEpoch !== cached) return res.sendStatus(403);
    const ctx = attachUser(req, user);
    return runWithTenancy(ctx, () => next());
  }

  resolveAuthEpoch(user.username)
    .then((expected) => {
      if (expected == null) return res.sendStatus(403);
      const claimEpoch = Number(user.ae) || 0;
      if (claimEpoch !== expected) return res.sendStatus(403);
      const ctx = attachUser(req, user);
      bindTenancyContext(ctx);
      next();
    })
    .catch(() => res.sendStatus(403));
}

export function authorizeRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.sendStatus(403);
    }
    next();
  };
}
