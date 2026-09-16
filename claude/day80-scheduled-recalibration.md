# D80 — Scheduled recalibration + W16 handoff

**Status: DONE** for the calendar exit check: an analytics artefact can be
produced after a scheduled enqueue (process + human ingest) and is stored
with package version, sample size, and job id; no scheduled run changes
`activeParameterSetId`, proven by test. Enqueue-only — never ingest.

## Premise on contact

Calendar asked for `server/cron/` that enqueues recalibration and analysis
jobs gated on minimum sample size. Code had only `autoFinishCron.js`
(unmounted from `index.js`). No scheduled calibration path existed.
`calibrationPlan` already carried authoring fields; D80 adds
`scheduledEnqueue` as the opt-in target list.

## The rule that defines this unit

**It ENQUEUES. It never INGESTS.** Replacing an operational parameter set
is a measurement decision through the D65 console, not a timer. A
scheduler that silently swaps live scoring parameters is the most
dangerous thing this block could build.

## What shipped

| Area | Change |
|---|---|
| `server/r/scheduledCalibrationEnqueue.js` | Scan `calibrationPlan.scheduledEnqueue`, min-sample gate, queue jobs |
| `server/cron/scheduledCalibrationCron.js` | Opt-in cron; asserts active-set snapshot unchanged |
| `server/index.js` | Starts cron when `SCHEDULED_CALIBRATION_ENABLED=1` |
| Schema | Light validation for `scheduledEnqueue` |
| Tests | Source invariant + thin-sample skip + artefact exit check |

### Target shape

```js
calibrationPlan: {
  scheduledEnqueue: {
    enabled: true,
    minSampleSize: 30, // default gate
    jobs: [
      { kind: "attribute-profile-summary", fixture: "known-attribute-profile-cohort" },
      { kind: "irt-parameters", fixture: "lsat7", minSampleSize: 1000 }
    ]
  }
}
```

This unit requires a **named fixture** per job (live session-matrix
builders are an honest gap). Sample size is persons in the fixture
request (response matrix or cohort members).

## Exit checks

| Claim | Executed? |
|---|---|
| Cron/enqueue modules do not import or call ingest | **Yes** (source scan) |
| Thin sample skipped; no job written | **Yes** |
| Scheduled enqueue → process → human ingest → artefact with packageVersion, sampleSize, jobId | **Yes** |
| `activeParameterSetId` unchanged by enqueue (and by analysis ingest) | **Yes** |
| Parameter-set kind enqueue also leaves active set untouched | **Yes** |

## W16 block close

| Unit | Status |
|---|---|
| D76 analysisArtefacts collection | ✅ |
| D77 item-analysis | ✅ |
| D78 test-information | ✅ |
| D79 attribute-profile cohort summaries | ✅ |
| D80 scheduled enqueue (this unit) | ✅ |

**Block gate (action plan):** an analytics artefact is produced on a
schedule and stored with the package version that produced it — met via
scheduled enqueue of an analysis kind + operator ingest. The schedule
itself never writes the artefact and never activates a parameter set.

## Honest gaps

- Live response-matrix builders from sessions are not wired; fixtures only.
- Cron is opt-in (`SCHEDULED_CALIBRATION_ENABLED=1`); default schedule
  `15 3 * * *` UTC when enabled.
- Hub equating image / D54 readiness mirror / other standing debt unchanged.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  117 passed (117)
  Tests  1510 passed | 9 skipped (1519)
  Duration  96.29s

npm run build
  largest JS chunk recharts 446.89 kB
  built in 19.15s
```

## Next

**W17** — Psychometric dashboards (D81+). Or EM-R1 off-cal residual.
