# D104 — Health, readiness, metrics + client error tracking

**Status: DONE.** Calendar unit **D104** complete 2026-09-20.

## Premise on contact

Calendar: health / readiness / metrics endpoints (process, DB, R, queue
depth, migration version, last backup age); client error tracking with
source maps and release tagging. Health ≠ readiness — R down must not
fail overall health (ADR 0001 / D89).

**Code at calibration:** no `GET /api/health` (D61 noted 404 on nginx);
boot-only R probe; ErrorBoundary console-only; no release tag / sourcemaps
in production build; migration version only via shell on `migrations.log.json`.

**Became:** unauthenticated `/api/health`, `/api/ready`, `/api/metrics`;
`POST /api/client-errors`; ErrorBoundary → apiFetch reporter; Vite
`sourcemap: true` + `VITE_RELEASE` / package release tag.

## Exit check

| Claim | Executed? |
|---|---|
| Stopping R changes readiness for calibration but leaves overall health green and sessions serving | **Yes** — `d104HealthReadiness.test.js`: R unreachable → `health.ok` true / `readiness.ok` false / `servingSessions` true; HTTP 200 vs 503 |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1757 passed | 9 skipped (1766) — 153 files (~249s)

npm run build
  green (~16s) — sourcemaps emitted beside chunks
```

Also fixed a latent D103 bug in `itemsRoutes` bulk: `failed` was referenced
without a binding (500 on every `/api/items/bulk`).

## Delivered

| Area | Change |
|---|---|
| `server/utils/systemStatus.js` | Collect process/DB/R/queue/migrations/backup |
| `server/routes/healthRoutes.js` | `/health`, `/ready`, `/metrics`, `POST /client-errors` |
| `server/index.js` | Mount health routes (no auth) |
| `server/migrations/registry.js` + runner | Shared registry; `getMigrationStatus()` |
| `src/utils/db-server.js` | Export `backupDirPath` |
| `src/utils/clientErrorReporter.js` + ErrorBoundary | Report with release tag via apiFetch |
| `src/config/release.js` | `VITE_RELEASE` / default `1.0.0` |
| `vite.config.js` | `build.sourcemap: true` |
| Tests | `d104HealthReadiness.test.js`, `clientErrorReporter.test.js` |

Contract:

- **Health 200** when ECD DB readable — R reported diagnostically only.
- **Ready 503** when R unreachable (`reason: r_unreachable`).
- **Metrics** always 200 with migration `latestId` + backup `ageMs`.

## Next

Calendar **D105** — audit viewer + system health screen + four alerts + W21 handoff/gate.
