# Migration rollback / forward-only policy (D109)

Every registered migration declares either a **rollback** procedure or an
explicit **forward-only** justification. Health/metrics already expose the
applied version (`GET /api/metrics` → `migrations`, D104).

| Id | Mode | Rollback / justification |
|---|---|---|
| `001-normalize-session-status` | Reversible | Restore ECD JSON from backup taken before apply, or rewrite `in_progress` → `in-progress` only if a consumer still required the hyphen (none do after `sessionStatus.js`). |
| `002-normalize-tools-allowed` | Reversible | Restore from backup, or join `toolsAllowed` arrays back to comma-strings. Readers use `toolsAllowedList()` and expect arrays. |
| `003-backfill-lifecycle-audit` | Reversible | Delete `auditLog` rows with `detail.reconstructed === true` (ids `aud-recon-*`). Source entity fields are unchanged by this migration. |
| `004-preview-remove-lifecycle-meta` | Forward-only (no-op) | Never mutates data; applied mark is bookkeeping. Clear the log entry to re-preview. |
| `005-remove-lifecycle-meta` | **Forward-only** | Fields are denormalized copies of `auditLog`. **Rollback = restore ECD JSON from a D107 encrypted backup taken before 005.** Do not invent blobs from audit rows. |

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
