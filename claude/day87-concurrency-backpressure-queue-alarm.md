# D87 — Concurrency bounds, backpressure, queue-depth alarm

**Status: DONE** for the calendar exit check: submitting more jobs than
workers leaves the excess queued; worker count is pinned to match the
container limit (explicit `R_WORKERS=1`, not `availableCores()`).

## Premise on contact

Calendar warned about `plan(multisession, workers = max(2, availableCores()-1))`.
Code already ran **sequential / workers=1** and never called that pattern.
Compose had **no** CPU/memory limits. The real hole was concurrent
`kickQueue` / dispatcher races that could hit Plumber twice, and no
queue-depth metric/alarm.

## Exit checks

| Claim | Executed? |
|---|---|
| Excess over workers stays queued | **Yes** — `maxConcurrent=1`: while job A runs, B+C remain `queued` |
| Worker count matches container limit | **Yes** — compose `R_WORKERS=1` + cpus 2.0 / memory 4G; `/irt/parallel-status` reads `R_WORKERS`; source test forbids multisession/availableCores worker formula |
| Queue depth metric + alarm | **Yes** — `GET /api/calibrationJobs/queue-metrics`; warn once per threshold crossing |

## What shipped

| Area | Change |
|---|---|
| `docker-compose.yml` | r-backend limits cpus 2.0 / memory 4G; `R_WORKERS=1`; node `CALIBRATION_MAX_CONCURRENT=1` + depth alarm 20 |
| `calibrationQueueLimits.js` | Metrics + depth alarm |
| `calibrationWorker.js` | Single dispatcher lock; dispatch ≤ maxConcurrent |
| `calibrationJobsRoutes.js` | `GET /queue-metrics` |
| `api.R` / `health.R` | Workers from `R_WORKERS`; report `availableCoresReported` diagnostically only |
| Tests | Concurrency gate + compose/source pin + route metrics |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  133 passed (133)
  Tests  1585 passed | 9 skipped (1594)

npm run build
  green; recharts 451.37 kB
```

## Honest gaps

- Live `/irt/parallel-status` inside a running container not walked this
  session (source + compose contract asserted).
- Memory “stable under load” is argued by bound concurrency, not a load
  profiler number (that is D110).

## Next

**D88** — Full benchmark suite in CI (drift / perturbation; Hub equating image still open).

## Calendar

Marked **D87** ✅ with real date **2026-09-17**.
