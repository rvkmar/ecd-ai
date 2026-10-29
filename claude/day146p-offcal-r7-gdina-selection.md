# Off-calendar: G-DINA activity selection

**Not D146.** Not a calendar unit. Closes re-audit gap R7. Does not start D154 or R8.

Handoff id: day146p.

**Status: DONE.** Exit check: a calibrated G-DINA item is ranked by expected posterior entropy over its reduced attribute pattern. DINA ranking is unchanged. A G-DINA session with no calibrated table still falls back to pool order.

## Premise

Checked on HEAD `af12705` (R6). The premise held.

`resolveDinaParameters` returned params only when `family === "dina"` and the row was slip/guess. A calibrated G-DINA `probabilities[]` table was treated as unusable, so `selectBayesianNetwork` delivered pool order (D60 P1-5). Accumulation already scored G-DINA from that table. R8 (no G-DINA pilot field) is a different row and stays open.

## Choice

Expected reduction in Shannon entropy of the reduced attribute pattern, not a DINA-style per-attribute approximation and not KL. The live belief is the independence product of the required attributes' stored marginals, the same independence-prior construction accumulation uses. Outcomes are weighted by P(u). A one-attribute table `[guess, 1-slip]` is the DINA gain already pinned at 0.397313 bits.

Every required attribute must have a live posterior. Missing ones are not filled with 0.5. An inverted table is not ranked. A flat table has gain 0.

No G-DINA pilot path. That remains R8.

## What was not done

G-DINA pilot parameters (R8). Ranking from a stored joint instead of an independence product of marginals. DINA still uses the per-attribute approximation. PCM scoring (R5 leftover).

## Rollback

Revert this change. G-DINA selection returns to pool order. DINA ranking returns.

## Verification

Exit check: calibrated G-DINA ranks; one-attribute gain matches DINA; no table and no posterior stay pool order.

```
npx vitest run server/delivery/__tests__/attributeAccumulation.test.js
               server/delivery/__tests__/activitySelection.test.js
               server/delivery/__tests__/bayesianNetwork.test.js
  154 passed

npx vitest run server/delivery/__tests__/attributeAccumulation.test.js
               server/delivery/__tests__/activitySelection.test.js
               server/delivery/__tests__/bayesianNetwork.test.js
               server/delivery/__tests__/evidenceAccumulation.test.js
               server/routes/__tests__/day38Walkthrough.test.js
               server/delivery/__tests__/d129JointAccumulation.test.js
  273 passed

NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2792 passed | 4 skipped (2796)

npm run build
  green (41.98s). Largest JS chunk EvidenceModelBuilder 372.26 kB (gzip 87.78 kB).
```

There is no lint script and no ESLint config. Live `:6060` was not rebuilt.

Git: last committed tip `af12705`. R7 product and this handoff were uncommitted at close. Calendar D154 was not marked.

## Calendar

D146 was not marked. D154 stays next. D155 stays never-compress. W29 stays open.

## Next

No Med gap remains in the re-audit table. Remaining rows are Low (R8–R14). R8 is G-DINA pilot parameters. Do not start D154 from this close unless the calendar is the next request.
