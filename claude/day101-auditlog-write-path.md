# D101 — auditLog collection + write-path integration (W21 Audit)

**Status: DONE.** Calendar unit **D101** complete 2026-09-20.

## Premise on contact

Calendar: one `auditLog` collection appended by the **same write path** that
performs the transition — never by callers remembering to log. Hook where
lifecycleValidation / dbAdapter sit; record lifecycle, force-deactivate,
bulk create, calibration ingest, parameter-set replacement, user/role/tenant
change, auth failure.

**Code at calibration:** no `auditLog`; ECD entities persist via
`loadDB`/`saveDB` (not only dbAdapter); ad hoc `operationalMeta` /
`reviewMeta` still written on EM/CM routes (D102 migrates those).

**Became:** `saveDB` diffs the previous raw snapshot and appends audit rows
for status / create / calibration ingest / parameter-set pointer changes.
Routes such as `evidenceModels.js` never import the audit module. Auth
failures and user create/update/delete go through `recordAuditEvent` /
dbAdapter hooks. Admin-only read API + React Query hooks.

## Exit check

| Claim | Executed? |
|---|---|
| A lifecycle transition through any route produces an audit entry | **Yes** — `d101LifecycleAuditRoute.test.js` PATCH → `operational` → `lifecycle.transition` |
| A route that never mentions the audit log still produces one | **Yes** — source guard on evidence/task/item routes + chokepoint test |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1742 passed | 9 skipped (1751) — 149 files (~50s)

npm run build
  green (~9s; max JS chunk recharts 451.37 kB)
```

## Delivered

| Area | Change |
|---|---|
| `server/utils/auditContext.js` | Request id + actor ALS |
| `server/utils/auditLog.js` | Diff + `applySaveAudits` / `pushAuditEvent` |
| `src/utils/db-server.js` | `saveDB` audits; `recordAuditEvent`; `auditLog: []` default; runtime `ECD_DB_FILE` |
| `server/utils/dbAdapter.js` | User create/update/delete → audit |
| `server/routes/usersRoutes.js` | `auth.failure` on failed login / lockout |
| `server/routes/auditLogRoutes.js` | Admin GET; POST/PUT/PATCH/DELETE → 405 |
| `server/index.js` | Mount + request-id middleware |
| `server/utils/authMiddleware.js` | Bind audit actor on auth |
| `src/utils/schema.js` | `auditLog` block + append-only validateEntity |
| `src/config/rolePermissions.js` | Admin `canView` |
| `src/api/queries/auditLog.js` | Read-only hooks |
| Tests | `d101AuditLog.test.js`, `d101LifecycleAuditRoute.test.js`, `auditLogRoutes.test.js` |

Shape stored:

```
{ id, at, actor{userId, role}, action, entity{collection, id, version},
  detail, requestId }
```

## Honest gaps (not D101 blockers)

- Ad hoc `activatedAt` / `reviewMeta` fields still written — **D102** backfills
  and dry-runs removal.
- No UI viewer yet — **D105**.
- Structured request-id logging to R — **D103**.
- Force-deactivate reason text is not copied into `detail` (status change is).

## Next

Calendar **D102** — migrate ad hoc lifecycle fields onto the audit log
(**never-compress**; alone; dry-run mandatory).
