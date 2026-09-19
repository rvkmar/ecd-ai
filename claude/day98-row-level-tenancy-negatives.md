# D98 — Row-level tenancy negatives + sixth mirror (W20 / never-compress)

**Status: DONE.** Calendar unit **D98** complete. Session closed 2026-09-19.

## Premise on contact

Ledger / cadence: HTTP negatives per role × scoped collection; sixth
mirror-drift (`rolePermissions.viewScope` ↔ `viewScopeForRole`). Never-compress, alone.

**Code at calibration:** D97 filters lived in `loadDB`/`dbAdapter`, but
synchronous route handlers lost ALS when `authenticateToken` used
`enterWith` then returned through async continuations / Express `next`.
No HTTP matrix proved out-of-scope rows were absent from API bodies.
`rolePermissions` ↔ server viewScope had no mirror-drift guard.

**Became:** Sync JWT verify + `runWithTenancy(ctx, () => next())` when the
auth-epoch cache is warm (cache-miss path still binds via bag after
resolve). Request bag via `beginTenancyRequest` early middleware.
HTTP negatives in `d98TenancyRowNegatives.test.js` (19). Sixth mirror in
`mirrorDrift.test.js`. Dead unused `runWithTenancyBag` export removed.

## Exit check

| Claim | Executed? |
|---|---|
| Every role × scoped-collection pair has a negative (API returns nothing / 403 / 404 — not UI hiding) | **Yes** — district/teacher/student/admin matrix over students, sessions, tasks, announcements, artefacts, jobs, reports; `users` list remains admin-only (role gate) |
| Drift test fails when client scope changes without server counterpart | **Yes** — invented `viewScope: "school"` on district client ≠ server; live tables still agree |
| Proven by suite + live `:6060` after node rebuild | **Yes** |

### Live `:6060` (after `docker compose build node` + recreate)

| Probe | Result |
|---|---|
| `dist1` GET `/api/reports/teacher/district/tn-madurai` | **403** |
| `dist1` GET `/api/students` | `[]` (no cross-district dump) |
| Earlier same rebuild: `dist1` artefacts `[]` / `admin1` artefacts rows | holds |

## Verification (session close)

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1710 passed | 9 skipped (1719) — 144 files (~157s)

npm run build
  green (~49s; max JS chunk recharts 451.37 kB)
```

- No half-applied product work. Commit **`a57437b`** (product + session close).
- Exit check executed: HTTP suite + sixth mirror + live foreign-district 403.
- Calendar: **ECD D98** marked ✅ (event date unchanged).
- Remote `main/master` at **`a57437b`** (after push).

## Delivered

- `server/utils/authMiddleware.js` — sync JWT; `runWithTenancy` around `next` when epoch cached
- `server/index.js` — `beginTenancyRequest` middleware
- `server/utils/tenancyContext.js` — drop unused `runWithTenancyBag` export
- `server/routes/__tests__/d98TenancyRowNegatives.test.js` — 19 HTTP negatives
- `src/test/mirrorDrift.test.js` — sixth mirror (`rolePermissions.viewScope` ↔ `viewScopeForRole`)

## What remains

- **D99** — aggregate leakage review (never-compress)
- **D100** — tenant admin UI + scope inspector + W20 gate
- Carried open walks: D68 mid-flight; CM archive; Home announcements; Newtonian promote

## Next

Calendar **D99** — alone, never-compress.
