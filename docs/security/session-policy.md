# Session and authentication policy (D92)

**Status:** Implemented  
**Date:** 2026-09-18  
**Closes:** T-AUTH-01 (primary), T-AUTH-02 policy statement, password policy  
**Companions:** `docs/security/threat-model.md`, `server/config/jwt.js`, `server/utils/tokenService.js`

---

## Access tokens

| Item | Value |
|---|---|
| Type | JWT (`typ: access`), signed with `JWT_SECRET` |
| Lifetime | `ACCESS_TOKEN_EXPIRES_IN` (default **15m**; `TOKEN_EXPIRES_IN` is an alias) |
| Claims | `username`, `role`, `ae` (authEpoch), `jti`, `exp` |
| Verification | Signature + expiry + `jti` not denylisted + `ae` matches current user epoch |

Boot still refuses a `JWT_SECRET` shorter than 32 characters.

## Refresh tokens

| Item | Value |
|---|---|
| Type | Opaque `base64url` secret (not a JWT) |
| Lifetime | `REFRESH_TOKEN_EXPIRES_IN` (default **7d**) |
| Storage | SHA-256 hash in an in-memory session store (single-instance; same residual as login lockout) |
| Rotation | Every `/api/users/refresh` marks the presented token used and issues a new pair |
| Replay | Presenting a used refresh token revokes the **family** and returns 401 |

## Revocation

| Event | Effect |
|---|---|
| `POST /api/users/logout` | Refresh family revoked; access `jti` denylisted until natural expiry |
| Password reset | `authEpoch` incremented; all refresh sessions for the user dropped |
| Role change (`PUT /api/users/:username`) | Same as password reset |
| User delete | Same |

A stolen access token is usable for at most the remaining access lifetime unless logout denylisted its `jti`. A stolen refresh token that has already been rotated is detected and kills the family.

## Password and lockout policy

See `server/config/passwordPolicy.js` (`PASSWORD_POLICY_STATEMENT`):

- Minimum **12** characters, at least one letter and one digit (enforced on create and reset).
- Login: **10** attempts / IP / minute (`loginLimiter`).
- Account lockout: **5** failures → **15** minutes (in-memory per username).

## Submit rate-limit design (for D93)

D92 does **not** rate-limit `/submit`. Decided shape for D93:

- Per-authenticated-user limiter on `POST /api/sessions/:id/submit` (not only per-IP), so a classroom NAT cannot starve peers.
- Suggested starting point: **60 submits / minute / user**, burst 10; 429 with a stable error body.
- Do not share the login limiter’s store; keep calibration and delivery paths separate.
- Record the decision in the D93 handoff when wired.

## SSO

Out of scope here — ADR only when district requirements are known (T-AUTH-05).

## Exit checks (D92)

1. After logout, the prior access token cannot call an authenticated route.
2. After a role change, prior access tokens fail `authenticateToken`.
3. Replaying a rotated refresh token fails and revokes the family.
