# Off-calendar: Iteman/Xcalibre report templates and sidecars

**Not D146.** **Not D156.** Not a calendar unit. Off-calendar psychometric track on top of D155. Does not start D156 (AIG). Does not remount `/score`. Does not overload ECD task `templates`. ADR 0001 held. LSAT7 stays dichotomous.

Handoff id: day146ah.

**Status: PARTIAL.** Product is in git (`de19dd0`). Node/schema/UI tests ran. Live R HTML skins and the live `:6060` dashboard walk did not. Unit H is never-compress and was batched with G, I, J, and Phase 3b.

## Exit checks (as executed)

| Unit | Claim | Executed? | Status |
|---|---|---|---|
| G (T2) | `psychometricReportTemplates` collection; job cites `templateId`; ingest stores a frozen snapshot; R skins live under `r-backend/app/reports/`; ECD `templates` unused | **Yes in tests and files.** HTTP CRUD + lifecycle, freeze, job citation, collection-surface guard. Skins `iteman-classic`, `xcalibre-classic`, `district-aggregate` exist. Live enqueue that adopts a template was not walked. | **DONE** (tests) |
| H (T3) | Remaining Iteman/Xcalibre JSON+HTML: omit/not-administered, option mean/SD, domain rpb, CSEM table, T-Rpbis, empirical IRF+SE, scores/TIF/IIF sidecars | **Source present.** Node ingest stores `payload.scores`, `scoresCsv`, `tifCsv`, `iifCsv` when R sends them. Live R HTML with those statistic classes was **not** generated this close. | **PARTIAL** |
| I (T1) | `citation()` / package citations on every HTML report and `payload.credits` | **Artefact path yes.** Ingest keeps `credits`. Live `citation()` / `citation(pkg)` was **not** run. | **PARTIAL** |
| J (T2) | Person scores sidecar; cohort/district aggregates in Node with `MIN_CELL_SIZE`; student audience stays on SessionReport | **Yes in tests.** `cohortAggregates.test.js` gates cells at 5; student audience does not get item keys. Live district HTML was not opened. | **DONE** (tests) |
| Phase 3b (T1) | Dashboards honour the frozen snapshot chapters, show the template name, download scores CSV, open HTML | **Yes in component tests.** Live `:6060` Psychometrics / Calibration walk was **not** executed. | **DONE** (tests) / live walk open |

A green suite is not the H exit check. Record H as in-progress until a live CTT or IRT job produces the HTML with those classes.

## Premise (held)

R stays a queued calibration bureau (`R_BACKEND_URL`). Scoring and CAT stay in JS. Envelope 1.0 is additive optional fields (`reportTemplate` on the request; `scores` / csv sidecars / `credits` on the payload). Existing ECD `templates` are task templates (D126); this track is `psychometricReportTemplates`.

The user ordered Units G–J and Phase 3b in one session. The cadence contract does not permit that mix. The product is one commit; the debt is recorded below rather than hidden.

## What the plan got wrong

- **`unusedProportion`.** The plan's default was 0.05. R already flagged unused options at 0.02. `DEFAULT_REPORT_FLAGS.unusedProportion` is 0.02 so Node and R agree.
- **District HTML.** The plan put aggregate HTML in R. Tenancy and `MIN_CELL_SIZE` (D99, 5) already live in Express. `buildDistrictAggregateHtml` is Node. The R `district-aggregate` skin exists for a bureau report; cohort/district rollups do not leave the Node tenancy boundary.
- **Skin load.** `sys.source(..., envir = emptyenv())` has no `paste`. Skins load with `parent = baseenv()`.
- **Dead exports.** `summariseScoreRows`, `flagCountsFromParameters`, `domainMeansFromTestLevel`, and `createPsychometricReportTemplateRecord` were unexported so `repoGuards` pass. Tests use `aggregateArtefactScores`. `defaultSnapshotForJobKind` was deleted as an unused `src/` export.
- **Template GET.** First cut was any authenticated user. Gated to admin + district; district sees `operational` only. Locked after `confirmed`.
- **Units A–E.** The request was to modify A–E for Iteman/Xcalibre richness. This tree already had the bureau. This session is G–J + Phase 3b on that bureau, not a rewrite of A–E.

