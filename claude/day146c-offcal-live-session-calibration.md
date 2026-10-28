# Off-calendar: live sessions feed calibration

**Not D146.** Not a calendar unit. Closes re-audit gap R1. Does not start D154.

## Premise

Checked on main `9e9081e` (D153, plus the R1 to R14 ledger). The premise held.

`POST /api/calibrationJobs` with `source: "sessions"` built an item-analysis job only. IRT, DINA, G-DINA, and CTT jobs used a named fixture or a caller-supplied `responseMatrix`. `runScheduledCalibrationEnqueue` skipped any target without a fixture because live session-matrix builders were not wired. Authored `qMatrixModels` entries were not read. Source session ids were not stored on the job or the parameter set.

## What was delivered

`server/r/liveResponseMatrix.js` builds one response matrix per family from finished sessions (`completed`, `submitted`, `reviewed`, or `isCompleted`).

| Family | Job kind | Matrix |
|---|---|---|
| IRT and Rasch | `irt-parameters` | Scored 0/1. Rasch and `1pl` map to subtype `Rasch`. |
| DINA | `dina-parameters` | Same cells, plus the authored Q-matrix. Family follows the statistical model. |
| G-DINA | `dina-parameters` | Same, with `model.family` `gdina` when the statistical model type is `gdina`. |
| CTT | `ctt-statistics` | Scored 0/1. No Q-matrix. |
| Item analysis | `item-analysis` | The previous session item-analysis contract, including option labels and keys. |

Scope is the job's evidence model and statistical model. Optional `itemIds`, `sessionIds`, `from`, and `to` narrow the rows. A response that names a different `statisticalModelId` is left out. An open session is left out.

A student who did not answer an item gets JSON `null` in that cell. The R contract turns `null` into `NA`. It is not stored as 0, and the column is not dropped.

DINA and G-DINA read `structureConfig.qMatrixId`. Observable-keyed entries win over item-only entries, the same rule as scoring (`entriesForResponse`). A response that does not cite an observable keeps the item row, even when the item has an `observationId`. Items with an empty Q-vector are dropped. Slip and guess stay keyed by item id. That is R9, and it was left alone.

When 50 or fewer sessions contribute, the job stores `sourceSessionIds`, `sourceSessionCount`, and `sourceSessionIdsHash`. Above that, it stores the count and the hash. The Q-matrix id is stored on the job. Ingest copies those fields onto the parameter set. A non-admin view keeps the count and the hash and drops the session ids and the person-level matrix.

Scheduled enqueue uses the live builder when the plan has no fixture, or when `source` is `sessions`. A short sample is skipped with a sentence that names the family, the threshold, and the count. It is not an error, and it does not enqueue. A named fixture, including LSAT7, is unchanged. `source: "fixture"` still requires a fixture name. A caller-supplied `responseMatrix` is unchanged.

The calibration console shows live sessions, a fixture name, or a response matrix, plus the sample size and the Q-matrix id. Completed sessions can start item analysis, IRT or Rasch, CTT, or DINA or G-DINA.

## What was not done

R9. Slip and guess remain item-level. One column per item cannot carry a separate slip and guess for each observable on that item, so observable-level parameters were not added.

DIF, equating, test information, and attribute-profile summaries still need a fixture or a caller-supplied payload. They are not response-matrix families in this change.

## Verification

Targeted tests passed first: live matrix, session item analysis, scheduled enqueue, calibration job routes, the calibration console, calibration job schema, and aggregate redaction.

Close run, after the dead-export guard was satisfied by keeping the session stamp helpers private:

```
baseline on main 9e9081e (worktree, plumber not on :4000):
  NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2627 passed | 10 skipped (2637), 309 files (75.45s)

this branch:
  NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2645 passed | 10 skipped (2655), 310 files (75.61s)

npm run build
  green (1.49s). Largest JS chunk
  EvidenceModelBuilder-gSnoBmEA.js 374.17 kB (gzip 82.94 kB).

npm audit --audit-level=high
  found 0 vulnerabilities
```

The 10 skipped tests are the same count as main. No new skips were added. Plumber was not listening on `:4000`, so the existing live-R cases stayed skipped. LSAT7 remains a named fixture and is covered by `server/r/__tests__/lsat7Pipeline.test.js` inside that suite.

The console change was exercised in `CalibrationConsole.test.jsx`: choosing completed sessions and IRT enqueues `source: "sessions"` with kind `irt-parameters`, and a job row shows Live sessions, the sample size, and the Q-matrix id `qm-live`. A browser walk of `/admin/calibration` was not run in this session.
