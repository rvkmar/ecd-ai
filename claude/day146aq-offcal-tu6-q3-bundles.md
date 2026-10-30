# Off-calendar: TU6 Q3 bundles

**Not D146.** Textbook gap T10. Surfaces the Q3 summary from TU4 and adds opt-in bundle scoring. The activation gate is TU5 (`claude/day146ap-offcal-tu5-activation-gate.md`) and is unchanged.

Handoff id: day146aq. day146ao is TU4. day146ap is TU5.

**Status: DONE.**

Rebased onto main `5ecaf12` (TU5, PR #134).

## What changed

Calibration review (the job inspect screen and the parameter-set registry) shows Yen's Q3 in words. A pair is flagged when the absolute residual correlation is above the threshold stored on `fitStatistics.localDependence`. The default is 0.20 (Yen 1984). The same cut is `maxAbsQ3` on the TU5 gate. The matrix, loaded from `GET /api/calibrationJobs/:id/q3`, is a table. Cells over the threshold are marked. When the matrix is loaded, the screen also states the mean absolute off-diagonal Q3. The flag stays the fixed threshold, so a pair can sit above that mean and still be unflagged.

Flagged items that share a work product (`interaction.workProductId`) or a passage (`stimulus.passageId`, `stimulus.sharedStimulusId`, or the same passage text on a `passage_based` item) are listed as a bundling candidate. An admin can enable that bundle. The write is `PUT /api/evidenceModels/:id/scoring-bundles`. A confirmed model stays locked. This route only writes `scoringBundles`. An empty list clears the field.

`scoringBundles` is optional. Absent, or `enabled` not true, means each item stays an independent 0/1 likelihood.

When a dichotomous IRT live matrix (2PL, 3PL, or Rasch) has an enabled bundle and every member is in the matrix, the request carries `bundles`. R replaces those columns with one integer sum. A missing member stays missing, not zero. The sum is fit as graded (GRM). The other columns keep the request subtype. A mixed table no longer copies empty GRM thresholds onto the dichotomous items, and a failed graded fit is not retried as a default 2PL. The response adds a small `scoringBundles` summary (id, members, model `GRM`, max score). Ingest copies that summary onto the parameter set. The Q3 matrix and the collapsed response matrix stay off the parameter set. `slimParameterSet` keeps the summary and TU5 `fitGate`, and drops a matrix nested on a bundle row.

Delivery reads the parameter set the response was scored against. If that set records a GRM bundle, the member items become one graded sum. A partial bundle is excluded rather than scored as separate items. A set with no `scoringBundles` is scored one response at a time, including every set calibrated before this change. Pilot parameters are not bundled.

The TU5 gate still reads `fitStatistics.localDependence.maxAbsQ3`. After a bundle fit, that value is the largest absolute Q3 on the collapsed columns. A bundle set under 0.20 can be activated. A bundle set over 0.20 is refused unless the request records a fit override. Graded thresholds (`b` as a vector) do not change the check. `slimParameterSet` leaves both the bundle summary and `fitGate` on the set.

## What was not done

No testlet or bifactor model. A statistical model that is already GRM, GPCM, or PCM does not also collapse bundles. A bundle whose members are not all in the live matrix is left as separate items for that run, and the column count after collapse must still meet the family's item floor. No migration. TU5 thresholds and the override rule were not changed.

## Rollback

Revert this change. New calibrations stop sending bundles. Evidence models that already have `scoringBundles` keep the field, but nothing reads it. Parameter sets that already record a bundle keep scoring that sum until they are replaced. Sets without the field stay item-level. The TU5 gate is unchanged either way.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  3088 passed | 13 skipped (3101). 361 files.
```

Rebased onto main `5ecaf12` (TU5). The suite includes the TU5 fit-gate tests and a check that a bundle GRM set passes or fails `maxAbsQ3` the same way as any other IRT set.

There is no lint script and no ESLint config. Node on this machine is v22.23.4. `package.json` asks for `>=24`. The suite passed on 22.

Live R used `rvkmar/r-backend:latest` with this repo's `r-backend/app` mounted.

```
docker run -e ECD_REQUIRE_MODEL_CRITICISM_PACKAGES=1 rvkmar/r-backend:latest \
  Rscript /home/app/tests/test-bundle-grm.R
  bundle GRM fixture ok
  R bundle GRM tests passed

docker run -e ECD_REQUIRE_MODEL_CRITICISM_PACKAGES=1 rvkmar/r-backend:latest \
  Rscript /home/app/tests/test-model-criticism.R
  LSAT7 fixture criticism ok
  sim10GDINA fixture criticism ok
  R model criticism tests passed
```

The bundle fit prints one mirt warning (`seq_len` length.out) and still converges. LSAT7 stays an unbundled 2PL and does not gain `scoringBundles`.

## Calendar

Not D146. Do not merge without an explicit OK.
