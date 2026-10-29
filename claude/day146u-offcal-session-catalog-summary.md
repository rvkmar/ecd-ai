# Off-calendar: session catalog list summaries

**Not D146.** Not a calendar unit. Does not start D154. Follows day146i.

Handoff id: day146u.

## Premise

After day146i, catalog list routes still projected full `responses` and `studentModel`. With about 600 sessions (~14.6 KB each), `GET /api/sessions`, `/active`, `/archived`, and `/mine` stayed heavy. `RATING_QUEUE_PROJECTION` was already light and must not change.

## Choice

`CATALOG_SUMMARY_PROJECTION` loads the light catalog fields plus `responses.taskId` only. `catalogListSummary` turns that into `responseCount` and `answeredTaskIds`, then drops `responses`. The four catalog list routes use that path. Detail and player routes stay full (`GET /:id`, play, submit).

Frontend list consumers no longer read `responses` or `studentModel` from the catalog payload:

- Staff and student lists use `sessionResponseCount` / `answeredTaskIds` (via `canFinishSession`).
- The carried-forward line left the staff list; carry-forward still lives on the full session.
- Evidence Accumulation Inspect loads SMV posteriors from `GET /api/sessions/:id` when Inspect is clicked.

No migration. Session documents are unchanged. `RATING_QUEUE_PROJECTION` is unchanged.

## What was not preserved

- Catalog list JSON is no longer byte-identical to a full session document.
- The staff list no longer shows the carried-forward competency ids inline.
- The evidence inspector list no longer shows SMV posteriors until Inspect loads the detail.

## Rollback

Revert this change. Session documents are untouched. There is no migration to undo.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2813 passed | 13 skipped (2826)

npm run build
  green (1.40s). Largest JS chunk EvidenceModelBuilder 374.75 kB (gzip 83.14 kB).
```

## Calendar

D146 was not marked. D154 stays next.
