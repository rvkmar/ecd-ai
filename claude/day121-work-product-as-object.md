# D121 — Work Product as an object (W25 G12)

**Status: DONE.** Calendar unit **D121**, alone (Tier 2). Started from
`e3da4f2` (W25 calibration). Did not start D122 (second schema) or D123
(never-compress).

## Exit check

> One work product type is captured by two different interactions and
> scores identically through the same Evidence Model.

| Claim | Executed? |
|---|---|
| `workProducts` collection + HTTP + permissions + queries | **Yes** |
| Type vocabulary = observable response modes (no second enum) | **Yes** — `WORK_PRODUCT_TYPES` alias |
| Item `interaction.workProductId` binds + compatibility check | **Yes** |
| EM procedure id resolves to collection when present | **Yes** (legacy free-string ids still allowed) |
| mcq + likert over same WP → identical Identification | **Yes** — `d121WorkProductIdenticalScoring.test.js` |
| Admin Models → Work Products library | **Yes** |

## Premise on contact (from calibration)

Collapse was true; `identifyEvidence`'s `workProduct` arg was a raw response
blob. EM already had free-string `workProductType`/`Id`. Unit elevated the
library without claiming zero WP language.

## Design

| Piece | Where |
|---|---|
| Vocabulary alias | `ecdVocabulary.js` `WORK_PRODUCT_TYPES` |
| Schema + consumers helper | `schema.js` `workProducts`, `itemsConsumingWorkProduct` |
| Routes | `server/routes/workProductsRoutes.js` |
| Queries / UI | `src/api/queries/workProducts.js`, `WorkProductBuilder.jsx` |
| Identification provenance | `workProductId` / `workProductType` on result |
| Exit check | `d121WorkProductIdenticalScoring.test.js` |

Library records: **no CAF status** (same posture as TMVs).

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2016 passed | 9 skipped (2025) — 184 files

npm run build
  green (~18s)
```

D119 close: **1996 passed / 9 skipped**. Delta: **+20 tests** / +4 files (approx).

Product tip: **`5ecb5bc`**.

## Next

**D122** alone (rubrics collection — never same session as D121).
**D123** never-compress — alone when started. Do not start W26 casually.
