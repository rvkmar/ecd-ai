# Session close — D138 seed-snapshot divergence

**Closed 2026-10-14.** W28 comparison is done. Inheritance is still D139.

## Exit check

| Unit | Exit check | Status |
|---|---|---|
| D138 | A pattern lists its descendants; a descendant edited away from the seed snapshot is flagged, with what diverged named | **DONE** |

The flag is the route test. One confirmed pattern seeded both drafts. After the accepted observation's statement was changed, `GET /api/designPatterns/dp1/descendants` named `Names the claim` and the new wording. A designer-added observable was not a flag. The declined observation `Traces the arrow` was not reported as missing. Removing the accepted observable named it as removed. Dropping the accepted variable-feature id named `Complexity`. Rewriting the pattern's Focal KSAs and its current menus did not create a flag. Confirm of that Evidence Model still failed on `claimStatement`, not on divergence.

Live Admin (`admin1`) on `:6060` after `docker compose up -d --build nginx node`. **Explain a labelled diagram** shows **Seeded models**, the advisory that drift does not block confirm, and **No seeded models yet**. **Confirm** stays enabled. This mongo has no seeded models, so the edited-statement sentence was not on that screen.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  first run: 1 failed (unused exports evidenceModelDivergence / taskModelDivergence) | 2137 passed | 9 skipped
  after those exports were removed: 2138 passed | 9 skipped (2147)
  86.35s, exit 0

npm run build
  green (31.96s). Largest JS chunk recharts 488.42 kB.
  index-CPDpX3R0.js; DesignPatternBuilder-bnNIbN7R.js 22.46 kB.
```

Product commit `6fe6540`. Tip matches `main/master` before this close commit. Close commit follows.

## What was delivered

The calendar compared observable statements to Focal KSAs and called this the first edge of W33's graph. Focal KSAs are labels. D137 already stores the accepted and declined snapshot on `seededFrom`. The comparison is the model against that snapshot. The pattern's later menu edits are not the input. Characteristic features, rubrics, and work products were not copied into model fields, so they are not a field diff. The report is advisory. There is no graph and no inheritance.

## Half-applied work

None. Node and nginx were rebuilt together. No seeded models were written to this mongo.

## Compression debt

| Unit | What was compressed | Why | Discharge by |
|---|---|---|---|
| D135 live bulk upload | Settings Data click-through of the design-pattern card | This session walked the descendant list, not Settings | W28 close (D140) |

Standing risks, still open:

- D68 live mid-flight ingest on `:6060`
- Competency-model archive live walk on `:6060`

## Calendar

D138 marked ✅. The 2027-03-08 date was not moved.

## Next

D139, alone. Decide one inheritance rule and test it. A child references its parent. It does not rewrite models D137 already seeded. Refuse a cycle at write time.
