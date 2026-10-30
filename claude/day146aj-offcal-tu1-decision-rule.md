# Off-calendar: TU1 apply authored decision rules

**Not D146.** Not a calendar unit. Closes textbook gap T2. Does not start TU2 or TU3.

Handoff id: day146aj. `day146ag` through `day146ai` were already used.

**Status: DONE.** Exit check: with no authored cut, classification stays at 0.5. An SMV `masteryThreshold` beats an Assembly Model cut, which beats a mastery `decisionRule` cut, which beats 0.5. Invalid cuts are refused. ADR 0004 decision 5 is amended.

## Premise

`evidenceModels.decisionRule` was validated and shown, and the calibration gate read it. Scoring and reports did not. `attributeClassification.js` classified every mastery posterior at `DEFAULT_MASTERY_THRESHOLD = 0.5`.

## Choice

`resolveDecision` and `classifyByRule` live in `server/delivery/attributeClassification.js`. `sourcesForPosterior` gathers the three sources for one posterior.

Precedence:

1. Student Model Variable `masteryThreshold`, a finite number in (0, 1).
2. Assembly Model `masteryThreshold`, same interval.
3. Evidence Model `decisionRule` when it defines a mastery cut: `type` is `mastery`, `threshold` is a finite number in [0, 1], and `direction` is `above` or omitted.
4. `0.5`.

A rule of type `classification`, `posterior_threshold`, or `score_band` does not define this cut. `posterior_threshold` is theta, so a value in (0, 1) is still not used. Direction `below` or `within` is not applied (that would invert, or not be, the marginal-MAP comparison). An invalid `masteryThreshold` is skipped, not applied.

Assembly progress passes the Assembly Model it already chose, then `evaluateClassificationTarget` at the resolved cut. Session, learner-feedback, and teacher reports pass `db` into `sessionMeasurementReport`, which classifies each attribute row with `classifyByRule`. The hardcoded theta and Bayesian network level words are left for TU3. The cohort attribute-profile summary still classifies at the threshold the job asks for (default 0.5).

`masteryThreshold` is optional on `assemblyModels` and on `competencyModels.smVariables`. Schema rejects anything outside (0, 1). Sync keeps the cut on a binary SMV and drops it if the variable type changes. The Assembly Model wizard has an optional number on the identity step. The competency wizard has one on each binary SMV prior card. Blank stays blank. No migration.

## What was not done

TU2 (performance level descriptors). TU3 (rewriting report prose, the 1/0 theta cuts, and the 0.7/0.4 Bayesian network cuts). Applying `below` as an inverted mastery rule. Per-examinee cuts on the D79 cohort summary. A browser walk of the two fields: this environment has no database and no author session. The fields follow the existing number inputs, and schema tests cover the values they can save.

## Rollback

Revert this change. Classification returns to a constant 0.5. Records that already stored `masteryThreshold` are ignored again, because the field is optional and nothing else reads it.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2958 passed | 13 skipped (2971)
```

`npm run lint` has no script, and there is no ESLint config. The repo guard tests ran inside the suite (dead exports, route auth).

Node on this machine is v22.23.4. `package.json` asks for `>=24`. The suite passed on 22.

## Calendar

D146 was not marked. TU2 and TU3 were not started.
