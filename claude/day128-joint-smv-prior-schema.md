# D128 — Joint SMV prior schema (continuous / G14)

**Status: DONE.** Calendar unit **D128**, alone (Tier 2). Started from
`940b08d` (post-D127). Did **not** start D129 (never-compress).

## Exit check

> A competency model carries a validated joint prior; a malformed
> covariance (wrong dimension, not positive semi-definite) is refused with
> a clear message rather than accepted and producing nonsense later.

| Claim | Executed? |
|---|---|
| `competencyModels.jointPrior` in schema | **Yes** |
| `multivariate_normal` + covariance \| correlation | **Yes** |
| `smvIds` must be ≥2 continuous SMVs on the model | **Yes** |
| Wrong dimension refused | **Yes** |
| Non-PSD refused | **Yes** |
| Binary SMVs refused (DINA owns that joint) | **Yes** |
| Default independent diagonal from marginal sds | **Yes** — `defaultIndependentJointPrior` |
| No accumulation change | **Yes** — deferred to D129 |

## Premise on contact (held / applied)

- Per-SMV marginal priors remain; joint is optional and additive.
- DINA `attributeAccumulation` already has a discrete 2^K profile joint —
  continuous covariance is a separate field; binary ids are refused here.
- Schema only; using the joint at score time is D129.

## Delivered

| Piece | Where |
|---|---|
| Helpers + PSD (Cholesky) | `src/utils/jointPrior.js` |
| Schema field + validateEntity gate | `src/utils/schema.js` |
| Tests | `src/utils/__tests__/d128JointPrior.test.js` |

Shape:

```js
jointPrior: {
  family: "multivariate_normal",
  parameterization: "covariance" | "correlation",
  smvIds: string[],   // ≥2 continuous
  matrix: number[][], // n×n, symmetric, PSD
}
```

Absent `jointPrior` ⇒ today's independent-marginals behaviour.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2085 passed | 9 skipped (2094) — 195 files

npm run build
  green (~24s)
```

D127 close: **2073 passed / 9 skipped**. Delta: **+12 tests** / +1 file
(`d128JointPrior.test.js`).

## Next

**D129** alone — correlated continuous SMV accumulation (**never-compress**).
Do not start on a thin budget. Do not pair with D130 adversarial.
