# Session 2026-09-15 — D74 Performance pass (bundle split)

**Status: DONE** for the calendar exit check: Vite chunk warning cleared; dashboard and composite-library costs measured against stated sizes. Live `:6060` still serves the pre-D74 nginx asset until that image is rebuilt — this close verified `npm run build` + suite + API timings against the running API.

## Exit checks (what was actually executed)

| Claim | Form stated | Executed? |
|---|---|---|
| Chunk warning resolved | `npm run build` with no `>500 kB` warning | **Yes** — largest JS chunk `recharts` 446.89 kB |
| Route-level code splitting | `React.lazy` via `lazyPanel` in `App.jsx` + lazy tab panels | **Yes** |
| Dashboard load time vs stated item-bank size | Timed `GET /api/reports/dashboard` + in-memory scale scan | **Yes** (see below) |
| Composite-library build cost | Live rebuild `tm-d56` + synthetic 50…1000 items | **Yes** |

## Verification

```
npm run build
  (no chunk-size warning)
  largest: recharts-BYECgA3H.js 446.89 kB
  entry:   index-DVkk4-Lz.js     31.23 kB
  built in 7.57s

NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  105 passed (105)
  Tests  1439 passed | 6 skipped (1445)
  Duration  35.33s
```

### Measured costs

**Live `:6060` API** (admin1; bank as deployed this session):

| Quantity | Count |
|---|---|
| items | 4 |
| sessions | 4 |
| taskModels | 1 |
| evidenceModels | 2 |
| compositeLibrary packages | 1 |

- `GET /api/reports/dashboard` — 5 samples ms: 41, 15, 14, 15, 15 → **median 15 ms** (cold 41 ms).
- `POST /api/compositeLibrary/rebuild/tm-d56` — **28 ms** (package retained active; compiled items present).

**In-process scale** (stated bank sizes; Node `performance.now`, 5-sample median after warmup):

| Stated size N | `buildCompositeLibrary` median | dashboard-shaped scan median (N sessions) |
|---|---|---|
| 50 | 0.06 ms | 0.02 ms |
| 200 | 0.08 ms | 0.11 ms |
| 500 | 0.17 ms | 0.13 ms |
| 1000 | 0.18 ms | 0.40 ms |

Dashboard route still loads full `sessions` / `tasks` / `students` lists (not items). The stated “item-bank size” is the deployment/scale label above; query cost at N=1000 in-memory remains sub-millisecond. Live cost is dominated by storage round-trips, not the reduce.

## What was delivered

- `src/components/ui/lazyPanel.jsx` — shared `lazy` + `Suspense` + `Spinner`.
- `App.jsx` — route-level lazy for role pages, builders, player, settings, calibration.
- Admin / District / Teacher / Student dashboards — lazy tab panels (same import paths so existing vitest mocks still intercept).
- `RoleWorkbench` — mount only the active leaf so inactive lazy panels do not fetch.
- `vite.config.js` — `manualChunks` for recharts, reactflow, framer-motion, lucide, radix, query, dnd, react-vendor.

## Premise check

Plan assumed a single >500 kB entry chunk with no route splitting. Confirmed at HEAD before the change: `index-ND7fdpsk.js` 2,269.52 kB, zero `React.lazy` usage. AdminPage static-imported every CAF builder (would have kept `/admin` huge even after App-only lazy). Rewrote to route **and** tab splits; exit check (warning gone + measured costs) unchanged.

## What remains

- **D75** never-compress W15 core sign-off — do not start thin.
- Rebuild nginx/node on `:6060` to serve the split assets.
- Open debt: D54 wizard-readiness agreement test; D68 mid-flight ingest; Hub equating image; CM archive live click; Home announcements live walk; wizard Continue-across-device.

## Next

Calendar **D75** — Core sign-off (never-compress). Stand alone.
