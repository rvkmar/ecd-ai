# Restore rehearsal (D108)

**Performed:** 2026-09-20 (see `docs/ops/restore-rehearsal-record.json`)

## Stated objectives

| | Stated | Met? |
|---|---|---|
| **RPO** | 24 hours — daily encrypted full backup (`ECD_BACKUP_CRON` default `20 2 * * *` UTC) | **Yes** — rehearsal backup age ~12h |
| **RTO** | 60 minutes — decrypt + write ECD JSON, mongo exports, and materials into a clean tree | **Yes** — restore elapsed **3 ms** in this rehearsal |

Live Mongo `mongoimport` / adapter write of `mongo/users.json` is a follow-on ops step after the app-level restore; it is not on the RTO critical path for this unit’s clean-tree procedure.

## Procedure (what was executed)

1. Build a provenance-complete fixture (session responses, calibrated parameter set → calibration job, item stimulus + materials file, audit log, users export).
2. `runFullBackup` → `ecd-full-*.ecd.bak.enc`.
3. Restore into an empty target tree via `runRestore`.
4. Verify the four calendar checks (below).
5. Record timings and outcomes.

Re-run: `npm run backup:restore-rehearsal`

## Four verification points

| Check | Result |
|---|---|
| Session posterior recomputes from restored responses and matches pre-restore | **Pass** (bit-identical EAP) |
| Parameter set still resolves to the calibration job that produced it | **Pass** |
| Uploaded materials still render (stimulus + materials file) | **Pass** |
| Audit log intact | **Pass** |

## Entry points

- `server/backup/runRestore.js` — decrypt and write
- `server/backup/restoreRehearsal.js` — timed rehearsal + verification
- `server/scripts/d108RestoreRehearsal.js` — CLI

D110’s DR runbook restore section should cite this record, not invent a parallel procedure.
