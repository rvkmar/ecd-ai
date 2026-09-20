# D105 — Audit viewer + system health screen + four alerts + W21 handoff

**Status: DONE.** Calendar unit **D105** complete 2026-09-20. **W21 gate met.**

## Premise on contact

Calendar: audit log viewer (entity/actor/action/date); system health screen
on D104 endpoints; alert on exactly four signals; confirm audit tenancy is
deliberately admin/global. Exit / W21 deliverable: “who promoted this Task
Model to operational, when, and on what evidence” is **one query**.

**Code at calibration:** `/api/auditLog` filters existed (admin-only); no
viewer UI; no ops alerts; no health summary surface; `toStatus` filter absent.

**Became:** Settings → System → Health / Audit / Danger; `/api/ops/*`;
submit outcome counters; `toStatus` on audit query; W21 gate test.

## Exit check — W21 deliverable

| Claim | Executed? |
|---|---|
| “Who promoted this Task Model to operational, when, and on what evidence” is ONE query in the viewer | **Yes** — `GET /api/auditLog?entityCollection=taskModels&entityId=…&action=lifecycle.transition&toStatus=operational` returns the actor, `at`, and `detail` in one response (`d105W21AuditGate.test.js`). Viewer surfaces the same answer. |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1767 passed | 9 skipped (1776) — 154 files (~261s at unit close; ~273s at session close)

npm run build
  green (~16s)

git
  tip c55340f — D105 completed -- audit viewer, four alerts, and W21 gate.
  master ≡ main/master (pushed)
```

## Delivered

| Area | Change |
|---|---|
| `auditLogRoutes.js` | `toStatus` filter; tenancy comment (not scoped) |
| `opsRoutes.js` | `/alerts`, `/health-summary` (admin) |
| `opsAlerts.js` + `submitStats.js` | Four alerts; submit error rate window |
| `sessionRoutes.js` | `res.on("finish")` → submit outcome |
| Settings System tab | Health panel + Audit viewer |
| Tests | `d105W21AuditGate.test.js`; routeAuth includes ops/audit |

### The four alerts

1. `auth.failure_rate` — failures/hour vs threshold  
2. `calibration.queue_depth` — `depthAlarm`  
3. `session.submit_error_rate` — rolling window rate  
4. `backup.age` — age vs policy (or no backups)

### Tenancy

`auditLog` is **not** in `TENANT_SCOPED_COLLECTIONS`. Access is **admin-only**.
Cross-tenant read is intentional for accountability (asserted in tests + UI).

## W21 block

Gate closed: promotion provenance is one query. Block D101–D105 complete.

## Next

Calendar **D106** (W22 resilience — see calendar; D107 is backup).
