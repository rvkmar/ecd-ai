# Off-calendar: TU12 Bayesian network calibration

**Not D146.** Textbook gap T8. Conditional probability tables are estimated from responses. The activation gate is TU5 (`claude/day146ap-offcal-tu5-activation-gate.md`). Model criticism for IRT and CDM is TU4 (`claude/day146ao-offcal-tu4-model-criticism.md`).

Handoff id: day146ar. day146ao is TU4. day146ap is TU5. day146aq is TU6. day146as is reserved for TU19.

**Status: DONE.**

Rebased onto main `0e0f181` (TU6, PR #135). TU6 bundle scoring, the Q3 review screen, and the short `scoringBundles` summary on a parameter set are unchanged.

## What changed

A `bn` calibration family estimates the Evidence Model's conditional probability tables by EM. The structure is the authored latent tree: student-model variables to observables, each node at most one parent, joint at most 64 configurations, the same tree exact scoring already accepts. Observables are binary. Missing cells stay missing. The estimator is base R. No new package.

Job kind `bn-parameters` ingests a candidate parameter set. It does not activate. The live console offers it for a `bayesian_network` statistical model. `calibrationPlan.scheduledEnqueue.jobs` can name the same kind with `source: "sessions"`. The request's `model.network` is that tree. Columns are the observable ids.

R is `POST /calibrate/bn`. A one-latent network is stored as a star `bayesian-cpt`: flat `_prior`, and `P(u = 1 | state)` on each observable. A larger tree stores root priors under `_prior`, each child latent as parent-state to child-state, and the same observable rows. That is the shape scoring already reads. Higher state indexes are started with a higher chance of a correct response, so the last state stays the positive state.

`fitStatistics.bnFit` on the parameter set holds the observed-data log-likelihood, AIC, BIC (the BIC sample size is the number of persons), the free-parameter count, and the mean and maximum absolute gap between each observable's sample proportion and the model marginal. Per-observable residual rows stay with that summary. They are not person rows.

Person-level latent posterior marginals are `bnPersonPosteriors`. Ingest writes them to an analysis artefact of kind `bn-parameters` and sets `analysisArtefactId` on the candidate. `slimParameterSet` drops them, including a copy nested under `bnFit`, and still keeps a TU6 bundle summary and `fitGate`. List and detail omit them. `GET /api/calibrationJobs/:id/bn-posteriors` and the same path on an analysis artefact serve them. District ids are replaced and a cell under `MIN_CELL_SIZE` is suppressed.

The TU5 gate treats `bayesian_network` as its own family. House defaults, overridable from `calibrationPlan.fitThresholds`:

| Key | Default | What it checks |
|---|---|---|
| `bnMeanAbsResidualMax` | 0.05 | Mean absolute marginal residual across observables. Same five-point scale as the SRMSR default. |
| `bnMaxAbsResidualMax` | 0.10 | Largest absolute marginal residual. One observable cannot be off by more than ten points. |

AIC and BIC are stored so two candidate sets can be compared. They have no absolute pass line, so they are not checks. A BN set with no residual summary is `not_evaluated` and activation proceeds. That covers an imported `bayesian-cpt` and any set from before this change. A residual over the cut is HTTP 400 unless `fitOverride` has a reason, the same override TU5 already records.

The calibration review screen shows the log-likelihood, AIC, BIC, and the two residuals.

## What was not done

No standard errors. EM does not return them. Scoring was not changed: a candidate is not live until someone activates it, and activation still goes through the TU5 gate. AIC and BIC are not thresholds. No data migration. TU6 bundle collapse stays on dichotomous IRT only. This run did not execute the suite inside the published `rvkmar/r-backend` image. The EM test ran with local R 4.3.3. CI runs the same script in that image. jsonlite is used only to round-trip the fixture the way plumber parses a body. The estimator does not call it.

## Rollback

Revert this change. New jobs stop offering `bn-parameters`. A parameter set that already holds a learned table keeps scoring it. An artefact that already holds person posteriors keeps them. Sets with no `bnFit` stay `not_evaluated` at activation. TU6 bundles are untouched either way.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  3099 passed | 13 skipped (3112). 362 files.
```

TU6 reported 3088 passed and 13 skipped. The 11 new tests are the BN contract, the live tree, scheduled enqueue, ingest, the fit gate, the slim sidecar, and the review panel.

```
Rscript r-backend/app/tests/test-bn-calibration.R
  star CPT recovery ok
  tree CPT recovery ok
  non-binary refusal ok
  R Bayesian network calibration tests passed
```

The star is 2000 persons and three observables. The tree is 2500 persons, two latents, and four observables. Recovered probabilities are within 0.08 of the tables that generated the data. A few cells are missing. A non-binary cell is refused.

There is no lint script and no ESLint config. Node on this machine is v22.23.4. `package.json` asks for `>=24`. The suite passed on 22.

## Calendar

Not D146. Do not merge without an explicit OK. day146as stays free for TU19.
