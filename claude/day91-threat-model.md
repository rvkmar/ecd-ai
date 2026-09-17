# D91 — Threat model, written before any fix (W19)

**Status: DONE.** Documentation only. No security controls implemented
in this unit (calendar exit check: dispositioned model, not fixes).

## Premise on contact

Calendar / readiness brief assume: client still posts its own score; login
unthrottled; no threat model on disk.

**Code at `80d1c4b`:**
- F3/D47 closed item-path client scoring (legacy path still pinned).
- Login has per-IP rate limit + per-username lockout (`usersRoutes.js`).
- JWT still 8h, no revocation (`TOKEN_EXPIRES_IN`).
- `viewScope` still client-only; `GET /api/students` still authenticate-only dump.
- nginx has no security headers; no Dependabot/secret-scan CI gate.
- No prior `docs/security/` threat model.

Unit rewritten only to **ground dispositions in live code**, not to skip the model.

## Exit check

| Claim | Executed? |
|---|---|
| Written threat model with every threat dispositioned | **Yes** — `docs/security/threat-model.md` |
| Actors include the seven named classes | **Yes** |
| Three platform-specific risks addressed | **Yes** (F3 status corrected) |
| Committed under `docs/adr/` or `docs/security/` | **Yes** — `docs/security/` |
| No fixes in this unit | **Yes** |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  (docs-only unit; full suite expected green / unchanged)
npm run build
  green
```

## Delivered

- `docs/security/threat-model.md` — actors, assets, catalog T-AUTH / T-AUTHZ /
  T-MEAS / T-INP / T-SUP / T-NET / T-AVL with Control | Accepted | Scheduled
  dispositions mapped to D92–D95, W20–W22.

## What remains (explicitly not D91)

- D92+ implement token/revocation, input sweep, headers, CI scanning
- W20 tenancy (roster, artefacts, viewScope server mirror)
- SSO ADR (decide only)

## Next

Calendar **D92** — authentication and session policy (shorten token life,
refresh/revocation design) per threat model §5.
