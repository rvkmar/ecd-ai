# Off-calendar: Bayesian network latent trees

**Not D146.** Not a calendar unit. Closes re-audit gap R6. Does not start D154 or R7.

Handoff id: day146o.

**Status: DONE.** Exit check: a two-latent tree with one latent-to-latent edge scores both student model variables by exact inference. The one-latent star path is unchanged. A cycle, two parents, or a joint larger than 64 configurations is refused.

## Premise

Checked on HEAD `971d20b` (R5). The premise held.

`accumulateBayesianNetwork` and `bayesianNetworkAuthoringErrors` still required a naive-Bayes star: one latent, edges only latent → observable. A second latent was refused at save and at scoring. F24 already writes `bnPosteriors[smvId]` as the last-state probability. D129 `jointPrior` is a continuous bivariate EAP and was not read.

## Choice

Exact inference for a small tree, not a policy note. Each node has at most one parent. The joint is enumerated in log space (at most `MAX_BN_JOINT_CONFIGS` = 64 configurations), then marginalized per student model variable. The one-latent star still uses `updateDiscretePosterior` and returns one posterior object.

A tree returns one posterior per latent. `accumulateEvidence` concatenates them. Two Evidence Models that claim the same SMV still collide; one Evidence Model updating two SMVs does not.

Selection ranks an observable from the current belief over its parent SMV, not always from the root.

The config panel seeds `latentNodes` only when empty. A second latent that was imported or typed in is left alone. There is no tree editor in this pass.

## What was not done

A full multi-parent DAG (junction tree, loopy belief). Approximations for a joint larger than 64. Carrying a child marginal independently of its parent (only roots take a carried-forward prior; children are generated from the CPT). PCM scoring (R5 leftover). G-DINA selection (R7). D129 was not reopened.

## Rollback

Revert this change. Multi-latent networks are refused again. The star path returns.

## Verification

Exit check: two-latent exact posterior 0.8 / 0.68; star 0.8/0.2 unchanged; cycle, two parents, and a 5³ joint refused.

```
npx vitest run server/delivery/__tests__/bayesianNetwork.test.js
  22 passed

npx vitest run server/delivery/__tests__/bayesianNetwork.test.js
               server/delivery/__tests__/evidenceAccumulation.test.js
               server/delivery/__tests__/activitySelection.test.js
               server/routes/__tests__/day38Walkthrough.test.js
               server/delivery/__tests__/attributeAccumulation.test.js
               server/delivery/__tests__/d129JointAccumulation.test.js
               server/routes/__tests__/bayesianNetworkReports.test.js
  271 passed

NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2786 passed | 5 skipped (2791)

npm run build
  green (33.37s). Largest JS chunk EvidenceModelBuilder 372.26 kB (gzip 87.78 kB).
```

There is no lint script and no ESLint config. Live `:6060` was not rebuilt.

Git: last committed tip `971d20b`. R6 product and this handoff were uncommitted at close. Calendar D154 was not marked.

## Calendar

D146 was not marked. D154 stays next. D155 stays never-compress. W29 stays open.

## Next

Remaining Med: R7. R7 is G-DINA selection (D60 P1-5) and still runs alone. Do not start D154 from this close unless the calendar is the next request.
