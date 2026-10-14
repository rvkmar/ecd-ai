# D134 — design pattern menus of possibilities

**Date:** 2026-10-14
**Tier:** 2, alone
**Status: DONE** in tests. Live `:6060` still serves the D133 bundle until nginx is rebuilt.

## Exit check

Each library menu references real objects rather than strings. A pattern with menus can be confirmed. Empty menus can still be confirmed. The UI states that the lists are possibilities, not commitments.

## What changed

The existing Design Patterns screen now authors Potential Observations, Work Products, Rubrics, Characteristic Features, and Variable Features.

- Work products store `workProductId` into `workProducts`. A type string alone is refused.
- Rubrics store `rubricId`. Variable features store `taskModelVariableId`.
- Observations are labelled possibilities and may copy an existing Evidence Model observable id. Characteristic features stay labels. No new collections.
- Confirm does not require menus. Confirm with filled menus succeeds when the ids exist.

Routes were not rebuilt. W28 seeding was not added. D135 import was not added.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2123 passed | 9 skipped (2132)
```

`npm run build` green (~38s). Largest JS chunk recharts 488.42 kB. Design Patterns chunk `DesignPatternBuilder-CWV2CX6T.js` 16.29 kB.

## Next

D135 — JSON import/export and the W27 gate. Rebuild nginx before walking the menus on `:6060`. Do not start W28.
