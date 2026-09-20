# D92 — Token and session policy (W19 Security)

**Status: DONE.**

## Premise on contact

Calendar assumed: JWT lives 8h with no revocation; D93 would build the
login rate limiter; password policy unstated.

**Code at `33b0c9c` (pre-D92):**
- Login already had per-IP `loginLimiter` (10/min) + per-username lockout
  (5 fails / 15 min).
- Access tokens still defaulted to **8h**; no refresh, no revocation,
  `authenticateToken` checked signature/exp only.
- `PUT /api/users/:username` called `validateEntity("users")`, which always
  fails (`Unknown collection`) — role edits were effectively broken.

**Became:** keep the existing login throttle/lockout as the decided policy;
shorten access life; add refresh rotation + revocation; state password
policy; fix the dead `validateEntity("users")` call so role-change
invalidation can run.

## Exit check

| Claim | Executed? |
|---|---|
| A revoked session cannot make an authenticated request | **Yes** — suite + live `:6060` logout → prior access token **403** |
| A role change invalidates existing tokens | **Yes** — suite + live `PUT teach1` role → prior token **403** |
| Refresh rotation detects replay of a used refresh token | **Yes** — suite + live replay → `Refresh token reuse detected; session revoked` |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1620 passed | 9 skipped (1629)

npm run build
  green (~15s), max chunk recharts 451.37 kB

Live API on :6060 (node rebuilt this session):
  login → expiresIn 15m + refreshToken + jti/ae/typ claims
  logout denylist → 403 on prior access
  refresh rotate → replay 401 with reuse message
  role change → prior access 403; teach1 role restored
```

Nginx image rebuild hit a container-name conflict; API exit checks do not
depend on the SPA bundle. Client `AuthProvider` refresh/logout wiring is in
source and will ship when nginx is recreated from the new image.

## Delivered

- `server/config/jwt.js` — `ACCESS_TOKEN_EXPIRES_IN` default **15m**;
  `REFRESH_TOKEN_EXPIRES_IN` default **7d**
- `server/config/passwordPolicy.js` — min 12, letter+digit; stated lockout
- `server/utils/tokenService.js` — issue / rotate / revoke / `authEpoch` cache
- `server/utils/authMiddleware.js` — denylist + authEpoch check
- `server/routes/usersRoutes.js` — login pair, `/refresh`, `/logout`,
  `/password-policy`; invalidate on password reset / role change / delete
- `src/auth/AuthProvider.jsx` — stores refresh; refreshes before access
  expiry; logout revokes server-side
- `docs/security/session-policy.md` — policy + D93 submit rate-limit design
- Threat model T-AUTH-01/02 → **Control**

## What remains

- Recreate nginx from the built image (name conflict left SPA on old bundle)
- D93 — input validation sweep + `/submit` rate limit (never-compress)
- D94 — nginx security headers + prod CORS
- D95 — dependency + secret scanning CI
- W19 SSO ADR (decide only)
- Multi-instance shared store for refresh/lockout (Accepted residual, same
  class as pre-D92 lockout map)

## Next

Calendar **D93** — input-validation sweep + session-submit rate limit
(never-compress; alone).
