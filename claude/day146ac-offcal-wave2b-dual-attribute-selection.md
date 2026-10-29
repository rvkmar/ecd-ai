# Off-calendar: Wave 2B D60 P1-4 dual-attribute selection

**Not D146.** Not a calendar unit. Closes the deferred D60 P1-4 hole: DINA/G-DINA selection ranks an unmeasured attribute at the Student Model Variable's authored `masteryPrior`. Also discharges Wave 2A leftovers (inspect empty-state, live walk debris, stale characterisation/CHANGELOG). Does not start D155. D129 was not reopened. W29 stays open. D60 the adversarial *review* stays closed — this is the deferred implementation, not a re-run.

Handoff id: day146ac.

**Status: DONE.** Exit check: an unmeasured-attribute item is ranked (not skipped) at the SMV prior, and can beat a settled measured-attribute item. A missing SMV, or a declared but invalid prior, stays unrankable. Pool-order remains only when nothing can be ranked.

## Premise (rewritten on contact)

D60 already closed dual-attribute *stopping* (`evaluateDeclaredTargets`). Dual-attribute *selection* still skipped attributes with no live `smvPosteriors`, so attrB items stayed unrankable while attrA items remained. D56 refused to invent `?? 0.5`. True Bayesian networks already fell back to `network.prior`. G-DINA ranking/pilot were already R7/R8 (P1-5).

Wave 2B is therefore: live posterior if finite, else `masteryPrior(smv)` — the same helper accumulation uses (absent `priorDistribution` → p=0.5; declared invalid prior refused). That is not the pre-D56 invention.

## Choice

- Export `masteryPrior` from `attributeAccumulation.js`.
- `diagnosticBeliefForAttribute` in `activitySelection.js`: live `smvPosteriors[id].estimate` wins; otherwise the declared SMV prior; missing SMV or invalid prior returns a reason.
- DINA sums expected information per required attribute. G-DINA still needs a full prior vector; a missing SMV on one required attribute keeps that item unrankable.
- Empty `smvPosteriors` with declared SMVs now ranks at prior (CAT start). Pool-order remains when there is no SMV and no posterior, or slip/guess/Q-vector is missing.
- Authored bernoulli p=0.05 is used as-is, so a live 0.5 on attrA still beats an unmeasured attrB at 0.05.

Did not add PCM, Sympson–Hetter, multivariate EAP, or default carry-forward. Did not reopen D129. Did not invent `?? 0.5` on a missing SMV.

## Leftovers from Waves 2A and 2B

- Inspect pane: when this run has parameters and the statistical model has no `activeParameterSetId`, show “No active parameter set to compare against this run…” (`parameter-set-diff-missing-active`). Walked on Fraction IRT `job1793184918746000` / `sm-frac-irt`.
- D60 characterisation no longer pins P1-4 as a hole, and no longer claims calibrated G-DINA is sequential. `{ table }` (wrong key) still pool-order; `{ probabilities }` ranks (R7).
- CHANGELOG dual-attribute selection and G-DINA lines match the closed units.
- Live `:6060` walk debris deleted: draft Plant part naming clone `cm1793267236887`; announcements **Wave 1 walk teachers only** and **Wave 2 walk public**. Remaining CMs: confirmed Plant part naming and Grade 6 Numeracy - Fractions. Did not archive those confirmed models. Did not clear `activeParameterSetId = ps1793177976685` on Part naming IRT.

## Live walk on `:6060`

Rebuilt and recreated `ecd-node` + `ecd-nginx` from this tree (product files; leftover tests landed after the image). Index `/assets/index-B94H1MXV.js`. Health ok; R reachable; hybrid `ecd-json` + mongo backends.

`admin1` → `/admin/calibration` → Inspect Fraction IRT `job1793184918746000`. The pane rendered the missing-active copy. Did not activate a Fraction candidate.

Dual-attribute ranking is the unit-test exit check (`d60AdversarialSelectionStopping.test.js` P1-4; `activitySelection.test.js` authored p=0.05). This store has no in-flight diagnostic session, so a live CAT ranking was not walked.

## What was not done

Wave 3 W29. Wave 4 limits. D68 / Continue / Newtonian still need a store that can host them. D155. Reopening D129. `docker compose build r-backend`. Did not commit (not asked). Did not archive live confirmed Student Models. Did not run a live dual-attribute session.

## Rollback

Revert the product files. Recreate `ecd-node` + `ecd-nginx` from the previous image. Live deletions of the draft clone and two walk announcements are not restored by a code revert.

## Verification

```
npx vitest run (related)
  3 files, 118 passed

NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  332 passed (332)
  Tests  2879 passed | 4 skipped (2883)
  Duration  200.10s

npm run build
  EvidenceModelBuilder 369.20 kB gzip 87.22 kB
  CalibrationConsole 32.04 kB gzip 8.44 kB
  built in 21.61s

docker compose build node nginx
docker compose up -d --force-recreate node nginx
  ecd-node Recreated / Started
  ecd-nginx Recreated / Started
  nginx EvidenceModelBuilder-l8h_Jcgc.js 371.78 kB gzip 82.67 kB
  nginx CalibrationConsole-BzeGp9AQ.js 32.71 kB gzip 8.34 kB
  nginx index /assets/index-B94H1MXV.js

curl.exe http://localhost:6060/api/health
  status ok, R reachable, servingSessions true

DELETE leftover walk rows (admin token)
  announcements ann1793268510196, ann1793266679344 → 204
  competency model cm1793267236887 → 204
```

Browser: inspect `job1793184918746000` showed “No active parameter set to compare against this run. Activate a candidate, or compare two sets on Parameter Sets.”

## Calendar

Not a calendar unit. D60’s adversarial review was already closed 2026-09-13. This close only discharges deferred P1-4. Last completed calendar unit stays D154. Next remains D155, never-compress, not started. W29 stays open.

## Next

Wave 3 W29 if still wanted. Unexecuted standing walks once the store can host them (D68, Continue, Newtonian). Do not start D155 from this close.
