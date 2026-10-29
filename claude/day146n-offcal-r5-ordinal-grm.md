# Off-calendar: ordinal observables and Samejima GRM

**Not D146.** Not a calendar unit. Closes re-audit gap R5. Does not start D154.

Handoff id: day146n.

**Status: DONE.** Exit check: a rubric or human rating stores a level, not only 0/1, and a GRM item with two thresholds scores the middle category differently from 0 and from the top. Dichotomous Rasch is unchanged.

## Premise

Checked on HEAD `4e64d1a` (R4). The premise held.

`scoreResponse` still mapped `activated` to 0/1. Rubric identification compared ratings to `activatesAt` and kept only the boolean. Human rating required `activated: true | false`. Continuous IRT was 3PL. Vocabulary already mapped `irt` + `grm`/`graded` to polytomous scoring, and R already named GRM in the live matrix contract. Delivery never scored a category.

## Choice

Identification stores `value` (the rating) and `category` (0-based index in declared levels) when a rubric or a polytomous `categoryValue` pattern produces one. `activated` stays, so DINA, BN, and CTT keep today's 0/1 path.

Human rating accepts `value`, `level`, or `category` as well as the boolean. A numeric level with no boolean becomes `activated: level > 0`. `require_agreement` compares levels when both sides have one.

Samejima GRM is the polytomous family. Parameters are `{ a, thresholds: [b1,…,bm] }` or an array `b`. Categories are 0…m. `P*(k) = logistic(a(θ − b_k))` is P(U ≥ k). A single threshold is 2PL. Dichotomous items without thresholds still use 3PL. GRM items skip D129's joint path; that likelihood is still dichotomous (R10).

Live calibration cells for GRM/GPCM/PCM send the stored category, not 0/1.

No migration. Existing binary responses score as before. A GRM parameter row with no stored category is excluded rather than collapsed.

## What was not done

PCM / GPCM scoring. Adaptive Fisher ranking still needs a scalar `b`, so GRM items are not selected that way. R6 (single-latent BN). R9 (DINA slip/guess by observable).

## Rollback

Revert this change. Binary identification and 3PL likelihood return.

## Verification

Exit check: ordinal stored and scored; dichotomous Rasch unchanged.

```
npx vitest run server/delivery/__tests__/evaluationArtifacts.test.js
               server/delivery/__tests__/evaluationPhases.test.js
               server/delivery/__tests__/evidenceAccumulation.test.js
               server/delivery/__tests__/d123MultiPhaseEvaluation.test.js
               server/r/__tests__/liveResponseMatrix.test.js
  145 passed

npx vitest run server/routes/__tests__/day38Walkthrough.test.js
               server/delivery/__tests__/r4MultiObservable.test.js
               server/delivery/__tests__/attributeAccumulation.test.js
               server/delivery/__tests__/bayesianNetwork.test.js
               server/delivery/__tests__/d129JointAccumulation.test.js
  88 passed

NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2782 passed | 4 skipped (2786)

npm run build
  green (3m 21s). Largest JS chunk EvidenceModelBuilder 372.12 kB (gzip 87.70 kB).
```

There is no lint script and no ESLint config. Live `:6060` was not rebuilt.

Git: last committed tip `4e64d1a`. R5 product and this handoff were uncommitted at close. Calendar D154 was not marked.

## Calendar

D146 was not marked. D154 stays next. D155 stays never-compress. W29 stays open.

## Next

Remaining Med: R6, R7. R6 is the single-latent Bayesian network limit; it is quiet scoring and still runs alone. Do not start D154 from this close unless the calendar is the next request.
