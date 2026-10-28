# Off-calendar: sessions leave db.json for Mongo

**Not D146.** Not a calendar unit. Does not start D154.

Handoff id: day146h.

## Premise

After the JSON save fast path (day146g, PR #117), a submit still parses and stringifies the whole ECD file. On the profiled install that file was 18.7 MB and the submit was 167 ms, with the parse and stringify about 75% of that time. `sessions` was about 63% of the bytes. `auditLog` was about 15%. The live install has 600 sessions, 600 students, and 4,690 audit entries.

`auditLog` stays in `db.json` in this change. Moving it is a follow-up.

## Choice

`server/sessions/sessionRepository.js` is the session data access. Three backends, selected by `SESSIONS_BACKEND`, otherwise by environment:

| Backend | When |
|---|---|
| `mongo` | `NODE_ENV=production`, or storage mode mongo, or `SESSIONS_BACKEND=mongo` |
| `json` | Vitest (`DB_MODE=json`) and `npm run dev` when neither of the above is set |
| `memory` | `SESSIONS_BACKEND=memory` (unit tests, and the benchmark's after leg) |

The Mongo collection is `sessions` (model `EcdSession`, strict false). It reuses `MONGO_URI` and database `ecd_assessment`, the same connection settings as `server/utils/dbAdapter.js`. Indexes: `id` (unique), `studentId`, `studentIds`, `status`, `deliveryModelId`, `taskIds`, `isCompleted`, `districtId`, and `responses.evidenceModelId` + `status`. District scope is not a stored field. It is still resolved from the assignee through `students` and `users` (`rowVisible` in `server/utils/tenancyScope.js`).

Submit and human rating load one session (`findOne`) and `replaceOne` that document. Create uses `insertOne`. List, active, archived, mine, and the rating queue use a Mongo filter (status, assignee, or pending rating) plus the existing tenancy check. They do not clone the collection. Play, pause, resume, finish, review, archive, delete, and next-task stop read and write that one id. Rescore, auto-finish, task delete, question delete, and task-model force close query the sessions that can match, then replace or delete those documents. Evidence-model writes load only sessions whose responses cite that model. A request that does not query sessions does not put session documents through `JSON.parse` or `JSON.stringify` of `db.json`. `saveDB` deletes the `sessions` key before it writes when the store is external.

The session schema sets `minimize: false`, and `toObject` / `toJSON` do too, so an empty `studentModel.smvPosteriors` object is stored. `lean()` returns that object.

Human-rating audit rows are the same `human_rating.complete` entries `collectSaveAudits` already builds (`auditsForSessionChange`). They are appended to `auditLog` and saved with the ECD file. The whole-file diff does not also see the session, so the row is not written twice.

Migration `011-sessions-to-mongo` runs on boot when the store is external, and from `npm run migrate`. It is a no-op on the JSON harness, so the existing migration suite still sees sessions in the file. On mongo or memory it copies the file array, then compares a canonical form of each source session to the stored document (ignoring `_id` and `__v`). Only a full match deletes the key. A dropped empty object fails the migration and leaves `db.json` unchanged. A second run with an empty file leaves store documents alone. A copy is written to `backups/db.json.pre-sessions-mongo` and to `backups/db.json.<timestamp>` before the strip. That copy is not passed through the crash-copy throttle. `npm run migrate` calls `mongoose.disconnect` in a `finally` and then exits, including dry-run and skip.

## What was not preserved

- The JSON harness still stores sessions inside `db.json`. That is how `npm run dev` and Vitest keep working without Mongo. The byte win is the production store.
- Zip export and import still omit sessions. They were design collections only. Backups include `mongo/sessions.json`.
- `auditLog` is still in `db.json`.
- CI does not start Mongo. The suite uses the memory backend. A Mongo round-trip test runs only when `MONGO_URI` is set, and it is skipped here. No new dependency was added.
- The in-memory benchmark (0.35 ms) is not a live Mongo timing. On a copy of the live 18.7 MB file with 600 sessions, real Mongo measured submit 265 ms before this follow-up and 91 ms after the single-document write. Create and list had regressed (238 to 502 ms, and 133 to 260 ms) because every session route cloned the whole collection. That clone is gone.

## Rollback

Stop `ecd-node`. Copy `backups/db.json.pre-sessions-mongo` over `/data/db.json`. Restore the `sessions` collection from the `mongodump` taken before deploy, or drop it if the file copy is the source of truth. Start the previous image. The file copy still parses on the previous build.

Details and the Docker command order are in the pull request.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2693 passed | 11 skipped (2704)

npm run build
  green (1.38s). Largest JS chunk EvidenceModelBuilder 374.61 kB (gzip 83.06 kB).

npm audit --audit-level=high
  found 0 vulnerabilities
```

The extra skip is the Mongo integration test. It runs when `MONGO_URI` is set. The other 10 skips are the existing live-R cases.

Live Mongo, copy of the 18.7 MB file, 600 sessions: submit 265 ms to 91 ms after the single-document write. Create had gone 238 ms to 502 ms and list 133 ms to 260 ms while every route cloned the collection. Those routes now query or replace by id.

The memory benchmark in `scripts/bench-json-save.js --compare` only shows that the file no longer holds session bytes. It is not the live Mongo number.

## Calendar

D146 was not marked. D154 stays next.
