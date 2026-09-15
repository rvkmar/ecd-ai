# D75 — W15 Core sign-off (never-compress)

**Status: DONE** for the calendar exit check: all five claims hold on live
`:6060` plus CI. Product fix from this session: R-job ingest now sets
`statisticalModels[].activeParameterSetId` (same as `/recalibrate`), so
calibrated parameters replace pilot for new sessions.

## Exit checks (what was actually executed)

| # | Calendar claim | Executed? |
|---|---|---|
| 1 | Adaptive session: composite library → EM scoring → SMV posterior with stated precision → stop on accuracy | **Yes** — `s1789288355960` (BayesianNetwork / BN adaptive): selected `t-d56-1` then `t-d56-3`, stopped `targetsMet` at 2 responses; SMV `attrA` estimate 0.95, precision/SEM 0.21 |
| 2 | Diagnostic attribute profile with stated classification accuracy | **Yes** — same session: classification `master`, `requiredClassificationAccuracy` 0.8, `expectedClassificationAccuracy` 0.95; student + teacher reports show “Measurement target met” and attribute profile |
| 3 | R calibration from real responses, provenance, replaces pilot | **Yes** — job `job1789319022666002` → `ps1789319081640` (`calibrationMethod: r-job`, mirt 1.47 provenance). Live EM `em1789318941967` / `sm-irt-2pl` has `activeParameterSetId=ps1789319081640`. **Misalignment fixed:** ingest previously wrote the set but left the active pointer empty (pilot still live); ingest now activates + rolls back on validation failure |
| 4 | LSAT7 + sim10GDINA in CI | **Yes** — [CI run 34960900031](https://github.com/rvkmar/ecd-ai/actions/runs/34960900031): `lsat7-pipeline` steps “LSAT7 full pipeline…” and “sim10GDINA full pipeline…” both **success** |
| 5 | Suite green, clean build, browser-verified | **Yes** — suite **1439 passed / 6 skipped**; build no >500 kB warning (max `recharts` 446.89 kB); four-role walk below |

Plan text framed D75 as “handoff + actuals” (Sonnet/low). Calendar exit check is the
real gate — five behavioural claims. This session treated it as the never-compress
milestone, not docs-only.

## Four-role browser walk (`http://localhost:6060`)

Logins: `admin1` / `dist1` / `teach1` / `stud1` · `WalkPass!2026`.

| Role | Walked |
|---|---|
| **Admin** | Home → Models (Student / Evidence / Calibration). Inspected ingested job / active set (API + prior console). |
| **Student** | Home → Delivery → Reports. Opened `s1789288355960`: Measurement target met; attrA master 0.95. My Sessions correctly empty for attendable (completed sessions are history-only). |
| **Teacher** | Home → Delivery → Sessions. Report modal: Learner Feedback + Teacher Report (strategy BayesianNetwork, stop reason, attribute profile, activities `t-d56-1` / `t-d56-3`). Teacher-report HTTP 200. |
| **District** | Home → Implementation / Delivery → Sessions. View → `/district/sessions/s1789288355960/review`. Calibration tab absent by design (D73b: admin-only). |

## Product change (claim 3 misalignment)

| File | Change |
|---|---|
| `server/r/calibrationIngest.js` | On successful parameter-set ingest, set `sm.activeParameterSetId`; restore previous on validation failure |
| `server/routes/__tests__/calibrationJobsRoutes.test.js` | Assert active pointer equals ingested set |
| `src/components/calibration/CalibrationJobDetail.jsx` | Status copy: “Wrote … and set it active for new sessions” |

Live `:6060` node was patched earlier this session so the EM already shows the
active set; the git change makes that behaviour durable.

## Verification

Product commit: `4d56191`. Close commit: `18eedc5`. Close re-run at session end:

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  105 passed (105)
  Tests  1439 passed | 6 skipped (1445)
  Duration  42.48s

npm run build
  (no chunk-size warning)
  largest: recharts-BYECgA3H.js 446.89 kB
  entry:   index-B0rVVMPF.js     31.23 kB
  built in 44.88s

CI (lsat7-pipeline @ 34960900031): LSAT7 + sim10GDINA success
  (also CTT, planted DIF, known equating steps success on this Hub image)

git: master tracks main/master after push
```

## Honest remaining gaps (not D75 blockers)

- **D68 mid-flight ingest:** no unstopped two-response session on `:6060` this walk
  (`s1789403277647` is `ready` with 0 responses). Still open.
- **D54** readiness agreement test — standing risk.
- **Parameter-set diff UI** (D65 leftover).
- **P2 display:** task rows still `No Q [C: ? , E: ?]` (known since D71).
- Hub equating: this CI run’s “known equating” step succeeded against published
  `r-backend:latest` — D70 ops debt may be dischargeable on a dedicated check;
  not re-scoped into D75.

## Next

**W16** begins (R analytics / reporting service). First calendar unit after D75.
Do not treat the live Reports tab as the W16 psychometric Analytics gate.
