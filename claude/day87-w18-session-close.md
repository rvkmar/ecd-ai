# W18 session close — D86 + D87 (not block close)

**Closed 2026-09-17.** W18 gate (D89 kill R mid-session) is **not** due.
This close records D86–D87 only. Next: D88.

## Exit checks (executed)

| Unit | Exit check | Executed? |
|---|---|---|
| D86 | Non-terminating job killed at timeout; worker reclaimed; next queued job starts | **Yes** — `jobTimeoutKill.test.js` (Timeout + `rKilled` + next succeeds) |
| D87 | More jobs than workers → excess stays queued; worker count matches container pin | **Yes** — mid-run `queued=2`/`running=1`; compose `R_WORKERS=1` + cpus/mem; source forbids multisession worker formula |

## Verification (this close)

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  first pass: 2 failed (5s timeouts) / 1583 passed / 9 skipped — flakes
  isolation re-run:
    evidenceAccumulation "Day 32 widening…" — passed
    CalibrationConsole "enqueues LSAT7…" — passed
  Product-commit suite for D87 was 1585 passed / 9 skipped

npm run build
  green; recharts 451.37 kB (~25s)
```

- `git status` — clean at product **`f51c7a5`** (`D87: bound…`) before this close commit.
- `master` ≡ `main/master` at product HEAD before close docs.
- No half-applied work. No new compression debt.

## What landed this session

| Unit | Commit | Became (vs plan) |
|---|---|---|
| D86 | `8b0a24f` | Fetch abort already existed; added **kill** + per-kind timeouts + hang endpoint |
| D87 | `f51c7a5` | No multisession bug; added compose limits, `R_WORKERS=1`, dispatcher lock, queue-depth metric/alarm |

Handoffs: `claude/day86-job-timeouts-process-kill.md`,
`claude/day87-concurrency-backpressure-queue-alarm.md`.

## What remains

- **D88** — full benchmark suite / drift (Hub equating image still open)
- **D89** — never-compress: kill R mid live session (W18 **gate**)
- **D90** — never-compress adversarial R track (separate Agent)
- **D54** readiness-mirror agreement — due W18 close
- Close-suite 5s timeout flakes under load (not product regressions)

## Next

Calendar **D88** — full benchmark suite in CI.

## Calendar

D86 already ✅. D87 marked ✅ at this close (dates not moved).
