# D99 — Cross-tenant aggregate leakage review (W20 / never-compress)

**Status: DONE.** Calendar unit **D99** complete. Session closed 2026-09-19.

## Premise on contact

Ledger / calendar: review every aggregate for (1) cross-tenant computation
shown to one tenant, (2) small-cell disclosure. Never-compress, alone.

**Code at calibration:** Row filters (D97–D98) hid individual foreign rows,
but dashboard charts still averaged **unscoped** `sessions`/`students`;
class/district reports returned named rosters and per-student `captured[]`;
global `usageCount` / itemAnalytics were readable by any authenticated role
(ADR 0006 bank is global — that leaks other districts' testing activity);
artefacts/jobs returned raw small-n cells and person-level cohort members.

## Exit check

| Claim | Executed? |
|---|---|
| Every aggregate names its scope | **Yes** — `scope` / `scopeMeta` on dashboard, class/district reports, itemAnalytics, artefacts, jobs |
| Small cells suppressed at a stated threshold | **Yes** — `MIN_CELL_SIZE = 5` in `aggregatePrivacy.js` |
| Written record of leaky aggregates and fixes | **Yes** — table below |

### Findings → fixes

| Aggregate | Failure | Fix |
|---|---|---|
| `GET /api/reports/dashboard` | Charts/avg/`activeStudents` used full session list; query `districtId` spoofable | JWT-only scope; all charts over `filteredSessions`; named `scope`; suppress n&lt;5 |
| `GET /api/reports/teacher/class/:classId` | Roster names + per-student `captured[]`; no district assert | District membership check; count-only; suppress IRT/BN/coverage; drop sessionIds from policies |
| `GET /api/reports/teacher/district/:districtId` | Same captured person rows | Count-only + suppress; named scope |
| `GET /api/itemAnalytics/summary` (+ calibration report) | Global exposure / sampleSize to any role | **Admin-only**; named scope; sampleSize suppress |
| `GET /api/itemAnalytics/:id/health` | `exposureRatio` from global usage | Ratio admin-only; others get `exposureRedacted` |
| `GET /api/items` (+ `?exposure=`) | `usageCount` visible to district/teacher/student | Redact `usageCount` for non-admin; exposure query admin-only |
| `GET /api/analysisArtefacts` | Small-n payload cells | Suppress for non-admin; `scopeMeta` + `minCellSize` |
| `GET /api/calibrationJobs` | Cohort `members` + response matrices to district | Redact person-level request fields for non-admin |

**Decision:** minimum cell size **5**. Zero remains visible (empty cohort).
Admin retains unsuppressed psychometric audit payloads.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1722 passed | 9 skipped (1731) — 145 files (~163s)

npm run build
  green (~49s; max JS chunk recharts 451.37 kB)
```

- Tests: `server/routes/__tests__/d99AggregateLeakage.test.js`
- Commit **`be10eef`**; remote `main/master` matches
- Calendar: **ECD D99** marked ✅ (event date unchanged)
- Threat model T-AUTHZ-04 → Control (D97–D99)
- Next: **D100** — tenant admin UI + scope inspector + W20 gate

## Delivered

- `server/utils/aggregatePrivacy.js` — `MIN_CELL_SIZE`, scope naming, suppress/redact helpers
- `server/routes/reportsRoutes.js` — dashboard + class/district aggregate privacy
- `server/routes/itemAnalyticsRoutes.js` — admin gate for bank exposure metrics
- `server/routes/itemsRoutes.js` — redact `usageCount` for non-admin
- `server/routes/analysisArtefactsRoutes.js` / `calibrationJobsRoutes.js` — suppress/redact on read
- `server/routes/__tests__/d99AggregateLeakage.test.js`

## What remains

- **D100** — tenant administration UI + “what can this user see?” + W20 handoff
- Carried open walks: D68 mid-flight; CM archive; Home announcements; Newtonian promote
