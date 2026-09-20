# D94 — Security headers, CI scanners, git-history audit (W19 Security)

**Status: DONE.**

## Premise on contact

Calendar (authority): nginx CSP/HSTS/XCTO/Referrer-Policy/frame-ancestors;
`npm audit` + secret scanning in CI failing the build; written git-history
secret audit (+ rotations if any); confirm mongo unpublished and R uses
`expose` not `ports`.

Threat-model mapping had drifted (D94 headers+CORS only; scanners on D95).
Calendar D95 is SSO ADR + W19 handoff — scanners belong here.

**Code at `5a2bcf7` (post-D93):**
- `nginx.conf` had no security headers.
- CORS gated off in production already, but no refuse-`*` helper / tests.
- CI had no `npm audit` or Gitleaks; no Dependabot.
- Compose mongo unpublished; `r-backend` already `expose: 4000`.

**Became:** headers in nginx; `applyCors` policy; CI `security-scanners` job
+ Dependabot; written history audit (no leaks → no rotations); threat-model
map corrected to calendar.

## Exit check

| Claim | Executed? |
|---|---|
| Headers verified against a live response | **Yes** — `:6060/` returns CSP, HSTS, XCTO, Referrer-Policy, X-Frame-Options DENY (`frame-ancestors 'none'`), Permissions-Policy |
| Both scanners green and wired to fail the build | **Yes** — CI job `security-scanners`: `npm audit --audit-level=high` + `gitleaks/gitleaks-action` (`fetch-depth: 0`); local `npm audit` = 0 vulns; Gitleaks v8.24.3 = no leaks |
| Written statement of history audit + rotations | **Yes** — `docs/security/git-history-secret-audit.md` (no secrets found; **no rotation required**) |

Also confirmed: `docker-compose.yml` mongo has no `ports:`; `r-backend` uses `expose` (static test).

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1661 passed | 9 skipped (1670)

npm run build
  green (~15s)

Live `:6060` (nginx --no-cache rebuild; node recreated):
  GET / → CSP + HSTS + XCTO + Referrer-Policy + X-Frame-Options DENY
  GET /api/student/data (unauth) → same transport headers; **no** Access-Control-Allow-Origin
  docker exec ecd-node printenv NODE_ENV → production
```

Local note: `docker-compose.override.yml` had been forcing `NODE_ENV=development`, which re-enabled CORS on the walk stack. Removed that override so main compose `NODE_ENV=production` wins (override remains gitignored; R host `:4000` publish is still local-debug only).

## Delivered

- `nginx.conf` — CSP, HSTS, XCTO, Referrer-Policy, frame-ancestors, Permissions-Policy
- `server/utils/corsPolicy.js` + `server/index.js` — prod CORS off; refuse `*`
- `.github/workflows/ci.yml` — `security-scanners` job
- `.github/dependabot.yml` — weekly npm / monthly Actions
- `docs/security/git-history-secret-audit.md`
- `src/test/d94SecurityPosture.test.js` — headers / CORS / compose posture + CSP mutation
- Threat model T-INP-03/04 + T-SUP-01/02 → Control; D94/D95 map rewritten to calendar

## What remains

- **D95** — SSO / hosting / residency ADR + W19 handoff (calendar)
- T-AUTHZ-03 roster dump → W20
- Multi-instance shared rate-limit store (Accepted residual)

## Next

Calendar **D95** — SSO evaluation ADR + W19 handoff.
