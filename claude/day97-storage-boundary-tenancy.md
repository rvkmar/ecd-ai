# D97 — Storage-boundary tenancy enforcement (W20 / never-compress)







**Status: DONE.** Calendar unit **D97** complete. Session closed 2026-09-19.







## Premise on contact







Ledger / cadence: enforce ADR 0006 at the data layer (never-compress).







**Code at calibration:** JWT claims + `req.viewScope` existed (D96), but most



tenant-scoped reads never hit `dbAdapter` — they used `loadDB()`. Both paths



were unscoped. A district `saveDB` of a filtered view would have wiped other



tenants if filtering were bolted on without merge-on-save.







**Became:** AsyncLocalStorage tenancy bound in `authenticateToken`; ADR 0006



predicates applied in **both** `loadDB`/`saveDB` and `dbAdapter` list/get/write;



`saveDB` merges scoped writes onto the full file; path-param district report



refuses foreign ids; missing `districtId` on non-admin → `TenancyError` (403)



on tenant-scoped access. Row-level matrix remains **D98**.







## Exit check







| Claim | Executed? |



|---|---|



| Tenant-scoped reads apply ADR 0006 from storage layer (`dbAdapter` **and** `loadDB`) | **Yes** |



| Route that omits an explicit filter cannot return another district's rows | **Yes** — helpers + live |



| Non-admin without `districtId` → 403 on scoped collections | **Yes** — suite |



| Proven by storage-helper tests (full cross-route matrix = D98) | **Yes** — `d97TenancyStorage.test.js` |



| `saveDB` merge does not wipe other tenants | **Yes** — suite |







### Live `:6060` (after `docker compose build node` + recreate)







| Probe | Result |



|---|---|



| `dist1` GET `/api/students` | `[]` (no cross-district dump) |



| `dist1` GET `/api/analysisArtefacts` | `[]` (admin-only/unscoped rows hidden) |



| `admin1` GET `/api/analysisArtefacts` | 2 rows (unscoped) |



| `dist1` GET `/api/reports/teacher/district/tn-madurai` | **403** |



| `dist1` GET `/api/reports/teacher/district/tn-chennai` | 404 (no cohort in JSON store) |







Password used: walk credential from D96 session.







## Verification (session close)







```



NODE_OPTIONS=--max-old-space-size=3072 npx vitest run



  1688 passed | 9 skipped (1697) — 143 files







npm run build



  green (close re-run ~3m; max JS chunk recharts 451.37 kB)



```







## Delivered







- `server/utils/tenancyContext.js` — ALS (`bindTenancyContext` / `runWithTenancy` / `TenancyError`)



- `server/utils/tenancyScope.js` — ADR 0006 filters + `mergeScopedDbSave` + path-param assert



- `src/utils/db-server.js` — scoped `loadDB` + merge-on-`saveDB`; `readRawDB` for unscoped disk



- `server/utils/dbAdapter.js` — list/get/write honour ALS



- `server/utils/authMiddleware.js` — bind tenancy after claims; epoch lookup stays unscoped



- `server/routes/reportsRoutes.js` — foreign `districtId` path → 403



- `server/index.js` — `TenancyError` → 403 JSON



- `server/utils/__tests__/d97TenancyStorage.test.js`







## What remains







- **D98** — row-level negative tests (never-compress)



- **D99** — aggregate leakage review (never-compress)



- **D100** — tenant admin UI + mirror-drift + W20 gate



- Carried open walks: D68 mid-flight; CM archive; Home announcements; Newtonian promote







## Next







Calendar **D98** — alone, never-compress.



