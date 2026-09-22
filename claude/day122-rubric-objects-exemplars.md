# D122 — Rubric objects with exemplars (W25 G11)

**Status: DONE.** Calendar unit **D122**, alone (Tier 2). Started from
`ef051a1` (post-D121). Did not start D123 (never-compress).

## Exit check

> A rubric with exemplars is authored, confirmed, and referenced by more
> than one Evidence Model; the .backup file is either resurrected
> deliberately or deleted.

| Claim | Executed? |
|---|---|
| `rubrics` collection + HTTP + confirm + permissions + queries | **Yes** |
| Exemplars required at confirm | **Yes** |
| Same `rubricId` on ≥2 Evidence Models | **Yes** — schema + route consumers |
| Builder bakes library dimensions into package artifact | **Yes** |
| Two EMs score identically via shared rubric | **Yes** — `d122RubricSharedAcrossEMs.test.js` |
| `RubricManager.jsx.backup` disposition | **Deleted** (deliberately — observation-bound editor; reusable bind is `evaluationProcedures.rubricId`) |
| Admin Models → Rubrics | **Yes** |
| Inline EM rubric artifacts still valid | **Yes** (not removed) |

## Premise on contact

Inline `artifact.dimensions` already executable (EM-R1). No first-class
collection; `.backup` had zero importers. Unit promoted reusable rubrics
without claiming zero rubric structure.

## Design

| Piece | Where |
|---|---|
| Delivery projection | `rubricDelivery.js` |
| Schema + consumers | `rubrics`, `evidenceModelsConsumingRubric`, `evaluationProcedures.rubricId` |
| Routes | `rubricsRoutes.js` (+ `/confirm`) |
| UI | `RubricBuilder.jsx` |
| Staleness | `activePackage` / routes pass `db.rubrics` |

status: **draft \| confirmed** only (no CAF operational).

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2030 passed | 9 skipped (2039) — 187 files

npm run build
  green (~46s)
```

D121 close: **2016 passed / 9 skipped**. Delta: **+14 tests**.

Product tip: **`e0a463a`**.

## Next

**D123** never-compress (multi-phase evaluation) — alone when started.
Do not start W26 casually.