Did not remount `/score`. Did not mount `aigRoutes.js`. Did not `docker compose build r-backend`. Compose still bind-mounts `./r-backend/app`.

## What was delivered

- Collection `psychometricReportTemplates` (schema, lifecycle, routes, permissions, inventory, audit, React Query, Psychometrics tab).
- Job `templateId` → freeze snapshot on `request.reportTemplate` → ingest copies it onto the artefact. Later template edits do not rewrite old artefacts.
- Sidecar strip on list/detail (`reportHtml`, scores, csv, grids). Dedicated GET for scores / TIF / IIF / aggregates / aggregate HTML. Student audience is SessionReport.
- R: option mean/SD, omit and not-administered rows, domain rpbis when ≥2 domains, CSEM table, T-Rpbis, empirical IRF with 2×SE, a-vs-b scatter, theta histogram, domain TIF, credits footer, chapter gating, skins.
- Dashboards: template picker on enqueue, chapter honouring, template name, scores CSV download.

## Half-applied work

None in the product. The scoring path is not half-cut-over. The missing piece is the live demonstration of H and I, not a migration applied to some records.

## Compression debt

Unit H (Tier 3, never-compress) shipped in the same session as G (T2), I (T1), J (T2), and Phase 3b (T1). Discharge by a later session that runs a live CTT and IRT job against the bind-mounted `r-backend/app`, opens the HTML, and walks `:6060` Psychometrics (template CRUD, enqueue with template, dashboards, district aggregate, student SessionReport). Until then H and I stay PARTIAL.

## What was not done

D156. Mounting `aigRoutes.js` (D157). Live `:6060` rebuild/walk. Live R HTML with Iteman/Xcalibre classes. Live `citation()`. Publishing a new `rvkmar/r-backend` image. CAT in R. Word output. Editing either plan file. T1–T28 / TU1–TU27. Reopening D129.

## Rollback

Revert `de19dd0` for the product. Revert this close commit for the recording. No live store mutation.

## Verification

On the product tree `de19dd0` (clean, ≡ `main/master` before this close):

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  337 passed (337)
  Tests  2902 passed | 4 skipped (2906)
  Duration  237.14s

npm run build
  green (4m 2s; concurrent with the suite). Largest JS chunk
  EvidenceModelBuilder-BmPpUUcP.js 369.25 kB (gzip 87.24 kB).
  PsychometricsDashboard-hlM0omEN.js 59.35 kB (gzip 16.21 kB).
  CalibrationConsole-Cql0vj6k.js 33.03 kB (gzip 8.68 kB).
  psychometricReportTemplate-CVlGePfI.js 1.03 kB (gzip 0.46 kB).
```

+13 tests vs the D155 close (2889 passed / 3 skipped). Skip count 4 is as-run (live-R auto-detect plus expected PsychometricFigure provenance throws, which still print and are not failures).

Live `:6060` was not rebuilt. Live R was not called.

## Calendar

Not a calendar unit. Last completed calendar unit stays **D155**. Next remains **D156** (`una0bv83i0m98sj7urhv0ngtu4`, “AIG generator bound to templates”), unmarked. Dates were not moved. W31 stays closed. W32 not started.

## Next

Re-calibrate before D156. Do not start D156 from this close. Do not mount `aigRoutes.js` until D157.

Discharge the H/I live walk when a session can run R: enqueue LSAT7 CTT and IRT with an operational report template, open the HTML, confirm credits and the statistic classes, then walk the Psychometrics dashboards on `:6060`. T1–T28 remainder stays recorded, not started.
