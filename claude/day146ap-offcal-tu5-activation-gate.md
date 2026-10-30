# Off-calendar: TU5 activation fit gate

**Not D146.** Gate half of textbook gap T3. The analysis half is TU4 (`claude/day146ao-offcal-tu4-model-criticism.md`).

Handoff id: day146ap. day146ao is TU4.

**Status: DONE.**

## What changed

Activating a parameter set checks fit thresholds. The check runs on both paths that make a set active:

- `POST /api/evidenceModels/:id/activate-parameter-set`
- `POST /api/evidenceModels/:id/recalibrate` (that route still commits the new set as the active set)

`server/r/calibrationIngest.js` still stores a candidate and does not activate. The gate is not applied there, so a poor fit can be stored and inspected before someone decides to activate it.

Thresholds come from `calibrationPlan.fitThresholds`. A finite number on a known key replaces the default. Other keys are ignored. `m2PValueMin` is off unless the plan sets it.

House defaults, in `src/utils/fitActivationGate.js`:

| Key | Default | What it checks |
|---|---|---|
| `itemFitPValueMin` | 0.05 | IRT only. An item is flagged when S-X2 `p.S_X2` is below this (Orlando and Thissen 2000). The flag is the input to the share, not a failure by itself. |
| `misfitItemShareMax` | 0.1 | IRT: share of flagged items. CDM: share of items with a Qval suggestion. Fail when the share is greater than this. A share equal to the maximum passes. |
| `rmseaMax` | 0.05 | IRT M2 `RMSEA`, or CDM `RMSEA2`. Close fit (Maydeu-Olivares; Browne and Cudeck). |
| `srmsrMax` | 0.05 | IRT M2 `SRMSR` (or `SRMR`), or CDM `SRMSR`. |
| `personMisfitShareMax` | 0.05 | IRT only. Share of persons with Zh below the stored cutoff (TU4 default -2; Drasgow, Levine and Williams 1985). |
| `maxAbsQ3` | 0.2 | IRT only. Yen's absolute Q3 flag, the same cut TU4 uses. |
| `m2PValueMin` | off | CDM only, and only when the plan sets a number. The M2 p-value must be at least that number. Left off because a chi-square p-value rejects good large samples. |

Family follows the statistical model type. `irt` uses the IRT checks. `dina` and `gdina` use the CDM checks. Any other type has no checks. If the type is blank, `cdmFit` or `qValidation` selects CDM, and `itemFit`, `personFit`, `localDependence`, or `global` selects IRT.

A statistic that is absent, or a summary with `available: false`, skips that check. If every check for the family is skipped, the result is `not_evaluated` and activation proceeds. That is today's behaviour for sets from before TU4, seed sets, and a recalibration that omits `fitStatistics`.

A failing check returns HTTP 400. The body has `error`, `details` (one sentence per failed check), and `fitGate.failedChecks`.

`fitOverride: { reason }` with non-empty text after trimming allows activation. The parameter set stores `fitGate.status` `override`, the reason, the user (`username`, otherwise `id`), the time, and the failing checks. The same reason, user, and failing checks are added to the `parameter_set.replace` audit entry that `saveDB` already writes when the active pointer moves. An explicit override with a blank reason is HTTP 400 and does not activate. A passing set ignores an override and stores `override: null`.

A set that is already `activeParameterSetId` is grandfathered. Activating it again returns 200, does not re-check fit, does not write `fitGate`, and does not save. Nothing scans existing active sets. There is no migration and no retroactive deactivation.

`slimParameterSet` keeps `fitGate`, including the override reason and the failed checks. It still strips report HTML, person rows, and the Q3 matrix.

The parameter-set registry, the wizard parameter-set viewer, and the calibration job inspect screen show the gate result and, on an override, the reason and who recorded it. After a refusal they ask for a reason and send `fitOverride`. An already-active set with no `fitGate` is labelled as staying in place.

## What was not done

Scoring is unchanged. TU6 bundle scoring is not started. Ingest does not refuse a bad fit. The M2 p-value is not a default check. No data migration.

## Rollback

Revert this change. New activations stop checking fit. Parameter sets that already store `fitGate` keep the field. Already-active sets were not rewritten either way.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  3066 passed | 13 skipped (3079). 359 files.
```

27 of those tests are new. TU4 reported 3049 passed and 3 skipped. The extra 10 skips here are live R pipeline tests (`describe.skipIf(!liveR)`). The R backend is not running in this environment. No test failed.

There is no lint script and no ESLint config. Node on this machine is v22.23.4. `package.json` asks for `>=24`. The suite passed on 22.

The activation screens were exercised in component tests (stored override text, and the reason form after a refused activate). A logged-in browser walk of the wizard was not run.

## Calendar

Not D146. Do not merge without an explicit OK. Next in this lane is TU6 (bundle scoring can use the Q3 summary) or TU12, which should use this gate.
