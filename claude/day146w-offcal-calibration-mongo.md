# Off-calendar: calibrationJobs and analysisArtefacts leave db.json for Mongo

**Not D146.** Not a calendar unit. Does not start D154. Follows day146v (auditLog) and the staged Mongo plan PR 3.

Handoff id: day146w.

## Premise

After sessions (day146h, PR #118) and `auditLog` (day146v, PR #124) left the ECD file, `calibrationJobs` and `analysisArtefacts` were still rewritten on every `saveDB`. The calibration worker does about 4 to 5 full saves per job (running, then the final status). Live sizes measured 2026-10-29: `calibrationJobs` 6 records, 591 KB (110 to 160 KB each; embedded response 428 KB total, request 158 KB total). `analysisArtefacts` 2 records, 227 KB (about 113 KB each, almost all payload).

## Choice

`server/calibrationJobs/calibrationJobRepository.js` and `server/analysisArtefacts/analysisArtefactRepository.js` are the data access. Three backends each, selected the same way as sessions and auditLog:

| Backend | When |
|---|---|
| `mongo` | `NODE_ENV=production`, or storage mode mongo, or `CALIBRATION_JOBS_BACKEND=mongo` / `ANALYSIS_ARTEFACTS_BACKEND=mongo` |
| `json` | Vitest and `npm run dev` when neither of the above is set |
| `memory` | `CALIBRATION_JOBS_BACKEND=memory` and `ANALYSIS_ARTEFACTS_BACKEND=memory` (unit tests) |

The two env vars must agree. Production sets both to mongo. The JSON harness keeps both arrays in `db.json`.

Mongo collections are `calibrationJobs` (model `EcdCalibrationJob`) and `analysisArtefacts` (model `EcdAnalysisArtefact`), strict false, `minimize: false`, database `ecd_assessment`. Indexes follow the real reads: jobs use `id` (unique), `status` + `createdAt` (claim and queue order), `evidenceModelId`, `kind`, and `evidenceModelId` + `status`. Artefacts use `id` (unique), `jobId` (the link back to the job), `kind`, `scope.evidenceModelId`, and `scope.evidenceModelId` + `kind`.

Routes, the worker, scheduled enqueue, ingest, legacy `/api/calibrate/logs`, queue metrics on health and ops, and backup export go through the repositories. `saveDB` omits both keys when the store is external, and the audit diff ignores them so a hydrated array is not logged twice. External job writes record the same create, transition, and ingest audit rows the file diff used to record.

Worker claim is a compare-and-swap. Mongo uses `findOneAndUpdate` with `status: "queued"`. Later status writes are a single-document update that matches only while the job is still `running`, so a second worker or a requeue cannot double-claim or overwrite a recovered job. The JSON harness still mutates the array and calls `saveDB`, which is why the existing worker tests stay green.

Migration `013-calibration-data-to-mongo` runs on boot when the store is external, and from `npm run migrate`. It is a no-op on the JSON harness. On mongo or memory it copies both collections, verifies count and canonical form (ignoring `_id` and `__v`, including empty objects inside `response` and `payload`), then deletes both keys. A mismatch throws and leaves `db.json` unchanged. A copy is written to `backups/db.json.pre-calibration-mongo` and to `backups/db.json.<timestamp>` before the strip. Encrypted full backup exports `mongo/calibrationJobs.json` and `mongo/analysisArtefacts.json`. The JSON harness backup still has the arrays inside `ecd/db.json` as well.

This PR does not prune `response` or `payload`. `retainUntil` is already stamped at enqueue (six months). A later pass can delete stored jobs and artefacts past `retainUntil`. Leave that off until ops picks the window. Do not drop the embedded response in this cut.

## What was not preserved

- The JSON harness still stores both collections inside `db.json`. That is how `npm run dev` and Vitest keep working without Mongo.
- Other ECD collections stay in the file. This change does not touch them.
- CI does not start Mongo. The suite uses the memory backend for the new seam.

## Rollback

Stop `ecd-node`. Copy `backups/db.json.pre-calibration-mongo` over `/data/db.json`. Restore the `calibrationJobs` and `analysisArtefacts` collections from the `mongodump` taken before deploy, or drop them if the file copy is the source of truth. Set `CALIBRATION_JOBS_BACKEND=json` and `ANALYSIS_ARTEFACTS_BACKEND=json` if the restored file must be read again. Start the previous image.

Details are in `docs/ops/migration-policies.md`.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npm test
  2833 passed | 13 skipped (2846)

npm run build
  green (1.34s). Largest JS chunk EvidenceModelBuilder 374.75 kB (gzip 83.14 kB).

npm audit --audit-level=high
  found 0 vulnerabilities at high or above (1 moderate elsewhere, unrelated)
```

## Calendar

D146 was not marked. D154 stays next.
