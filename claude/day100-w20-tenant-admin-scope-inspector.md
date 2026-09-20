# D100 — Tenant admin UI + scope inspector + W20 gate (never-compress)

**Status: DONE.** Calendar unit **D100** complete. **W20 block closed** 2026-09-19.

## Premise on contact

Ledger / calendar: district/school management, user→tenant assignment, and a
SCOPE INSPECTOR whose answer matches the API. W20 exit gate: a district user
cannot read another district’s data through any endpoint (aggregates included),
proven by test; inspector matches API.

**Code at calibration:** D96–D99 delivered claims, storage filters, HTTP
negatives, and aggregate privacy. No admin UI answered “what can this user
see?”; user profile already carried `districtId`/`schoolId` but schoolId was
missing from teacher/student Settings forms; no single W20 gate test drove
inspector + live list together.

**Became:** Admin-only `/api/tenancy/inspect/:username` and `/directory`
(same `filterRows` as production); Settings → Tenancy inspector + directory;
Users forms include `schoolId`; W20 gate test asserts inspector ids ≡
`GET /api/students` and foreign district report 403.

## Exit check (W20 deliverables)

| Claim | Executed? |
|---|---|
| District cannot read another district’s data through any endpoint, aggregates included, proven by test | **Yes** — `d100W20Gate.test.js` (+ D98/D99 matrices) |
| Inspector’s answer matches what the API returns (test drives both) | **Yes** — inspect `dist1` students ids ≡ `GET /api/students` as `dist1` |
| Tenant admin surfaces (assignment + inspector) | **Yes** — Settings → Users (district/school fields) + Settings → Tenancy |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1728 passed | 9 skipped (1737) — 146 files (~181s)

npm run build
  green (~60s; max JS chunk recharts 451.37 kB)
```

- Tests: `server/routes/__tests__/d100W20Gate.test.js`
- Commit product **`3b8ff44`**; tip **`7ff7586`** (handoff hash note); remote `main/master` matches
- Close re-verify 2026-09-19: suite **1728 passed / 9 skipped**; build green
- Calendar: **ECD D100** marked ✅ (event date unchanged); **W20** closed
- Threat model T-AUTHZ-02 → Control (D96–D100)

## Delivered

- `server/utils/scopeInspector.js` — `inspectSubjectVisibility`, `listTenantDirectory`
- `server/routes/tenancyRoutes.js` — admin inspect + directory
- `server/index.js` — mount `/api/tenancy`
- `src/pages/settings/TenancySettings.jsx` + Settings tab
- `UsersSettings` — `schoolId` on teacher/student profiles
- `server/routes/__tests__/d100W20Gate.test.js`
- Threat model T-AUTHZ-02 → Control (D96–D100)

## W20 block close

Gate met: cross-district reads blocked at storage + HTTP + aggregates; inspector
is the admin verification surface. Block D96–D100 complete.

## What remains

- Next calendar unit after W20 (see action plan / calendar — not started here)
- Carried open walks: D68 mid-flight; CM archive; Home announcements; Newtonian promote

## Next

Calendar **D101** — auditLog collection + write-path integration (W21 start).
