# Off-calendar: end-to-end simulation blockers

**Not D146.** Not a calendar unit. Does not reopen R1. Does not start D154.

## Premise

Checked after a full ECD simulation on a local Docker copy of the app. Every sample model was walked draft, reviewed, confirmed. 300 simulated students submitted through the real submit route (4200 submits, 0 refused). Calibration then stopped on three app bugs. Main at the start of this pass was `efd1899` (PR #114: candidates, family item floors, not-converged, Q-matrix item scope).

## What was delivered

### 1. Keyed wrong answers are observed 0s

Evidence identification was treating "this pattern does not activate a supports observable" as counter-evidence, and a selection that matched no pattern as missing. In Mislevy's CAF those are different facts. The evidence rule's direction says how an activated observable bears on the claim. A dichotomous selected-response observable still has two values: 1 on the key, 0 on any other option. The 0 is the other category of the same observable, not a weakens rule.

A keyed dichotomous item now scores `activated: false` when the work product selects something other than the key. The key is the options marked correct, an `equalsCorrect` rule, or an activating pattern that names `selected` option ids. An empty selection, or `skipped: true`, stays `activated: null`, so the live matrix keeps that cell as NA. A selection outside the declared option list, when the item has one, also stays null.

Authors can save an honest distractor row (`activatesObservable: false`, score 0, no strength override) on a supports observable. A non-activation that still carries a score or a strength, and any non-activation on a method that is not dichotomous, is still refused as counter-evidence. That case still belongs on a weakens observable.

### 2. Candidate ingest on a confirmed model with no active set

Since #114, ingest appends a candidate and does not move `activeParameterSetId`. The schema still required a confirmed model to name an active set, and ingest re-ran the whole evidence-model validator, so the first calibration could not land.

`activeParameterSetId` is now required when the model is operational. Scoring and adaptive selection read that pointer. A confirmed model may hold only candidates. The same sentence is on the operational readiness gate, which is the transition that first needs a live set. Pilot delivery of a confirmed model still uses pilot parameters when no set is active. That is the way out of the calibration circle, and it is unchanged.

Ingest validates the new parameter set (provenance, convergence, family, candidate status) and does not re-run confirm-time evidence-model audits. Those audits stay where they apply:

- `fairnessNotes` at draft to reviewed. The lifecycle handler validates the model as reviewed, so the schema rule actually runs.
- `decisionRule`, and the assembly observable and `pilotSampleSize` floors, at confirm. Confirm validates the model as it will be locked (`status: confirmed`), which is why a reviewed model used to pass confirm and then fail the same rules later.
- Assembly floors are not an ingest concern. They still run when the evidence model is confirmed, including when an assembly is already in the database. An assembly authored after the evidence model was confirmed is still caught on the next confirm-time validation of that model, not by storing a candidate.

### 3. Lifecycle consistency

The multidimensional structural audit asked for at least 3 relationships. Evidence-model validation allows one relationship type toward a competency. Two competencies have two ordered pairs, so a floor of 3 forced a second type on one target and the two checks contradicted each other. The floor is now `min(3, n * (n - 1))`. Two competencies need 2 relationships. Three or more still need 3. The audit is not loosened for larger models.

Operational exposure (`usageCount` against the retirement ceiling) still counts only an operational item. A confirmed or pilot administration is a calibration response. Spending the operational ceiling during the pilot would retire items before they go live. The submit note now says that. It is not a scoring failure. No stored shape changed, so there is no migration.

## What was not done

R2 through R14 are unchanged. R9 (slip and guess on the item) is unchanged. Polytomous observables (R5) are unchanged: a non-dichotomous non-activation is still counter-evidence.

D154 was not started.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2670 passed | 10 skipped (2680)
```

The 10 skipped tests are the existing live-R cases. No new skips were added.

Targeted cases cover the keyed matrix, candidate ingest then activate, the reviewed fairness gate, confirm without a decision rule, the relationship floor, and the counter-evidence split. Seeded drafts that the pattern tests promote to reviewed now carry a fairness note, so review can be requested and confirm still refuses a model with no claim.
