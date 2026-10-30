# ADR 0004 — Mastery classification decision rule

**Status:** Accepted (decision 5 amended 2026-10-30, TU1)
**Date:** 2026-09-13 (Day 57, Week 12)
**Deciders:** ecd-claude build
**Depends on:** Day 36's `delivery/attributeAccumulation.js` (the marginal mastery
posterior), Day 17/54's `assemblyModels.targetsBySMV[].requiredClassificationAccuracy`,
Day 34's `delivery/assemblyProgress.js`, Day 56's `delivery/activitySelection.js`
(the `targetsMet` stopping rule that consumes this)

## Context

`attributeAccumulation.js` computes a joint posterior over all 2^K attribute-mastery
profiles and reports, per attribute, the marginal `estimate = P(alpha_k = 1 | X)`.
Nothing turns that continuous probability into the discrete "has mastered / has not
mastered" statement a diagnostic report is for.

The consequence is recorded in three places already. `assemblyProgress.js` sets
`stoppingCriterionMet: null` for any `requiredClassificationAccuracy` target with an
explicit "no decision rule exists yet" comment. `assemblyModelsRoutes.js:15` says the
field is surfaced but nothing evaluates it. The D54 Assembly Model wizard tells the
author, on screen, that the target is not enforced. D40 named the gap; this ADR closes
it.

Two things make this worth an ADR rather than a one-line comparison.

