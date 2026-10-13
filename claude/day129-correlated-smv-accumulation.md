# D129 — Correlated continuous SMV accumulation

**Status: DONE.** Calendar unit **D129**, alone (Tier 3, never-compress). Started from `de9b964`. Did **not** start D130.

## Exit check

> Hand-computed two-SMV fixture reproduced to a stated tolerance; zero-correlation case byte-identical to current behaviour; reproducibility invariant holds.

| Claim | Executed? |
|---|---|
| Hand 3×3 EAP, ρ = 0.5, one correct Rasch item | **Yes** — E[θA] = 0.24685685482774727, E[θB] = 0.08030850159239328, 12 decimal places |
| Negative covariance flips the partner | **Yes** — E[θB] = −0.08030850159239328 on the same grid |
| Zero correlation matches independent EAP | **Yes** — `estimate` and `precision` are `===` the no-joint path; one posterior, method `eap` |
| Joint path at ρ = 0 still matches a 1D sum on the same nodes | **Yes** — partner estimate 0 |
| Recompute from `session.responses` after the active parameter set changes | **Yes** — estimates unchanged |
| Both marginals persisted | **Yes** — `applyPosteriorsToSession` writes `theta-a` and `theta-b` |
| DINA path untouched | **Yes** |
| Two correlated partners refused | **Yes** — no dropped dimension |

## Premise on contact

Held. Continuous accumulation was still one SMV at a time. `jointPrior` was validated and unread. DINA’s profile joint stays in `attributeAccumulation.js`. Two Evidence Models that claim the same SMV are still refused (Day 39); this unit does not pool them.

## Delivered

| Piece | Where |
|---|---|
| 2×2 EAP + dispatch decision | `server/delivery/jointContinuousAccumulation.js` |
| Hook in the continuous branch | `server/delivery/evidenceAccumulation.js` |
| Tests | `server/delivery/__tests__/d129JointAccumulation.test.js` |

A measured SMV with exactly one non-zero covariance partner is updated with method `eap-joint`. The partner’s marginal moves with the covariance sign. A diagonal joint prior does not enter that path, so the existing adaptive 1D grid stays byte-identical. Correlation parameterization is converted with each SMV’s normal prior sd. There is no joint-prior field in the competency wizard; authoring stays on the record.

## Live host

`http://localhost:6060` accepted `admin1` / role `admin`. No screen authors `jointPrior`, so the exit check was not a browser submit.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2093 passed | 9 skipped (2102) — 196 files

npm run build
  green (~49s)
```

Calibration baseline the same day: **2085 passed / 9 skipped**. Delta: **+8 tests**.

## Next

**D130** alone — adversarial review of this joint update, then the W26 gate. Do not pair it with another unit.
