# Backup inventory (D107)

Scheduled encrypted backups are written by `server/backup/runFullBackup.js`
when `ECD_BACKUP_ENABLED=1`. Format: `ecd-full-<iso>.ecd.bak.enc` (AES-256-GCM).
Encryption key: `ECD_BACKUP_ENCRYPTION_KEY` from the host `.env` / secret
manager — referenced by compose as `${ECD_BACKUP_ENCRYPTION_KEY}`, never
inlined in `docker-compose.yml`.

Default schedule: `20 2 * * *` UTC (`ECD_BACKUP_CRON`). Retention: 14 days
(`ECD_BACKUP_RETENTION_DAYS`). Age is exposed on `/api/health` /
`/api/metrics` as `backup.ageMs` (prefers encrypted full backups) and
alarmed as `backup.age` (D105).

`saveDB` also writes unencrypted `db.json.<timestamp>` crash copies into
`ECD_BACKUP_DIR`. Those are not the scheduled backup. A copy is written
only when the newest crash copy is at least `ECD_SNAPSHOT_INTERVAL_MS`
old (default 300000, five minutes; 0 copies on every save). Retention
keeps the newest `ECD_SNAPSHOT_KEEP` files (default 20) and does not
delete encrypted archives, meta sidecars, or any other name in the folder.
`runFullBackup` does not use that throttle.

## Collection coverage

The authoritative list is `server/backup/inventory.js` (`BACKUP_INVENTORY`).
Summary:

| Included | How |
|---|---|
| ECD entities (items, models including presentationModels, sessions, tasks, students, policies, …) | `ecd/db.json` snapshot |
| `calibrationJobs`, `analysisArtefacts`, `auditLog` | Inside `ecd/db.json` (must not be skipped) |
| Task materials | Inline on `items.stimulus` today; optional `ECD_MATERIALS_DIR` → `materials/` |
| `users`, `questions` | `mongo/users.json`, `mongo/questions.json` via `dbAdapter` |

| Excluded | Why |
|---|---|
| R image / node_modules / frontend build | Rebuildable |
| Opportunistic `db.json.<timestamp>` crash copies | Not the scheduled encrypted set. Throttled (`ECD_SNAPSHOT_INTERVAL_MS`, default 5 minutes) and capped (`ECD_SNAPSHOT_KEEP`, default 20). |
| Raw `mongo_data` volume dump | Optional ops snapshot; app export covers roster for this unit |

## Restore

Timed restore rehearsal is **D108** (never-compress). Entry points:
`server/backup/runRestore.js`, `npm run backup:restore-rehearsal`. Record:
`docs/ops/restore-rehearsal-record.json`. Procedure write-up:
`docs/ops/restore-rehearsal.md`.
