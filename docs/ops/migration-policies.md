# Migration rollback / forward-only policy (D109)

Every registered migration declares either a **rollback** procedure or an
explicit **forward-only** justification. The applied version is on
admin-only `GET /api/metrics` (`migrations`, D104). `GET /api/health` stays
public and does not include the migration list.

| Id | Mode | Rollback / justification |
|---|---|---|
| `001-normalize-session-status` | Reversible | Restore ECD JSON from backup taken before apply, or rewrite `in_progress` → `in-progress` only if a consumer still required the hyphen (none do after `sessionStatus.js`). |
| `002-normalize-tools-allowed` | Reversible | Restore from backup, or join `toolsAllowed` arrays back to comma-strings. Readers use `toolsAllowedList()` and expect arrays. |
| `003-backfill-lifecycle-audit` | Reversible | Delete `auditLog` rows with `detail.reconstructed === true` (ids `aud-recon-*`). Source entity fields are unchanged by this migration. |
| `004-preview-remove-lifecycle-meta` | Forward-only (no-op) | Never mutates data; applied mark is bookkeeping. Clear the log entry to re-preview. |
| `005-remove-lifecycle-meta` | **Forward-only** | Fields are denormalized copies of `auditLog`. **Rollback = restore ECD JSON from a D107 encrypted backup taken before 005.** Do not invent blobs from audit rows. |
| `011-sessions-to-mongo` | Reversible | JSON harness: no-op, sessions stay in `db.json`. Mongo or memory: copy sessions into the store, verify each stored document matches the source (canonical compare, ignoring `_id` and `__v`), then delete the `sessions` array. A mismatch leaves the file unchanged. A pre-migration copy is `backups/db.json.pre-sessions-mongo` (and a `db.json.<timestamp>` crash copy). Rollback: stop node, copy that file over `ECD_DB_FILE`, restore or drop the Mongo `sessions` collection from the pre-deploy `mongodump`, start the previous build. Safe to re-run. A second run with an empty file leaves store documents in place. `npm run migrate` disconnects Mongo before it exits. |
| `012-auditlog-to-mongo` | Reversible | JSON harness: no-op, `auditLog` stays in `db.json`. Mongo or memory: copy rows into the store, verify count and canonical form (ignoring `_id`, `__v`, and the Mongo-only `atTime` twin), then delete the `auditLog` key. A mismatch leaves the file unchanged. A pre-migration copy is `backups/db.json.pre-auditlog-mongo` (and a `db.json.<timestamp>` crash copy). Rollback: stop node, copy that file over `ECD_DB_FILE`, restore or drop the Mongo `auditLog` collection from the pre-deploy `mongodump`, set `AUDITLOG_BACKEND=json` if the restored file must be read again, start the previous build. Safe to re-run. Optional `AUDITLOG_RETENTION_DAYS` TTL is off by default. |
| `013-calibration-data-to-mongo` | Reversible | JSON harness: no-op, `calibrationJobs` and `analysisArtefacts` stay in `db.json`. Mongo or memory: copy both collections, verify count and canonical form (ignoring `_id` and `__v`, including empty objects inside `response` and `payload`), then delete both keys. A mismatch throws and leaves the file unchanged. A pre-migration copy is `backups/db.json.pre-calibration-mongo` (and a `db.json.<timestamp>` crash copy). Rollback: stop node, copy that file over `ECD_DB_FILE`, restore or drop the Mongo `calibrationJobs` and `analysisArtefacts` collections from the pre-deploy `mongodump`, set `CALIBRATION_JOBS_BACKEND=json` and `ANALYSIS_ARTEFACTS_BACKEND=json` if the restored file must be read again, start the previous build. Safe to re-run. A second run with neither key in the file leaves store documents in place. The two backend env vars must agree (both external, or both the JSON harness). |

## Rehearsal procedure

```bash
# 1. Generate (committed generator — not a one-off dump)
npm run generate:production-shaped
# or: node server/scripts/generateProductionShapedDataset.js /tmp/ecd-prod-shaped.json

# 2. Dry-run full chain
ECD_DB_FILE=/path/to/db.json npm run migrate:dry-run

# 3. Apply
ECD_DB_FILE=/path/to/db.json npm run migrate
```

Automated rehearsal: `server/migrations/__tests__/d109ProductionShapedMigration.test.js`.

## Not in scope

Moving ECD collections onto Mongo (ADR 0007 cutover) is **not** this unit.
D109 rehearses the **schema migration chain** against a production-shaped
ECD JSON dataset reused by D110 load tests.
