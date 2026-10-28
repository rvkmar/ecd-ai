# Off-calendar: live calibration fixes after a real R run

**Not D146.** Not a calendar unit. Does not reopen R1. Does not start D154.

## Premise

Checked on main `95a95b8` (PR #113, live sessions feed calibration). Four failures showed up when that path was run against a real Plumber service (mirt, GDINA, TAM).

1. `sm-plant-dina` on `em-function` cites Q-matrix `qm-plant`. That matrix covers `it-leaf` and `it-root` (part naming) as well as `it-function`. The builder kept only responses whose `evidenceModelId` was the job's evidence model, so DINA saw one item and failed the item floor.
2. `CONTRACT_MIN_ITEMS = 2` let a 2PL job through with two items. mirt then stopped with "Too few degrees of freedom".
3. The worker stored `converged: false` as `succeeded`. Ingest then refused the job.
4. Ingest set `activeParameterSetId` on every parameter-set write. The decision was to keep ingested sets as candidates until a person activates one.

## What was delivered

### Q-matrix item scope

For DINA and G-DINA, columns are the items the authored Q-matrix covers, intersected with items finished sessions actually answered. An item scored under another evidence model stays in the matrix when the Q-matrix names it. An answered item that the matrix does not cover stays out. An item the matrix names but nobody answered stays out. Observable-keyed entries still win over item-only entries, using the evidence model on the response. A response that names a different `statisticalModelId` is still left out. IRT, Rasch, CTT, and item analysis still scope to one evidence model.

### Item floors

Enforced in the live builder, before enqueue. A scheduled run skips with that sentence and does not enqueue. The ADR envelope still requires two items. Named fixtures are unchanged.

| Family | Minimum items | Why |
|---|---|---|
| Rasch, 1PL, PCM | 2 | mirt fixes the latent mean and variance. J difficulty parameters. J = 2 leaves 1 degree of freedom. |
| 2PL, dichotomous GRM, dichotomous GPCM | 3 | 2J free parameters. J = 2 leaves -1 df, which is mirt's "Too few degrees of freedom". J = 3 leaves 1 df. Live matrices are 0/1, so GRM and GPCM have the same count as 2PL. |
| 3PL | 4 | 3J parameters (slope, difficulty, guessing). J = 3 leaves -2 df. J = 4 leaves 3 df. Stable guessing still wants more people. This floor only stops the unidentified model. |
| DINA, G-DINA | 3 | Slip, guess, and the attribute-class distribution. Even one attribute is unidentified at J = 2 (5 parameters, 3 patterns). J = 3 is the smallest saturated single-attribute matrix. The plant Q-matrix has three items. |
| CTT | 2 | A p-value and a point-biserial are defined at two items. TAM::tam.ctt2 accepts that. |
| Item analysis | 2 | Same classical counts. The 10-student floor is unchanged. |

### Non-converged jobs

A contract-valid R body with `converged: false` is status `not-converged`, not `succeeded`. The R `error` object is kept (message, rClass, stderr). The response envelope is kept. Ingest still requires `succeeded` and `converged: true`. Retry is allowed, same as `failed`. The jobs list badge and the inspect view show `not-converged` and the R message, and they do not offer Ingest.

### Candidates

Ingest appends the parameter set with `status: "candidate"` and does not change `activeParameterSetId`. Scoring and adaptive selection still read only the active pointer. `POST /api/evidenceModels/:id/activate-parameter-set` is the explicit activation. It stamps `activatedAt` and `activatedBy`, marks that set `active`, and demotes any other set that was marked `active` back to `candidate`. The calibration job inspect view has an Activate candidate button after ingest. The parameter-set registry and the wizard viewer show a Candidate badge and the same button. `saveDB` still writes `parameter_set.replace` with the actor and the time when the pointer moves. A candidate ingest that leaves the pointer does not write that replacement. Recalibrate still makes the committed file the active set, because that route is the person's commit, and it now stamps the same status fields so the pointer and the status cannot disagree.

Migration `010-parameter-set-status` stamps stored sets. The set named by `activeParameterSetId` becomes `active`. Every other set becomes `candidate`. The pointer does not move, so existing active sets, fixtures, and pilot parameters keep scoring. A second run changes nothing.

### Sample keys

The four shipped sample items now set `isCorrect` on the option that the evidence activation map already treats as the key (leaf `opt_a`, root `opt_b`, leaf function `opt_a`, fraction `opt_a`). Item analysis can read that key. The sample zip was rebuilt from the JSON files.

## What was not done

R9. Slip and guess stay on the item.

DIF, equating, test information, and attribute-profile summaries are still fixture or caller-supplied. They are not live response-matrix families.

The ADR contract's "at least two items" check is unchanged. Family floors are enforced on the live builder, which is the path that was sending two-item 2PL jobs to R.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2657 passed | 10 skipped (2667), 311 files
```

The 10 skipped tests are the existing live-R cases. Plumber was not listening on `:4000`. No new skips were added.

The calibration console test clicks Ingest, reads the candidate sentence, clicks Activate candidate, and inspects a `not-converged` job (R message visible, Retry offered, Ingest absent). A live browser walk of `/admin/calibration` was not run.
