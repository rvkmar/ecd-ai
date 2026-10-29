# Off-calendar: DINA slip/guess keyed by observable

**Not D146.** Not a calendar unit. Closes re-audit gap R9. Does not start D154 or R10.

Handoff id: day146r.

**Status: DONE.** Exit check: two observables on one item use distinct slip/guess when the parameter set is keyed by `observableId`. An item-only set still scores. Observable wins when both keys exist. Selection uses the same lookup.

## Premise

Checked on HEAD `67d1a11` (R8). The premise held, with one rewrite.

`accumulateAttributeMastery` and `resolveDinaParameters` looked up `parameterSet.parameters[itemId]` only. Decision 1 in `attributeAccumulation.js` said that was deliberate: two items sharing one observable should not share slip/guess. R4 made the opposite hole: two observables on one item, each with its own Q-row, still shared one pair.

G18 already chose the Q-vector by observable. IRT already used D50 observable-then-item lookup. DINA had not followed.

R1 still keys fitted parameters by item at calibration. That stays. Scoring now accepts an observable key when one is present.

## Choice

The D50 rule, not a new authoring field. `calibratedDiagnosticParams` (same observable-then-item order as `calibratedIrtParams`; a second copy because `evidenceAccumulation.js` already imports this module). Pilot `psychometrics.dinaParams` stay on the item.

Item-keyed R jobs still score. An inverted item row is ignored when a usable observable row exists.

## What was not done

Calibration still writes item-keyed slip/guess (R1). Per-observable pilot values. R10 (jointPrior scope). D129 was not reopened.

## Rollback

Revert this change. Two observables on one item share the item's slip/guess again. Item-keyed sets still work either way.

## Verification

Exit check: content correct at 0.1/0.2 is 9/11; grammar incorrect at 0.02/0.02 is 0.02 (shared item params would have given grammar 1/9). Item-only sets still score. Selection ranks the observable row, not a conflicting unusable item row.

```
npx vitest run server/delivery/__tests__/attributeAccumulation.test.js
               server/delivery/__tests__/activitySelection.test.js
               server/delivery/__tests__/r4MultiObservable.test.js
               server/delivery/__tests__/parameterSourceResolution.test.js
  159 passed

npx vitest run …related (those plus evidenceAccumulation, sessionRoutes,
               day38Walkthrough, mirrorDrift)
  353 passed

NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2805 passed | 5 skipped (2810)

npm run build
  green (36.87s). Largest JS chunk EvidenceModelBuilder 372.26 kB (gzip 87.78 kB).
```

There is no lint script and no ESLint config. Live `:6060` was not rebuilt.

Git: last committed tip `67d1a11`. R9 product and this handoff are uncommitted at close. Calendar D154 was not marked.

## Calendar

D146 was not marked. D154 stays next. D155 stays never-compress. W29 stays open.

## Next

Remaining re-audit rows are Low (R10–R14). R10 is jointPrior scope; D129 stays closed. Do not start D154 from this close unless the calendar is the next request.
