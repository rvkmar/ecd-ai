# Off-calendar: remaining Low gaps R11–R14

**Not D146.** Not a calendar unit. Closes re-audit gaps R11, R12, R13, and R14. Does not start D154. D129 was not reopened. R15 was not reopened. W29 stays open.

Handoff id: day146t.

**Status: DONE.** Exit checks:

- R11: session, learner, and teacher reports attach this examinee's `studentModelRecords` (history included). A peer's row is omitted. Class, district, and dashboard aggregates are unchanged. `administration.carryForward` stays default off.
- R12: a high-a far-b question still loses to a low-a near-b question. Debug is `nearest-difficulty` with no `information`. The path is not deleted.
- R13: after the seed task is answered, a cited delivery-model fixed form delivers the remaining package-pool task. A roster with no delivery model still returns `{}` off-seed. Among a Fisher window, lower `usageCount` wins. Not Sympson–Hetter.
- R14: DELETE of a design pattern is 409 while a seeded evidence or task model cites `seededFrom.designPatternId`. After those rows are gone, DELETE is 200. No tombstone.

## Premise

Checked on HEAD `3f6ee90` (R10). The premises held, with the restatements already on the ledger.

- R11: G16 already writes `studentModelRecords` on finish and serves GET `/api/student-model-records`. Session reports still ignored that collection. Carry-forward is live on `administration.carryForward` and the session body, default false.
- R12: `selectLegacyQuestionCandidate` is still the only `db.questions` reader in selection. Player, submit, and the task XOR still depend on it. Item IRT is already max Fisher. Putting Fisher on b-only question rows is a no-op and still ranks on `irtTheta`.
- R13: G20 already builds the package pool for adaptive IRT/BN. Fixed with a cited delivery model still walked the seed. `item.exposureControl.usageCount` increments on operational submit (R15) and is not a ranking input. G19 `maxPerItem` is per-session.
- R14: the audit's "drops seededFrom" was wrong. DELETE 409s only on templates. Seeded EM/TM keep the id. `GET /:id/descendants` then 404s because the pattern is gone.

## Choice

Four lows in one session because that was the request. Each close is the smaller of the two suggested fixes.

**R11.** Attach existing records to GET `/session/:id`, `/learner-feedback`, and `/teacher-report`. Identity is `resolveStudentIdentity` + `identityOverlaps`. SessionReport reuses `RecordCard`. Do not default carry-forward on. Do not fold history into class/district cells (D99).

**R12.** Record nearest-difficulty as the design limit. Keep the quarantined reader. Do not migrate questions onto items in this gap.

**R13.** Authoritative fixed forms walk remaining unanswered pool ids (`selectFixedFromPool`). Constrained fixed walks `eligibleIds` in that order so an off-seed pool task can win. Adaptive IRT/BN/DINA/G-DINA collect ranked candidates, then `pickByInformationThenExposure` (top 5, lowest `usageCount`, equal counts keep max information). No `Math.random()`, no P(A) table. D56 roster fixed (`selectFixed`) is unchanged.

**R14.** 409 naming `collection` and `id` of the first seeded citer. No tombstone. Snapshot stays. Templates still 409 first.

## What was not done

Default `carryForward` on. Class/district/dashboard reading of `studentModelRecords`. Migrating legacy questions to items. Deleting `selectLegacyQuestionCandidate`. Sympson–Hetter. A per-item P(A) table. Tombstoning a deleted design pattern. D154 ItemMappings write-back. D129.

## Rollback

Revert this change. Session reports go back to one occasion. Legacy IRT stays nearest difficulty (that part is unchanged in substance). Fixed with a delivery model goes back to the seed. Adaptive ranking goes back to first-wins max information. Design-pattern DELETE 409s only on templates.

## Verification

Exit checks as above, plus the D56 roster `{}` pin and the R14 200 after citers are cleared.

```
npx vitest run server/routes/__tests__/d138SeedDivergence.test.js
               server/routes/__tests__/d136PatternTemplateLink.test.js
               server/routes/__tests__/bayesianNetworkReports.test.js
               src/components/sessions/__tests__/sessionReportRoleSplit.test.jsx
               server/delivery/__tests__/activitySelection.test.js
               src/components/reports/__tests__/StudentModelRecordPanel.test.jsx
  103 passed

npx vitest run …related (sessionRoutes, d59ReportsRoleSplit,
               d131DesignPatternsRoutes, studentModelRecordsRoutes,
               itemExposure, studentModelRecord, sessionReportMeasurement,
               d137SeedFromDesignPattern, assemblyProgress)
  109 passed

First full run failed repoGuards: ADAPTIVE_EXPOSURE_WINDOW was exported
with no production caller. Dropped the export. Re-ran:

npx vitest run src/test/repoGuards.test.js (with the targeted R files)
  142 passed

NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2820 passed | 4 skipped (2824). 324 files.

npm run build
  green (52.53s). Largest JS chunk EvidenceModelBuilder 372.26 kB (gzip 87.77 kB).
```

There is no lint script and no ESLint config. Live `:6060` was not rebuilt. Skip count vs R10 (3 → 4) is the live-R auto-detect flake. PsychometricFigure jsdom noise is unchanged.

Git: last committed tip `3f6ee90`. R11–R14 product and this handoff are uncommitted at close. Calendar D154 was not marked.

## Calendar

D146 was not marked. D154 stays next. D155 stays never-compress. W29 stays open.

## Next

The re-audit table has no open High, Med, or Low row. Calendar next is still D154 (ItemMappings write-back). Re-calibrate first. Do not start D154 from this close unless the calendar is the next request.