**First, "classification accuracy" names two different quantities**, and they disagree.
One is the *conditional, individual* probability that the classification just assigned
to *this* examinee is the true one, given *this* examinee's responses. The other is the
*population* rate — the expected proportion of examinees a test classifies correctly,
obtained by integrating over the population distribution of profiles and the whole
response-pattern space. The published attribute-level indices (Wang, Song, Chen, Meng &
Ding, 2015; Johnson & Sinharay, 2018; the `GDINA` package's `CA()`) principally define
the *population* quantity. A stopping rule cannot use it: stopping is decided inside one
session from one examinee's data, and the population rate is not a function of that data.
Conflating the two would put a population-scale number where a conditional one belongs,
and it would look entirely reasonable.

**Second, the schema does not enforce what the unit's own wording assumes.** D57's task
text says "turn a *diagnostic* posterior into a discrete mastery classification."
`schema.js` enforces something strictly weaker: `requiredClassificationAccuracy` is
required on any SMV whose type is *not* `continuous`. But `RAW_SCORE_SMV_TYPES` in
`evidenceAccumulation.js` is `["continuous", "binary", "ordinal"]` — a **binary** SMV may
legitimately carry a raw-score (CTT/sum/threshold) model, whose posterior reports
`method: "weighted-proportion"` and an `estimate` that is a weighted proportion of score
in [0, 1]. It is bounded exactly like a probability and is not one. Such a record is
authorable today through entirely valid means; it is not a drift scenario.

This is the same defect, on the other side of the module, that the Day 39 adversarial
review found as P1-6 and fixed by gating the `requiredSEM` comparison on
`posterior.method !== "eap"` rather than on `posterior.smvType`. Repeating the `smvType`
mistake here would reproduce a known bug in a new place.

## Decision

### 1. The rule is marginal MAP at a stated threshold

Given the marginal posterior `p = P(alpha_k = 1 | X)` and a mastery threshold `tau`:

```
p > tau   -> "master"
p < tau   -> "nonmaster"
p === tau -> "indeterminate"
```

`tau` defaults to **0.5**, which is the Bayes decision rule under symmetric 0-1 loss and
is the standard marginal-MAP reporting rule for DINA/G-DINA attribute profiles.

**The exact tie is a real state, not a pedantic one.** `masteryPrior()` returns `{p: 0.5}`
whenever an SMV declares no prior, so 0.5 is a value this pipeline produces on purpose, not
a floating-point coincidence. Collapsing the tie with `p > tau ? "master" : "nonmaster"`
would silently report "has not mastered" for an attribute the data is exactly balanced on.
Attributes that no response touched are already excluded upstream (`supported: false`), so
`indeterminate` is reserved for genuinely measured, genuinely balanced evidence.

### 2. Expected classification accuracy is the conditional probability of the assigned class

```
master      -> expectedClassificationAccuracy = p
nonmaster   -> expectedClassificationAccuracy = 1 - p
indeterminate -> null
```

This is `P(the assigned class is the true class | this examinee's responses)`. At
`tau = 0.5` it equals `max(p, 1 - p)` and is therefore never below 0.5.

**It is implemented as `master ? p : 1 - p`, not as `max(p, 1 - p)`.** The two agree at
`tau = 0.5` and diverge everywhere else: under an asymmetric threshold the rule can
deliberately assign the *less* probable class (at `tau = 0.8`, `p = 0.7` classifies as
nonmaster with accuracy 0.3), because an asymmetric threshold *is* an asymmetric loss
function. Writing `max(p, 1 - p)` would be correct today and quietly wrong the moment
threshold authoring lands, reporting 0.7 where 0.3 is true. The general form costs nothing
now and cannot rot.

`indeterminate` returns `null` rather than 0.5 because no class was assigned, so there is
no decision whose correctness probability could be stated. A null accuracy meets no target.

### 3. This is an individual quantity and is labelled as one

The emitted field is named `expectedClassificationAccuracy` and every record carries the
`threshold` it was computed at. It is **not** the test's classification accuracy rate and
must never be presented as one.

**Binding consequence for D79** (attribute-profile cohort summaries): averaging these
individual conditional accuracies across a cohort does **not** produce the population
classification accuracy index of Wang et al. (2015) or `GDINA::CA()`. It produces the mean
conditional confidence of the classifications actually made, which is a different estimand
and is biased upward relative to the population rate whenever selection has stopped
sessions early on confident cases. D79's own brief already warns that averaging
probabilities and counting classifications answer different questions; this is that warning
one level up, and it applies to the accuracy column too.

### 4. A classification target is evaluated only against a mastery posterior

`requiredClassificationAccuracy` is evaluated **only** when
`posterior.method === "attribute-mastery-posterior"`. Any other method leaves
`stoppingCriterionMet: null` with a note naming the method, exactly mirroring the
`requiredSEM` / `eap` guard directly above it.

- `eap` — the estimate is theta on the real line. Classifying it at 0.5 would call every
  positive ability "master" and report an "accuracy" of 1.7, which is not a probability.
- `weighted-proportion` — the estimate is an observed weighted proportion of score in
  [0, 1]. It looks exactly like a probability and is not one; this is the authorable-today
  case described in Context.

Gating on `method` rather than `smvType` is the D39 P1-6 correction applied to the
classification side before it can be found the hard way.

### 5. The threshold is a stated constant, not a new schema field

`DEFAULT_MASTERY_THRESHOLD = 0.5`, exported, recorded in every classification record, and
accepted as a parameter by every function that uses it.

Making it authorable per Assembly Model or per SMV is a schema change plus route plus
wizard surface — its own unit, and the cadence contract forbids pairing two schema units.
D56 refused to add `assemblyModelId` to sessions for exactly this reason and resolved the
binding another way instead; this follows that precedent. Because the threshold is already
a parameter and the accuracy math is already written in its general form, that future unit
plumbs a value through and adds no mathematics.

### Amendment (TU1, 2026-10-30): the cut is authorable

Decision 5 recorded the threshold as a constant because authoring it was a
separate schema unit. That unit is TU1. Decisions 1 to 4 and 6 to 7 are
unchanged. The comparison is still `p > tau`, `p < tau`, `p === tau`. The
accuracy is still the probability of the assigned class. Nothing is stored.

`tau` is resolved by `resolveDecision` in `server/delivery/attributeClassification.js`:

1. Student Model Variable `masteryThreshold`, when it is a finite number in (0, 1).
2. Assembly Model `masteryThreshold`, on the same interval.
3. The Evidence Model `decisionRule`, when that rule defines a mastery cut:
   `type` is `mastery`, `threshold` is a finite number in [0, 1], and
   `direction` is `above` or omitted (the authoring panel's default).
4. `DEFAULT_MASTERY_THRESHOLD`, which remains 0.5.

An invalid `masteryThreshold` (missing, 0, 1, outside (0, 1), or not a
finite number) is skipped, not applied. A decision rule of type
`classification`, `posterior_threshold`, or `score_band`, or a mastery
rule whose direction is `below` or `within`, does not define this cut.
The resolver falls through. `posterior_threshold` is a theta, so a value
that happens to lie in (0, 1) is still not used as a mastery probability.
A mastery rule may state 0 or 1 (the extreme-justification band). Those
are cuts. The new field may not.

When none of the three sources supplies a usable cut, classification is
the comparison at 0.5 this ADR originally specified. No stored posterior
is rewritten. There is no migration.

Assembly progress passes the Assembly Model it already chose, so a second
model for the same competency cannot change the cut. A report resolves
the Assembly Model from the session snapshot (`assemblyProgress`, then
`stopped`), then the cited delivery model, then a unique Assembly Model
for that competency. If several could apply and the session names none,
that source is skipped.

The floor advisory in decision 6 moves with `tau`. The original text
already required that.

### 6. A target at or below the accuracy floor is met, and says so

At `tau = 0.5` a decided classification always has `expectedClassificationAccuracy >= 0.5`,
so a `requiredClassificationAccuracy <= 0.5` is satisfied by every possible posterior. The
schema permits `(0, 1]`, so such a target is legal.

It is evaluated honestly — **met** — and carries an advisory saying it is at or below the
floor of the measure and cannot fail. Refusing it would invent a rule the schema does not
have; silently meeting it would let an Assembly Model stop every session on its first
scored response with no indication why.

### 7. Classification is derived, never stored

No new persisted field. The classification is a pure function of the persisted posterior
and a stated threshold, computed where it is needed.

Storing it would create a second source of truth that can drift from the posterior it came
from, and would break the reproducibility invariant D68 re-verifies (a posterior recomputed
from `session.responses` alone still reproduces exactly). D79 recomputes cohort figures from
stored posteriors through this same exported function, which is only sound because there is
one implementation and no stored copy to disagree with it.

## Consequences

**`assemblyProgress.js`'s classification branch stops returning `null`** for a mastery
posterior, which is the first clause of D57's exit check.

**Diagnostic sessions can now stop on their targets with no change to
`activitySelection.js`.** D56 made `targetsMet` filter on `stoppingCriterionMet !== true`
and documented the tri-state explicitly; a real boolean flows through that filter
unmodified. Two comment blocks in `activitySelection.js` that state classification targets
can never stop a session become false and are corrected, and the stopped-session record
gains the classification fields so a stop is legible rather than reporting
`requiredSEM: undefined`.

**Two existing tests keep their assertions and lose their reasons.** Both
`assemblyProgress.test.js`'s "visible but unevaluated" test and
`activitySelection.test.js`'s "can never satisfy targetsMet before D57" test build their
fixture on a `method: "eap"` posterior. Both still return `null` — now because of the
scale guard in decision 4, not because no rule exists. They are renamed and re-commented
to pin the guard they actually exercise, and new tests cover the behaviour D57 adds.

**What is and is not verified by benchmark.** The decision rule is a closed-form function
of the posterior with a textbook derivation, verified here by hand-computed fixtures and by
a simulation recovery check: a known attribute profile driven through the real accumulation
and classified at a stated tolerance. The *population* classification accuracy index
(`GDINA::CA()`, Wang et al. 2015) is explicitly **out of scope** and is not implemented,
claimed or approximated anywhere in this unit — it needs R and the full response-pattern
space, and belongs with D66's `sim10GDINA` reproduction or D79's cohort work. Cadence
contract rule 5 is satisfied for what this unit ships; the unshipped population index is
named here so nobody later mistakes the individual quantity for it.

## References

- Marginal MAP attribute reporting for DCMs: Rupp, Templin & Henson (2010),
  *Diagnostic Measurement*.
- Attribute-level classification accuracy and consistency indices (population-level):
  Wang, Song, Chen, Meng & Ding (2015), *Journal of Educational Measurement*;
  Johnson & Sinharay (2018), *JEM*; Templin & Bradshaw (2013), *Journal of Classification*.
- Bayesian decision-theoretic stopping in sequential/computerized classification testing:
  Lewis & Sheehan (1990); Vos (1999); Rudner (2002).
- Day 39 adversarial review, finding P1-6 (the `method`-not-`smvType` scale guard this
  ADR mirrors): `claude/day39-adversarial-review-accumulation-math.md`.
- TU1 amendment (authored cut precedence): `claude/day146aj-offcal-tu1-decision-rule.md`.
