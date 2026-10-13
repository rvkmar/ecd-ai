# D130 — Adversarial review of the joint update, and the W26 gate

**Status: DONE.** Calendar unit **D130**, alone (Tier 3, never-compress). Started from `955c3a7`. This session did not write D129.

## Exit check

> Ranked findings; every P0 fixed the same day with a regression test. A template validates its four bindings; a session updates two correlated SMVs and reproduces from responses alone.

| Claim | Executed? |
|---|---|
| Ranked findings | **Yes** — below |
| Each P0 fixed the same day with a regression test | **Yes** — `server/delivery/__tests__/d130JointGridCoverage.test.js` |
| Template validates four bindings, and refuses a Presentation Model on another Task Model | **Yes** — `templateBindingErrors` in that file; D126 route tests re-run |
| Session updates two correlated SMVs and reproduces from `session.responses` | **Yes** — D129 hand fixture still holds; D130 re-runs a 50-response session twice and the estimates match |

## What the review tried to break

The D130 prompt named covariance orientation, a partner moved the wrong way, correlation near ±1, a classified attribute mixed with a continuous SMV, double-counting across submits, and a zero-correlation guard that never enters the joint estimator.

| Probe | Result |
|---|---|
| Covariance sign | D129's negative-covariance hand cell still flips only the partner. Held. |
| Partner direction | A correct Rasch item with positive covariance still moves the partner up. Held. |
| ρ → ±1 | `det > 1e-15` returns null instead of a NaN. No separate near-singular benchmark. **P2.** |
| D57 classification × continuous joint | Joint dispatch runs only on the continuous IRT/Rasch branch. Binary attribute classification is untouched. Held. |
| Repeated submit | Accumulation still recomputes from the stored responses. Held, except the collision case below. |
| Zero correlation | Production still short-circuits to the one-dimensional EAP. The estimator itself is still run at ρ = 0 on the pinned 3×3 grid. That short-circuit is the regression guard, not a hole in it. Held. |

## Findings (ranked)

**P0 — a truncated joint grid was stored as a precise posterior**

`estimateBivariateJoint` on the production path used a fixed ±5 SD rectangle and `evidenceAccumulation.js` hardcoded `boundaryLimited: false`. Fifty correct Rasch items at b = 3, correlation 0.5, came back **4.788 ± 0.206**. The same bivariate model on a grid that covers the posterior is **5.220 ± 0.430**. The standard deviation was about half the real uncertainty, and the partner mean moved with it (2.391 against 2.610).

Fixed by `estimateJointContinuousPosterior`: widen an axis while mass or the mode sits on its edge, refine when the posterior is narrower than the step, refuse a flat likelihood, and copy `boundaryLimited` from that result. The pinned 3×3 hand fixture still calls `estimateBivariateJoint` directly.

**P0 — a collision left the partial joint posterior on the session**

One Evidence Model measuring θA writes both θA and θB. A later response through a second Evidence Model that measures θB trips the Day 39 collision refusal. `applyPosteriorsToSession` used to keep the earlier numbers, so the session still showed a partner estimate that ignored the new evidence.

A collision now sets `invalidatePersisted`. Apply deletes those SMV keys. Any other refusal still leaves an earlier measurement in place.

**P1 — deferred**

Two Evidence Models that each measure one variable of a correlated pair are still refused outright. Pooling them into one likelihood is a redesign of the per-Evidence-Model loop, not a silent winner. After this fix the session shows no posterior for those variables, which is the honest state.

`jointRole` (`measured` / `correlated`) is on the accumulation result and is not copied onto `session.studentModel.smvPosteriors`.

**P2 — deferred**

No dedicated probe of correlations within 1e-3 of ±1 beyond the determinant floor.

## W26 gate

Held. A template with competency, evidence, task, and presentation bindings is accepted when the Presentation Model's Task Model matches, and refused when it does not. A session with one correlated continuous partner updates both Student Model Variables from the stored responses, and a second accumulation of those same responses returns the same estimates. The block gate in the action plan is met.

## Standing risks escalated at this block close

These compression-debt rows were already open past more than two block closes. They are not discharged here. They are standing risks:

- **D68** — live mid-flight ingest and a second submit on `:6060`.
- **CM archive live walk** — archive exists in source and has not been demonstrated on `:6060`.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2098 passed | 9 skipped (2107) — 197 files (~120s)

npm run build
  green (~26s)
```

D129 baseline the same day was **2093 passed / 9 skipped**. Delta: **+5 tests**.

No joint-prior screen, so the exit check is the hand fixture, the covering-grid oracle, and the template binding function. `:6060` was not walked.

## Half-applied work

None. A diagonal joint prior still uses the one-dimensional EAP. A posterior that cannot be covered is marked `boundaryLimited` or refused. A collision removes the stale keys rather than writing a partial estimate.

## Next

Re-calibrate before **D131** (Design Patterns, W27). `designPatterns` is still absent from the schema.
