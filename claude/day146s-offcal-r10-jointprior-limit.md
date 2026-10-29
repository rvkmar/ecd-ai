# Off-calendar: jointPrior one-partner design limit

**Not D146.** Not a calendar unit. Closes re-audit gap R10. Does not start D154 or R11.

Handoff id: day146s.

**Status: DONE.** Exit check: continuous IRT/Rasch still update one correlated partner. An SMV correlated with two or more is refused at scoring and at confirm/strict. A larger matrix of disjoint pairs is still valid. BN, DINA, and CTT ignore `jointPrior`. A full multivariate EAP was not built. D129 was not reopened.

## Premise

Checked on HEAD `5c7e9e6` (R9). The premise held.

D129 already scores a 2×2 block and refuses `partnerIndexes.length > 1`. Zero off-diagonal stays on the 1D EAP. GRM with thresholds already falls through to 1D. BN, DINA, and CTT do not read `jointPrior`. Schema validated shape and PSD only; a well-formed three-way joint could be confirmed. `jointPrior.js` still said “shape, defaults, and validation only.” There is no Competency Wizard field for `jointPrior`.

A full multivariate EAP would reopen never-compress D129. That was refused.

## Choice

Record the remaining scope as a design limit, shared by schema and scoring.

`JOINT_PRIOR_MAX_CORRELATED_PARTNERS = 1` and `correlatedPartnerIndexes` live in `src/utils/jointPrior.js`. Confirm/strict calls `jointPriorPartnerLimitErrors`. Scoring reuses the same helper and the same refusal sentence. Shape errors stay in `jointPriorErrors`, so a draft with `{ strict: false }` can still hold a well-formed three-way joint while it is being edited. An n-dimensional matrix of disjoint pairs is still valid.

BN, DINA, and CTT still do not call `decideJointContinuousUpdate`. That is the ignore: DINA and BN because `jointPrior` admits continuous SMVs only; CTT because a raw score is not a latent EAP.

## What was not done

A full multivariate EAP or quadrature. A Competency Wizard editor for `jointPrior`. Ranking from a joint continuous posterior. R11 (cross-occasion student record). D129 was not reopened.

## Rollback

Revert this change. Scoring still refuses two partners (D129). Confirm again accepts a well-formed three-way joint. Comments go back to “shape only.”

## Verification

Exit check: two-partner scoring still matches `/correlated with 2 other/` and has no estimate. Confirm/strict refuses the same three-way joint; `{ strict: false }` does not. Disjoint pairs still take `eap-joint` for the one partner. DINA stays `attribute-mastery-posterior`. BN stays `exact-bayes` and still writes `bnPosteriors`. CTT stays `weighted-proportion` with the raw-score estimate.

```
npx vitest run src/utils/__tests__/d128JointPrior.test.js
               server/delivery/__tests__/d129JointAccumulation.test.js
               server/delivery/__tests__/d130JointGridCoverage.test.js
               server/delivery/__tests__/evidenceAccumulation.test.js
               server/delivery/__tests__/bayesianNetwork.test.js
               server/delivery/__tests__/attributeAccumulation.test.js
  220 passed

npx vitest run …related (those plus sessionRoutes, day38Walkthrough,
               mirrorDrift)
  302 passed

NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2814 passed | 3 skipped (2817)

npm run build
  green (31.01s). Largest JS chunk EvidenceModelBuilder 372.26 kB (gzip 87.78 kB).
```

There is no lint script and no ESLint config. Live `:6060` was not rebuilt. Skip count vs R9 (5 → 3) is the live-R auto-detect flake.

Git: last committed tip `5c7e9e6`. R10 product and this handoff are uncommitted at close. Calendar D154 was not marked.

## Calendar

D146 was not marked. D154 stays next. D155 stays never-compress. W29 stays open.

## Next

Remaining re-audit rows are Low (R11–R14). R11 is a cross-occasion report from `studentModelRecords`. Do not start D154 from this close unless the calendar is the next request.
