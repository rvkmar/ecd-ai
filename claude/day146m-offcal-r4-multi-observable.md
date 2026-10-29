# Off-calendar: one work product, several observables

**Not D146.** Not a calendar unit. Closes re-audit gap R4. Does not start D154.

Handoff id: day146m.

**Status: DONE.** Exit check: one item, one work product, two observables, both stored and both scored against distinct Q-matrix rows. Existing single-observable items unchanged.

## Premise

Checked on HEAD `1aadaf8` (metrics auth, plus R1–R3 closed). The premise held, with one refinement.

An item still has one `observationId`. The package baked one evaluation procedure per item. `identifyEvidence` returned one object. Submit stored one response. Schema already allowed several evaluation procedures to share `workProductId` (TR9: one work product, many observables). Identification never ran the siblings.

The audit's "let an evaluation procedure emit a list" is the wrong surface. The list is the set of procedures that already share the work product.

## Choice

Sibling observations are baked onto the composite library entry as `additionalObservations`. A sibling must:

- declare `workProductId` and share it with this item
- be expected by the Task Model
- not already belong to another instantiable item on that Task Model version

Two items that happen to cite the same work product keep one observable each. That is D121. One item that captures a work product with two procedures is R4.

`identifyEvidence` still returns today's primary object. When extras exist it also sets `identifications` to `[primary, ...extras]`. The primary uses the item's activation map. Siblings use an empty map and their own procedure artifact. They do not inherit the item's keyed-miss rule.

Submit stores one response row per identification. They share the attempt number. A later attempt replaces every row for that task. Exposure still increments once.

DINA scores each row against its Q-matrix observable cells. IRT extras without their own parameter row are excluded rather than counted twice; the same item on a later task still scores.

No migration. Existing packages without `additionalObservations` keep one-observable identification until rebuild. Empty extras vs a missing field is not stale.

## What was not done

R5. Observables are still 0/1. Rubric levels still collapse. Human rating still posts a boolean.

R9. DINA slip and guess stay keyed by item.

## Rollback

Revert this change. Rebuild packages so `additionalObservations` leaves the compiled entries.

## Verification

Exit check: one item, one work product, two observables, both stored and both scored against distinct Q-matrix rows. Existing single-observable items unchanged.

```
npx vitest run server/delivery/__tests__/r4MultiObservable.test.js
  7 passed

npx vitest run server/routes/__tests__/day38Walkthrough.test.js
  4 passed (same item on five tasks still narrows precision)

NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2776 passed | 3 skipped (2779)

npm run build
  green (32.47s). Largest JS chunk EvidenceModelBuilder 372.12 kB (gzip 87.70 kB).
```

There is no lint script and no ESLint config. Live `:6060` was not rebuilt.

Git: last committed tip `1aadaf8`. R4 product and this handoff were uncommitted at close. No force-push. Calendar D154 was not marked.

## Calendar

D146 was not marked. D154 stays next. D155 stays never-compress. W29 stays open.

## Next

Remaining Med: R5, R6, R7. R5 needs ordinal values and a polytomous family; it is quiet scoring and still runs alone. Do not start D154 from this close unless the calendar is the next request.
