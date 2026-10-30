# Off-calendar: TU19 LLTM task covariates

**Not D146.** Textbook gap T12. Family-level psychometrics for generated tasks. D155 is already closed on main. The activation gate is TU5 (`claude/day146ap-offcal-tu5-activation-gate.md`). TU6 bundle scoring (`claude/day146aq-offcal-tu6-q3-bundles.md`) is on this base and is unchanged.

Handoff id: day146as. day146ar is reserved for TU12. day146aq is TU6. day146ap is TU5.

**Status: DONE.**

Rebased onto main `77c9cd5` (TU12, PR #136), which itself includes TU6.

## What changed

`POST /calibrate/lltm` fits a linear logistic test model. Task Model Variable assignments are the item covariates. Categorical and ordinal variables are treatment contrasts. The reference level is the first library level that appears in the scored items. The reference pattern, every covariate at its reference level, is a row of zeros. There is no intercept column, because conditional maximum likelihood does not identify one.

`eRm::LLTM` is the fit when that package is installed. eRm estimates easiness, and the service reports difficulty as the negative of those basic parameters. A positive effect means that level is harder than the reference. When eRm is absent and mirt is installed, the service fits a Rasch model (latent mean 0) and projects those difficulties onto the same design. That path is labeled `mirt Rasch linear item covariates`. It is not labeled as eRm::LLTM. Its standard errors ignore the uncertainty in the first-stage difficulties.

`POST /api/templates/:id/lltm` (admin) builds the matrix from items that cite the template's task specs. A caller may send `responseMatrix` instead. Closed sessions supply 0/1 from `activated`. A missing cell stays missing. The route writes:

- a slim `predictedParameters` block on each task spec the design can score (`parameterStatus` and `origin` are `predicted`, Rasch `a` is 1, `b` and `bSe` when the covariance is available, the source model, the normalization sentence, and the covariate effects with standard errors)
- an `lltm` analysis artefact with the design, covariance, and response matrix
- a succeeded calibration job of kind `lltm` that points at that artefact and does not carry an item-parameter map

Specs whose levels were not in the fit are left unchanged and listed as `unpredicted`. The job kind is not accepted on the calibration queue. The queue answer points at the template route.

Predicted values are not a parameter set. The seed does not append `parameterSets` and does not change `activeParameterSetId`. Activation and recalibrate both refuse a set flagged `predicted`, `origin: predicted`, `estimation: predicted`, `predicted: true`, or `calibrationMethod` `predicted` or `lltm-predicted`. That refusal happens before the TU5 grandfather, before `not_evaluated`, and before the TU12 BN residual checks. An override does not apply. A real calibration, a set without that flag, still follows TU5. A BN set is still judged on mean and max absolute marginal residual (defaults 0.05 and 0.10). AIC and BIC stay ungated. A BN set with no residual summary is still `not_evaluated`.

`slimParameterSet` still keeps `fitGate` and a short TU6 bundle summary. It strips `lltmDesign`, `lltmVcov`, and `covariateCovariance` if those land on a parameter set.

The generated-family panel shows a Predicted difficulty column, the effects, and an "Estimate predicted difficulties" button. The Task Model Variable edit form lists effects estimated for that variable.

No migration.

## What was not done

No automatic activation, and no copy of the prediction onto an evidence-model parameter set. Numeric Task Model Variables are a single column when they vary. A level the fit never saw is not given a difficulty. The mirt path was not executed here: this machine has eRm 1.0.4 and does not have mirt. The projection that the mirt path uses was checked on a shifted difficulty vector. The hub image has mirt and may not have eRm, so CI runs the mirt path.

## Rollback

Revert this change. Task specs that already store `predictedParameters` keep the field, and nothing reads it for scoring. New estimates stop. The TU5 gate stops refusing the predicted flag. TU6 bundle scoring is untouched either way.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  3112 passed | 13 skipped (3125). 365 files.
```

Rebased onto main `77c9cd5` (TU12). The suite includes the TU12 BN calibration and residual-gate tests, the TU6 bundle tests, the LLTM seed, and the refusal of a predicted set before those BN checks.

There is no lint script and no ESLint config. Node on this machine is v22.23.4. `package.json` asks for `>=24`. The suite passed on 22.

```
Rscript r-backend/app/tests/test-lltm.R
  LLTM recovery passed (eRm::LLTM)

Rscript r-backend/app/tests/test-contract.R
  R contract tests passed

Rscript r-backend/app/tests/test-diagnostic-keys.R
  R diagnostic key tests passed (GDINA not installed; fit skipped)

Rscript r-backend/app/tests/test-bundle-grm.R
  mirt not installed; skipped bundle GRM fixture
  R bundle GRM tests passed

Rscript r-backend/app/tests/test-model-criticism.R
  mirt not installed; skipped LSAT7 fixture
  GDINA not installed; skipped sim10GDINA fixture
  R model criticism tests passed
```

The recovery fixture is a Bloom-by-register family (remember and formal are the references). True difficulty shifts are 0.30, 0.70, 1.10, and -0.40. With 1500 persons, eRm recovered each effect within 0.20 and with the correct sign. Item contrasts match the effects.

## Calendar

Not D146. Do not merge without an explicit OK.
