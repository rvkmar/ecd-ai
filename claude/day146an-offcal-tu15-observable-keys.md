# Off-calendar: TU15 key DINA calibration by observable id

**Not D146.** Not a calendar unit. Closes textbook gap T25, the R9 remainder. Does not start TU4.

Handoff id: day146an. day146am is the parameter-set slimming close. day146aj, day146ak, and day146al are taken.

**Status: DONE.** Exit check: a new DINA or G-DINA parameter set keys slip, guess, and G-DINA probabilities by a unique observable id. A request with no observable ids still keys by item id. A mixed vector keys the unique observables and leaves a blank or repeated observable on the item id. Scoring prefers the observable key and falls back to the item. `slimParameterSet` copies those keys through when it strips report HTML.

## Premise

R9 already looks up slip and guess by observable id, then item id. Calibration still wrote the map under `model.itemIds`. Two observables on one item could not keep distinct fitted pairs unless someone authored the keys by hand.

## Choice

`diagnostic_parameter_keys` in `r-backend/app/modules/contract.R` and `diagnosticParameterKeys` in `server/r/calibrationContract.js` are the same rule.

`model.observableIds`, when present on a dina or gdina request, is parallel to `model.itemIds`. A non-empty observable id that appears once becomes the parameter key. A blank observable, or one shared by another column, stays on the item id so each estimate remains reachable: scoring falls through to the item id when the observable id is not a key. A key that collides with another column's item id is refused. Absent `observableIds` means every key is the item id. sim10GDINA and every set already stored are in that last case. Nothing is rewritten.

`calibrate_diagnostic` still passes the request item ids to GDINA as `item.names`. Only the returned `parameters` names change. Live session matrices attach `model.observableIds` from the same primary observable the Q-matrix row already uses. Ingest refuses a converged dina or gdina response whose parameter keys do not match that rule, and does not reshape the map. `slimParameterSet` (PR #131) deletes report and person-score fields only. Observable keys, item keys, and their standard errors stay.

## What was not done

TU4 fit statistics. A migration of active item-keyed sets. Per-observable pilot `dinaParams`. Pooling two items that share an observable into one GDINA column. The published sim10GDINA fixture has no observable ids, so that live path still keys by item.

## Rollback

Revert this change. New jobs key by item id again. Sets already stored under an observable id still score, because lookup tries the observable first. Item-keyed sets are unchanged either way.

## Verification

Rebased onto main `33e21b8` (parameter-set slimming, PR #131).

```
R_LIBS_USER=$HOME/R/library Rscript r-backend/app/tests/test-contract.R
  R contract tests passed

R_LIBS_USER=$HOME/R/library Rscript r-backend/app/tests/test-diagnostic-keys.R
  GDINA 2.13.2 fit: DINA keys obs-a, obs-b, obs-c
  DINA with no observableIds keys item-a, item-b, item-c
  G-DINA mixed keys obs-a, item-b, obs-c
  R diagnostic key tests passed

NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  3025 passed | 13 skipped (3038)
```

`npm run lint` has no script, and there is no ESLint config. The repo guard tests ran inside the suite.

The CI `lsat7-pipeline` job posts to a live `rvkmar/r-backend` container. Docker is not installed on this machine, so that job was not repeated here. sim10GDINA sends no `observableIds`, so that path stays item-keyed. The local GDINA fit is the new-key check.

Node on this machine is v22.23.4. `package.json` asks for `>=24`. The suite passed on 22.

## Calendar

D146 was not marked. TU4 was not started.
