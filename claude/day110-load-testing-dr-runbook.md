# D110 — Load testing + DR runbook + W22 handoff (never-compress)

**Status: DONE.** Calendar unit **D110** complete 2026-09-20. **W22 closed.**

## Premise on contact

Calendar: five app-specific load scenarios with **recorded numbers +
configs**; DR runbook as procedure whose restore section matches an
executed restore (D108); W22 deliverables due.

**Code at calibration (`372720f`):** D109 generator committed; D108 restore
record + procedure exist; no load harness; no DR runbook.

**Became:** `performLoadRehearsal` + committed record; `docs/ops/dr-runbook.md`
citing D108; W22 block handoff.

## Exit check

| Claim | Executed? |
|---|---|
| Five recorded numbers with configurations | **Yes** — `docs/ops/load-test-record.json` + `docs/ops/load-testing.md` |
| DR runbook restore section describes executed procedure | **Yes** — `docs/ops/dr-runbook.md` cites D108 record / `npm run backup:restore-rehearsal` |

### The five numbers

| Scenario | Metric | Value |
|---|---|---|
| Autosave @ 300 ms RTT | perceived median | 312.175 ms |
| Dashboard @ D109 bank (480 sessions) | scan median | 0.174 ms |
| Concurrent IRT selection (cohort 30) | wall median | 0.047 ms |
| Composite library (200 items) | build median | 0.226 ms |
| Queue pressure (24 queued) | metrics median | 5 µs (depthAlarm true) |

## Verification

```
npm run load:rehearsal
  → five numbers; wrote docs/ops/load-test-record.json

NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1794 passed | 9 skipped (1803) — 159 files (~285s)

npm run build
  green (~16s)

Session-close re-verify (2026-09-20):
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1794 passed | 9 skipped (1803) — 159 files
npm run build
  green (~16s)
```

## Delivered

| Area | Change |
|---|---|
| `server/load/d110LoadRehearsal.js` | Five scenarios |
| `npm run load:rehearsal` | CLI + record write |
| `docs/ops/load-test-record.json` / `load-testing.md` | Numbers + configs |
| `docs/ops/dr-runbook.md` | Detection → decision → restore → verify → communicate |
| Tests | `server/load/__tests__/d110LoadRehearsal.test.js` |
| W22 | `claude/day110-w22-block-close.md` |

## Next

Calendar **D111** — TaskWizard onto shared shell (never-compress refactor).
