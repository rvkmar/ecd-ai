# Off-calendar: faster JSON db saves

**Not D146.** Not a calendar unit. Does not start D154.

Handoff id: day146g.

## Premise

A session submit on an 18.7 MB `db.json` spent about 95% of its time in whole-file JSON I/O. `saveDB` parsed the file a second time so it could diff an audit baseline, pretty-printed the whole file, and copied a full snapshot into `backups/` on every save. At 31 MB a submit was 647 ms. A 3,000-submit run wrote 7,252 snapshots of about 18.7 MB each.

## Choice

`loadDB` for an admin returns the same object `readRawDB` parsed. A district or student load used to return a shallow copy that still shared row objects. Callers then mutate that object and call `saveDB`. The cache cannot hold that reference, or the audit diff compares the new state to itself.

Unscoped saves only need `previous` for `applySaveAudits`. The cache holds `auditBaseline`: a structural copy of the fields the diff reads (status, parameter-set pointer, calibration job status, `humanRatedAt`, and the perspective fields behind `coherence.proceed`). A full clone of a session-heavy file costs about as much as the parse this cache exists to remove.

Scoped saves also pass `previous` to `mergeScopedDbSave`, which must still contain every hidden tenant row. The cache holds the parsed file. The caller receives a deep copy of the visible graph only. Hidden rows stay in the cache. Strings are shared. Objects and arrays are not, so an in-place edit cannot change the cached previous state. After the write, visible rows are copied again and hidden rows are reused.

A cache hit is `fs.statSync` `mtimeMs` and `size` still equal. Otherwise `saveDB` reads the file. Two writes in the same millisecond with the same byte length can false-hit. That is the stat check this path was given.

## Behaviour

The on-disk file is minified (`JSON.stringify(toWrite)`). `JSON.parse` already accepted both shapes. `exportDB` and the browser bulk download stay indented. They are downloads, not the db file. Nothing in tests, backup, or restore required the 2-space file.

Crash copies (`db.json.<timestamp>`) are written only when the newest one is at least `ECD_SNAPSHOT_INTERVAL_MS` old (default 300000). Retention keeps the newest `ECD_SNAPSHOT_KEEP` files (default 20). Other names in the folder are not deleted: encrypted `ecd-full-*.ecd.bak.enc` archives, their `.meta.json` sidecars, `db.json.old`, manual copies. `runFullBackup` does not call this throttle. Its own retention still deletes only scheduled encrypted names.

`POST /api/sessions/:id/human-rating` still rebuilds `ratingQueue` with `blindedRatingQueueFromSessions` over every visible session. That array is the response contract. A cheaper build would either drop other sessions' rows or still scan them. Left as it is. It was about 13 ms of handler time in the profile, next to the file I/O.

## Migration

None. Old pretty files parse. New files are minified. No stored shape changed.

## Rollback

Revert the commit. A minified `db.json` still loads on the previous code, because that code used `JSON.parse`.

Crash copies already deleted by retention are gone. Encrypted full backups are not touched by this retention. To get a copy on every save without reverting, set `ECD_SNAPSHOT_INTERVAL_MS=0`. `ECD_SNAPSHOT_KEEP` still caps how many `db.json.<timestamp>` files remain. Raise it if you need the old unbounded folder. The old code had no cap.

## Verification

`node scripts/bench-json-save.js` (not in CI). Node v22.23.4. Mean of 30 saves after 2 warmup. Starting file is pretty-printed, about 5.5 MB and about 19.4 MB. Scoped mode is a student `loadDB` + mutate + `saveDB`, which is the submit path.

| | saveDB before | saveDB after | submit before | submit after |
|---|---:|---:|---:|---:|
| 5.5 MB, scoped | 28.08 ms | 10.16 ms | 37.27 ms | 10.30 ms |
| 19.4 MB, scoped | 132.62 ms | 35.31 ms | 167.08 ms | 35.63 ms |

Unscoped (admin) at 19.4 MB: saveDB 126.24 ms to 47.23 ms, submit 162.37 ms to 77.60 ms. The scoped steady state skips the second parse and, after warmup, the next load as well, because the full snapshot is still valid.

These are this host's numbers, not a replay of the 288 ms profile. The profile machine was slower. The change is the same: one parse on the cold read, no second parse on save, minified write, snapshot usually skipped.

New tests: `server/utils/__tests__/jsonDbSaveCache.test.js`. Cache hit does not `readFileSync` during `saveDB`. An external rewrite is the audit baseline. In-place status, parameter set, job status, and `humanRatedAt` still diff. A district save keeps the other district's session. Throttle, retention, and non-matching names (including an `ecd-full-*.ecd.bak.enc` stand-in) are covered with an injected `now`.

Full suite: recorded after this note if the close run finished in the same revision.
