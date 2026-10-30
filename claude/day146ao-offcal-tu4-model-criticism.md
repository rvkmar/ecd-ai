# Off-calendar: TU4 model criticism

**Not D146.** Analysis half of textbook gap T3. Activation stays TU5. Scoring is unchanged.

Handoff id: day146ao. day146aj through day146an are taken. day146an is TU15.

**Status: DONE.**

## What changed

Converged IRT and DINA/G-DINA runs now record model criticism. A criticism failure does not fail a converged fit. Missing fields still mean today's behaviour. There is no migration and no activation gate.

CDM (`calibrate_diagnostic`), on the parameter set under `fitStatistics`:

- `cdmFit`: GDINA `modelfit` M2, df, p, RMSEA2, SRMSR, and the RMSEA2 interval when the package returns one.
- `qValidation`: GDINA `Qval` suggestions. Each change has the item id, the original q-vector, the suggested q-vector, and that suggestion's PVAF. `eps`, `nItems`, and `nChanged` sit beside the list. Unchanged items are not listed. The suggestion item id is the TU15 parameter key: a unique observable id when the request names one, otherwise the item id. The GDINA fit itself still uses the request item ids as `item.names`.

IRT (`calibrate_irt`), on the parameter set under `fitStatistics`:

- `personFit`: mirt `personfit` Zh. Counts and the proportion of persons with Zh below -2 (Drasgow, Levine and Williams 1985). The cutoff and the rule `Zh < cutoff` are stored. Optional `options.personFitZhCutoff` overrides the cutoff.
- `localDependence`: Yen's Q3 from `mirt::residuals(..., type = "Q3")`. `maxAbsQ3` is the largest absolute off-diagonal value. `flaggedPairs` are pairs with absolute Q3 above 0.2. Optional `options.q3Threshold` overrides that threshold. Optional `options.qvalEps` is passed to `Qval` when it is between 0 and 1.

Sidecars, not on the parameter set:

- `personFitRows`: one row per person (`personId`, `Zh`, `misfit`).
- `q3Matrix`: item ids and the square matrix.

`slimParameterSet` (PR #131) keeps `cdmFit`, `qValidation`, `personFit`, and `localDependence` (including flagged pairs). It strips `personFitRows`, `q3Matrix`, and any person rows or matrix nested under those summaries. Ingest still calls `slimParameterSet`. The calibration job response keeps the sidecars. List and detail omit them. `GET /api/calibrationJobs/:id/person-fit` and `GET /api/calibrationJobs/:id/q3` serve them. The same two routes exist on analysis artefacts when a payload carries them. District person-fit ids are redacted, and a cell under `MIN_CELL_SIZE` is suppressed. The Q3 matrix is item-level.

The calibration job inspect screen and the parameter-set inspect screen show the summaries read-only. Person flags and the matrix load from the job on request. The IRT HTML report states the Zh count and the Q3 summary, not the rows or the matrix.

PerFit was not added. mirt already returns Zh.

Contract validation accepts the new objects and refuses per-person rows or a Q3 matrix inside `fitStatistics`. A response with none of the new fields still validates.

## What was not done

TU5. Activation still checks `converged: true` only. Scoring was not changed. No data migration. Migration 015's scalar-fit check now uses `slimParameterSet`, so a later run of that migration follows the same kept-fit rules.

## Rollback

Revert this change. New calibrations stop writing the criticism fields. Existing parameter sets that already have the summaries keep them. Jobs that already stored sidecars keep them. Activation is unchanged either way.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  3027 passed | 13 skipped (3040). 355 files.
```

There is no lint script and no ESLint config. Node on this machine is v22.23.4. `package.json` asks for `>=24`. The suite passed on 22.

Live R used `rvkmar/r-backend:latest` (`mirt 1.48`, `GDINA 2.13.2`) with this repo's `r-backend/app` mounted, the same shape as CI `lsat7-pipeline`.

```
docker exec -e ECD_REQUIRE_MODEL_CRITICISM_PACKAGES=1 r-backend Rscript /home/app/tests/test-model-criticism.R
  LSAT7 fixture criticism ok
  sim10GDINA fixture criticism ok
  R model criticism tests passed

R_BACKEND_URL=http://127.0.0.1:4000 npx vitest run --fileParallelism false
  benchmarkPerturbation, lsat7, sim10gdina, ctt, dif, equating, item-analysis, test-information
  81 passed.
```

## Calendar

Not D146. Do not merge without an explicit OK. Next in this lane is TU5 (activation gate), then TU6 (bundle scoring) can use the Q3 summary.
