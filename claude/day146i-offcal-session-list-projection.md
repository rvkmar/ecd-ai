# Off-calendar: session list projection and health session store

**Not D146.** Not a calendar unit. Does not start D154.

Handoff id: day146i.

## Premise

After sessions moved to Mongo (day146h, PR #118), a live-size list of 600 sessions measured about 269 ms against Mongo and about 79 ms on the old JSON backend. `mongoFind` loaded every field of every matching document. List routes are `GET /api/sessions`, `/active`, `/archived`, `/mine`, and `/rating-queue`.

`GET /api/health` still reported `"mode":"ecd-json"` while `servingSessions` was true, including when the session store was Mongo.

## Choice

`server/sessions/sessionListProjection.js` is the list projection. List routes pass it to `querySessions`. Mongo applies it with `find().select()`. The file store and the memory store apply the same function, in the document's own key order, so a session that only has these fields stringifies to the same JSON as before.

Catalog routes (`/`, `/active`, `/archived`, `/mine`) send the session object. The projection keeps the fields that object carries, including the heavy ones:

`id`, `studentId`, `studentIds`, `assignmentGroupId`, `cohortId`, `taskIds`, `currentTaskIndex`, `responses`, `studentModel`, `selectionStrategy`, `nextTaskPolicy`, `deliveryModelId`, `assemblyProgress`, `carryForward`, `status`, `isCompleted`, `startedAt`, `finishedAt`, `autoFinished`, `reviewedAt`, `updatedAt`, `stopped`, `wizardPhaseTimings`, `wizardPhase`, `closure`, `endTime`, `districtId`, `schoolId`.

`responses` and `studentModel` stay. The staff list reads response counts and finish eligibility (`response.taskId`), the carried-forward line, and the evidence inspector reads `studentModel.smvPosteriors`. Tenancy still resolves a district from `studentId` and `studentIds` through `students` and `users`.

`GET /rating-queue` does not send the session. It sends `blindedQueueRow`. The projection is `id`, `studentId`, `studentIds`, and these response paths: `taskId`, `itemId`, `observationId`, `evaluationStatus`, `rawAnswer`, `pendingPhase.order`, `pendingPhase.kind`, `pendingPhase.rubricId`, `pendingPhase.adjudicationRule`, `automatedPhaseResult.activated`, `humanPhaseResult.activated`, `adjudicationApplied`. Array indexes stay put, so `responseIndex` still names the same response. `studentModel` is not loaded.

Filters keep the indexes they already had. `status` covers `/active` and `/archived`. The rating queue filters on `responses.evaluationStatus`, which the evidence-model compound index does not cover, so that field is indexed. `/` and `/mine` have no mongo filter. They return the caller's visible sessions. None of the five routes read a page, skip, or limit parameter, so the query is not sliced.

`mode` on `/api/health` stays `"ecd-json"`. The ECD file is still the content store, and nothing in the client, nginx config, or compose healthcheck branches on that string. The health body adds `database.sessionsBackend`: `"file"` when sessions are in the ECD file, `"mongo"` when the session backend is Mongo, `"memory"` for the in-memory store. The same value is on `database.ecd` in `/api/metrics`.

No migration. No new dependency.

## What was not preserved

- A catalog list still returns `responses` and `studentModel`. Those fields are the list payload, so the Mongo timing for `/` and `/active` does not drop just because a projection is present. On a local MongoDB, 600 generated sessions (catalog JSON about 3.8 MB) measured catalog list 34.45 ms with the projection and 34.18 ms without it.
- The rating queue's mongo filter already limits the rows. With 12 pending sessions out of 600, projected and unprojected queue times were 1.69 ms and 1.64 ms. The projection still omits `studentModel` and the unused response fields.
- In-memory timings are not a live Mongo measurement. On this bench they were catalog 22.56 ms, active 18.37 ms, rating queue 0.98 ms. The profiled install's 269 ms is not reproduced here.
- CI does not start Mongo. The suite uses the file store and the memory store. One Mongo round-trip for this projection runs only when `MONGO_URI` is set.

## Rollback

Revert this change. Session documents are untouched. There is no migration to undo and no collection to restore.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2703 passed | 12 skipped (2715)

npm run build
  green (1.36s). Largest JS chunk EvidenceModelBuilder 374.61 kB (gzip 83.06 kB).

npm audit --audit-level=high
  found 0 vulnerabilities
```

The two Mongo skips are the day146h round trip and this projection round trip. They run when `MONGO_URI` is set. The other 10 skips are the existing live-R cases.

`node scripts/bench-session-list.js` with a local `MONGO_URI`, 600 sessions, 5 repeats:

| | memory | local Mongo |
|---|---|---|
| catalog list | 22.56 ms | 34.45 ms |
| active list | 18.37 ms | 28.54 ms |
| rating queue | 0.98 ms | 1.69 ms |
| rating queue, no projection | 0.48 ms | 1.64 ms |
| catalog, no projection | 18.53 ms | 34.18 ms |

Catalog JSON was 3,842,944 bytes. Rating-queue JSON was 6,049 bytes.

## Calendar

D146 was not marked. D154 stays next.
