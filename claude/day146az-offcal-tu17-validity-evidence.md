# Off-calendar: TU17 validity evidence

**Not D146.** Not a calendar unit. Closes textbook gap T5. Depends on TU16. TU4 fit is linked when it is present. Scoring and activation are unchanged.

Handoff id: day146az. `day146ay` is TU16 (alternative explanations and warrant backing).

**Status: DONE.** Exit check: a draft evidence model still validates with no validity evidence. One analysis artefact produces one internal-structure row. A second link, a second ingest of the same job, and a second migration run do not add another row.

## Choice

New collection `validityEvidence`. Each row has:

- `type`: `response-process`, `internal-structure`, `relations`, or `consequences`
- `summary` and `body`
- `source` and `author`
- `createdAt` and `updatedAt`
- `evidenceModelId`
- optional `warrantIds` and `alternativeExplanationIndexes` into that model (TU16 warrants and alternative explanations)
- optional `analysisArtefactId`, `calibrationJobId`, and `parameterSetId`

`analysisArtefactId`, when set, is unique. The JSON adapter refuses a second insert. The Mongo adapter declares a partial unique index on that field, plus `{ evidenceModelId: 1, type: 1 }` and a unique `id`.

The collection is tenant-scoped. A district stamp hides the row from other districts. A row with no district is platform evidence and stays visible with the shared evidence model. Teachers may read. Admin and district may write. Students may not. Creates, updates, and deletes are audited (`validity_evidence.create`, `validity_evidence.update`, `validity_evidence.delete`) on the save path. External mongo writes record the same actions.

JSON harness: the array on the ECD file (`db.validityEvidence`). Mongo: collection `validityEvidence` when `VALIDITY_EVIDENCE_BACKEND=mongo`, or when `NODE_ENV=production` or the storage mode is mongo. `memory` is the in-process store. `dbAdapter` list, get, insert, update, and remove for this collection use that same store, so the tenancy inspector does not open a second collection.

## TU4 link

When a succeeded job response, an ingested parameter set, or an analysis artefact carries `cdmFit`, `qValidation`, `personFit`, or `localDependence` (or a person-fit / Q3 sidecar), one internal-structure row is written. `source` is `tu4-fit`. The summary states counts only. Person ids and the Q3 matrix stay on the job or the artefact.

The same analysis artefact, calibration job, or parameter set matches the existing row. A later link can fill a missing `analysisArtefactId`. It does not insert a second row.

Hooks: calibration job success, calibration ingest (JSON array immediately, and `commitCalibrationIngest` for the external store), recalibrate, and seed parameter sets that already contain a TU4 summary.

## Migration 016

Id: `016-validity-evidence`.

Effect:

- Adds `validityEvidence: []` when the ECD file has no array.
- Backfills one internal-structure row for each stored TU4 fit on `analysisArtefacts` and on evidence-model parameter sets. The artefact and the parameter set that share a job or an artefact id become one row.
- On a mongo validity-evidence backend, ensures the indexes above. The JSON harness does not create a mongo index. The mongo adapter also creates those indexes on first use.

Dry run writes nothing and does not copy a backup.

```bash
node server/migrations/run.js 016-validity-evidence --dry-run
node server/migrations/run.js 016-validity-evidence
```

A real run that changes the file copies `backups/db.json.pre-validity-evidence` and a `db.json.<timestamp>` crash copy first, then saves with audit skipped. A second run with nothing left to link does not write.

A missing array is also treated as empty on read (`fillDefaults`), so a process that never runs the migration still accepts new rows. Run 016 on existing data so stored TU4 fits are linked and the mongo index exists before the first request.

Rollback: stop node. Copy `backups/db.json.pre-validity-evidence` over the ECD db file. Drop the Mongo `validityEvidence` collection if this run created it. Evidence models and analysis artefacts are unchanged.

## What was not done

A signed-in browser walk. The panel was exercised with Testing Library (the linked fit row renders, a summary and source are typed, a warrant is checked, and the post body is the new row). The full vitest suite passed.

## Rollback

Revert this change. Rows already stored under `validityEvidence` are ignored by older code. Migration 016's backup restores the ECD file from before the backfill.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  3263 passed | 13 skipped (3276)
```

`npm run lint` has no script, and there is no ESLint config. The repo guard tests ran inside the suite.

Node on this machine is v22.23.4. `package.json` asks for `>=24`. The suite passed on 22.

## Calendar

D146 was not marked. Do not merge without an explicit OK.
