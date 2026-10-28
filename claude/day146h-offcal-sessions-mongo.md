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

Submit (`POST /api/sessions/:id/submit`) and human rating (`POST /api/sessions/:id/human-rating`) load one session and `replaceOne` that document. Other session mutations bind the visible set, then `commitSessions` writes only the documents whose JSON changed (play, pause, resume, finish, review, archive, delete, rescore, next-task stop, auto-finish, task-model force close, task delete, question delete). A request that does not bind sessions does not put session documents through `JSON.parse` or `JSON.stringify` of `db.json`. `saveDB` deletes the `sessions` key before it writes when the store is external.

Human-rating audit rows are the same `human_rating.complete` entries `collectSaveAudits` already builds (`auditsForSessionChange`). They are appended to `auditLog` and saved with the ECD file. The whole-file diff does not also see the session, so the row is not written twice.

Migration `011-sessions-to-mongo` runs on boot when the store is external, and from `npm run migrate`. It is a no-op on the JSON harness, so the existing migration suite still sees sessions in the file. On mongo or memory it copies the file array, checks every id is in the store, and only then deletes the key. A second run with an empty file leaves store documents alone. If the store is missing an id, the file is not changed. A copy is written to `backups/db.json.pre-sessions-mongo` and to `backups/db.json.<timestamp>` before the strip. That copy is not passed through the crash-copy throttle.

## What was not preserved

- The JSON harness still stores sessions inside `db.json`. That is how `npm run dev` and Vitest keep working without Mongo. The byte win is the production store.
- Zip export and import still omit sessions. They were design collections only. Backups include `mongo/sessions.json`.
- `auditLog` is still in `db.json`.
- CI does not start Mongo. The suite uses the memory backend. A Mongo round-trip test runs only when `MONGO_URI` is set, and it is skipped here. No new dependency was added.
- The benchmark after-leg is the memory store, not a live `mongod`. It measures the file path going away. A Mongo `replaceOne` adds one network round trip on top of that small file write.

## Rollback

Stop `ecd-node`. Copy `backups/db.json.pre-sessions-mongo` over `/data/db.json`. Restore the `sessions` collection from the `mongodump` taken before deploy, or drop it if the file copy is the source of truth. Start the previous image. The file copy still parses on the previous build.

Details and the Docker command order are in the pull request.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2690 passed | 11 skipped (2701)

npm run build
  green (1.24s). Largest JS chunk EvidenceModelBuilder 374.61 kB (gzip 83.06 kB).

npm audit --audit-level=high
  found 0 vulnerabilities
```

The extra skip is the Mongo integration test. It runs when `MONGO_URI` is set. The other 10 skips are the existing live-R cases.

Benchmark, this host, Node from `node -v` at run time, 600 sessions, pretty file about 12.6 MB, scoped student load + mutate + save, mean of 8 after 1 warmup:

| | mean save | mean submit | file after |
|---|---:|---:|---:|
| before (sessions in db.json) | 52.32 ms | 52.91 ms | 12.0 MB minified |
| after (memory store, file without sessions) | 0.27 ms | 0.35 ms | 3.5 KB |

`node scripts/bench-json-save.js --sessions 600 --bytes 12000000 --saves 8 --warmup 1 --compare --mode scoped`

These are this host's numbers. The profiled 167 ms was a slower machine and an 18.7 MB file before PR #117. The comparison that matters here is the same host, 600 sessions, with and without session bytes in the file.

## Calendar

D146 was not marked. D154 stays next.
