# D86 — Job timeouts and process kill (W18)

**Status: DONE** for the calendar exit check: a deliberately non-terminating
job is killed at its timeout, the worker is reclaimed, and the next queued
job starts. Job failure carries an inspectable `Timeout` reason including
whether the R process kill succeeded.

## Premise on contact

Calendar assumed timeouts were greenfield. Code already aborted the Node
`fetch` at **15 minutes** (`AbortController` in `rClient.js`). Aborting the
HTTP client does **not** stop a blocked Plumber handler — that is the
starvation failure mode D86 closes. `api.R` is already sequential
(`workers: 1`); no multisession bug to fix here (that was a D87 false premise).

## Exit checks

| Claim | Executed? |
|---|---|
| Per-job wall-clock timeout (15 min default, per-kind override) | **Yes** — `jobTimeoutMsForKind`; dina 30m, item-analysis 10m |
| On breach R process is killed, not merely abandoned | **Yes** — `killRBackend` after Timeout (`injected` / `R_BACKEND_KILL_COMMAND` / `docker kill`) |
| Job → `failed` with timeout reason | **Yes** — `rClass: "Timeout"`, `rKilled`, kill method in message |
| Worker reclaimed; next queued job starts | **Yes** — `processQueuedJobs` exit-check test |

## What shipped

| Area | Change |
|---|---|
| `server/r/jobTimeouts.js` | Default 15m + per-kind map + env override |
| `server/r/killRBackend.js` | Kill strategies after timeout |
| `server/r/rClient.js` | Timeout → kill; report `rKilled` |
| `server/r/calibrationWorker.js` | Passes per-kind timeout; Node-only jobs race a wall clock |
| `r-backend/app/api.R` | `POST /calibrate/hang` gated on `R_ALLOW_HANG_ENDPOINT=1` |
| Tests | `jobTimeoutKill.test.js` — hang → kill → next job succeeds |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  132 passed (132)
  Tests  1577 passed | 9 skipped (1586)

npm run build
  green; recharts 451.37 kB (unchanged; server-only unit)
```

## Honest gaps

- Live docker-kill against a hung Plumber request not walked this session
  (compose + `R_ALLOW_HANG_ENDPOINT=1`); always-run path uses injected killer.
- After `docker kill`, compose `restart: always` must bring R back before the
  next live job; unit tests do not wait on `/health`.

## Next

**D87** — Concurrency bounds, backpressure, queue-depth alarm (premise:
compose has no CPU limits yet; R is already sequential).

## Calendar

Marked **D86** ✅ with real date **2026-09-17**.
