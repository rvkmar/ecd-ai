# Off-calendar: G-DINA pilot from DINA-equivalent starting values

**Not D146.** Not a calendar unit. Closes re-audit gap R8. Does not start D154 or R9.

Handoff id: day146q.

**Status: DONE.** Exit check: an uncalibrated G-DINA item with usable `psychometrics.dinaParams` scores and is ranked. Submit pins a conjunctive `{ probabilities }` table of length 2^m. Missing slip/guess, a missing Q-vector, or a missing posterior is still refused / pool order. No 0.5 is invented.

## Premise

Checked on HEAD `bbf6eae` (R7). The premise held.

`chooseSubmitParameterBinding` and `resolveDinaParameters` treated `'gdina'` as having no pilot field. Accumulation refused a G-DINA group with no calibrated set. Selection without a calibrated table fell back to pool order even when the item already carried DINA slip/guess. Schema and Step 7 hid or rejected `dinaParams` on a G-DINA item.

## Choice

Derive DINA-equivalent starting values rather than author a saturated table. `conjunctiveGdinaTable(dinaParams, requiredCount)` builds `[g, …, g, 1−s]` of length 2^m in graded-lex order — the same identity accumulation already treats as DINA ≡ G-DINA. Submit snapshots the expanded table onto `response.pilotParams`, not the live slip/guess pair, so a later Q-vector edit cannot silently rewrite a past session.

No new `gdinaParams` field. The Item Wizard Step 7 DINA panel is shown for G-DINA with copy that names the conjunctive expansion. Confirm requires the same usable slip/guess pair DINA already required.

Calibrated G-DINA ranking (R7) is unchanged. DINA ranking is unchanged. An inverted or flat table is still not ranked. Missing required-attribute posteriors are still not filled with 0.5.

## What was not done

Slip/guess keyed by observableId (R9). Authoring a non-conjunctive saturated table by hand. Ranking from a stored joint instead of an independence product of marginals. PCM scoring (R5 leftover). Live `:6060` wizard walk.

## Rollback

Revert this change. Uncalibrated G-DINA submit and selection return to refusal / pool order. Schema again treats `dinaParams` on a G-DINA item as a wrong-family mistake.

## Verification

Exit check: submit pins `[0.2, 0.9]` for a one-attribute item with slip 0.1 / guess 0.2; accumulation scores that pinned table; selection ranks the uncalibrated item from the derived table (gain matches the DINA 0.397313 bits); missing slip/guess or Q-vector still refuses; missing posterior still pool order.

```
npx vitest run server/delivery/__tests__/attributeAccumulation.test.js
               server/delivery/__tests__/activitySelection.test.js
               server/delivery/__tests__/parameterSourceResolution.test.js
               server/delivery/__tests__/evidenceAccumulation.test.js
               server/routes/__tests__/sessionRoutes.test.js
               src/test/mirrorDrift.test.js
  337 passed

npx vitest run …related (those plus bayesianNetwork, day38Walkthrough,
               d129JointAccumulation, repoGuards)
  414 passed

NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2800 passed | 5 skipped (2805)

npm run build
  green (41.03s). Largest JS chunk EvidenceModelBuilder 372.26 kB (gzip 87.78 kB).
```

There is no lint script and no ESLint config. Live `:6060` was not rebuilt. The G-DINA Step 7 panel was not walked in the browser.

Git: last committed tip `bbf6eae`. R8 product and this handoff are uncommitted at close. Calendar D154 was not marked.

## Calendar

D146 was not marked. D154 stays next. D155 stays never-compress. W29 stays open.

## Next

Remaining re-audit rows are Low (R9–R14). R9 is slip/guess keyed by observableId. Do not start D154 from this close unless the calendar is the next request.
