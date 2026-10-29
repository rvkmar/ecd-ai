# Off-calendar: studentModelRecords leave db.json for Mongo

**Not D146.** Not a calendar unit. Does not start D154. Follows day146w (calibrationJobs and analysisArtefacts) and the staged Mongo plan PR 4.

Handoff id: day146x.

## Premise

After sessions (day146h, PR #118), `auditLog` (day146v, PR #124), and `calibrationJobs` plus `analysisArtefacts` (day146w, PR #125) left the ECD file, `studentModelRecords` was still rewritten on every `saveDB`. Live size measured 2026-10-29: 300 records, about 523 KB of the live 4.0 MB `db.json`. One row per student and competency model. Occasion history grows on that row when a session finishes.

## Choice

`server/studentModelRecords/studentModelRecordRepository.js` is the data access. Three backends, selected the same way as sessions, auditLog, and calibration:

| Backend | When |
|---|---|
| `mongo` | `NODE_ENV=production`, or storage mode mongo, or `STUDENT_MODEL_RECORDS_BACKEND=mongo` |
| `json` | Vitest and `npm run dev` when neither of the above is set |
| `memory` | `STUDENT_MODEL_RECORDS_BACKEND=memory` (unit tests) |

The JSON harness keeps the array in `db.json`.

The Mongo collection is `studentModelRecords` (model `EcdStudentModelRecord`), strict false, `minimize: false`, database `ecd_assessment`. Indexes follow the real reads: `id` (unique), `studentId`, `competencyModelId`, `studentId` + `competencyModelId` (unique, one row per examinee and model), `identityAliases`, `history.sessionId`, `districtId`, and `districtId` + `schoolId`.

Reads and writes go through the repository:

- Session finish, delivery time-limit close, the auto-finish sweep, and task-model force-deactivate commit the occasion.
- Session create seeds carry-forward from the store.
- `GET /api/studentModelRecords` and session, learner, and teacher reports read the store.
- Evidence accumulation still writes `session.studentModel` on the session. The persistent row is updated when that session is committed.
- Encrypted full backup exports `mongo/studentModelRecords.json`. The JSON harness backup still has the array inside `ecd/db.json` as well.
- The design zip does not import or export `studentModelRecords`. That was already true. This change does not add it.

Record shape is unchanged. `saveDB` omits the key when the store is external, and the audit diff ignores it so a hydrated array is not treated as a file collection.

A finish is one document update. Mongo uses `findOneAndUpdate` to drop any earlier history entry for that session id, append the new snapshot, and set `smvPosteriors` from the history entry with the latest timestamp. Two finishes of different sessions cannot replace the whole document and drop the other snapshot. The memory backend applies the same merge with no await between the read and the write. The JSON harness still mutates the array and calls `saveDB`, which is why the existing finish and report tests stay green.

Migration `014-student-model-records-to-mongo` runs on boot when the store is external, and from `npm run migrate`. It is a no-op on the JSON harness. On mongo or memory it copies the collection, verifies count and canonical form (ignoring `_id` and `__v`, including empty objects), then deletes the key. A mismatch throws and leaves `db.json` unchanged. A copy is written to `backups/db.json.pre-student-model-mongo` and to `backups/db.json.<timestamp>` before the strip. A second run with the key already gone leaves the stored documents in place.

## What was not preserved

- The JSON harness still stores `studentModelRecords` inside `db.json`. That is how `npm run dev` and Vitest keep working without Mongo.
- Other ECD collections stay in the file. This change does not touch them.
- CI does not start Mongo. The suite uses the memory backend for the new seam.
- Class, district, and dashboard aggregates still do not read this collection.

## Rollback

Stop `ecd-node`. Copy `backups/db.json.pre-student-model-mongo` over `/data/db.json`. Restore the `studentModelRecords` collection from the `mongodump` taken before deploy, or drop it if the file copy is the source of truth. Set `STUDENT_MODEL_RECORDS_BACKEND=json` if the restored file must be read again. Start the previous image.

Details are in `docs/ops/migration-policies.md`.

## Verification

Node 24.22.2.

```
NODE_OPTIONS=--max-old-space-size=3072 npm test
  2843 passed | 13 skipped (2856)

npm run build
  green (1.27s). Largest JS chunk EvidenceModelBuilder 374.75 kB (gzip 83.14 kB).

npm audit --audit-level=high
  found 0 vulnerabilities at high or above (1 moderate elsewhere, unrelated)
```

## Calendar

D146 was not marked. D154 stays next.
