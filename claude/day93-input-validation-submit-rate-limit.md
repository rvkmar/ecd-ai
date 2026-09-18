# D93 — Rate limiting + input-validation sweep (W19 Security)

**Status: DONE.** Never-compress (cadence §3).

## Premise on contact

Calendar: rate-limit auth + session submit; sweep query/path/filter inputs;
pay attention to `updateWhere`/`removeWhere`; static-scan like D13.

**Code at `9169119` (post-D92):**
- Login rate limit + lockout already live (D92 kept them).
- `/submit` had no rate limit.
- `validateEntity` still body-only; no path/query sanitizer.
- `updateWhere`/`removeWhere` accepted any filter object (only callers today
  build `{ username }` themselves — still the highest-consequence surface).

**Became:** keep auth throttle; add per-user submit limiter; mount
`sanitizeRequestInputs` on every live router; harden filter equality at
dbAdapter; D13-style static scan with a mutation assertion.

## Exit check

| Claim | Executed? |
|---|---|
| Every route validates its non-body inputs | **Yes** — `router.use(sanitizeRequestInputs)` on all mounted routers |
| Static-scan enforcement test, fails when validation removed | **Yes** — `src/test/requestInputGuard.test.js` (live mount list + mutation) |

Also executed: submit 429 after budget; operator query → 400; operator
filter → throw in `updateWhere`.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1648 passed | 9 skipped (1657)

npm run build
  green (~16s)

Live `:6060` (node rebuilt):
  GET /api/items?status[$gt]=1 → 400
  GET /api/items/a$b → 400
```

## Delivered

- `server/utils/requestValidation.js` — sanitize + submit rate limit + filter assert
- All mounted `server/routes/*` — `router.use(sanitizeRequestInputs)`
- `sessionRoutes` — `submitRateLimiter` on `POST /:id/submit` (60/user/min)
- `dbAdapter.updateWhere` / `removeWhere` — `assertSafeEqualityFilter`
- Tests: `requestInputGuard.test.js`, `d93RequestValidation.test.js`
- Threat model T-INP-01/05 → Control; session-policy submit section updated

## What remains

- D94 — nginx security headers + prod CORS
- D95 — dependency + secret scanning CI
- W19 SSO ADR (decide only)
- T-AUTHZ-03 roster dump → W20 (not closed here)
- Multi-instance shared rate-limit store (Accepted residual)

## Next

Calendar **D94** — nginx security headers + production CORS posture.
