# D107 — Scheduled encrypted full backup

**Status: DONE.** Calendar unit **D107** complete 2026-09-20.

## Premise on contact

Calendar: backup covering database, uploaded materials, calibration jobs, and
analysis artefacts; daily full with retention; encrypted at rest with keys
outside compose; age on health (D104) and alarmed (D105). Do not skip jobs /
artefacts. Exit: backup runs on schedule, is encrypted, age visible on health;
every collection backed up or explicitly excluded with a reason.

**Code at calibration (`1a1288f` / ADR 0007):** Only opportunistic unencrypted
`db.json.*` copies from `saveDB`. Jobs + artefacts live inside ECD JSON.
Materials are inline on `items.stimulus` (no separate upload volume). Users /
questions on Mongo via `dbAdapter`. Health already probed `ECD_BACKUP_DIR` age.

**Became:** Scheduled AES-256-GCM full archive (`ecd-full-*.ecd.bak.enc`) with
inventory contract, Mongo user/question export, optional materials dir,
retention prune, compose enable + key-from-env (not inlined), health prefers
encrypted age for alerts.

## Exit check

| Claim | Executed? |
|---|---|
| Backup runs on schedule | **Yes** — `backupCron` when `ECD_BACKUP_ENABLED=1` (compose default `20 2 * * *` UTC) |
| Encrypted; key outside compose YAML | **Yes** — AES-256-GCM; `${ECD_BACKUP_ENCRYPTION_KEY}` from host `.env` |
| Age visible on health | **Yes** — `backup.ageMs` prefers encrypted full; `backup.encryptedFull` |
| Every collection accounted for | **Yes** — `BACKUP_INVENTORY` + `docs/ops/backup-inventory.md` |
| Jobs + artefacts included | **Yes** — inside `ecd/db.json` in the archive |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1784 passed | 9 skipped (1793) — 156 files (~279s)

npm run build
  green (~19s)
```

## Delivered

- `server/backup/inventory.js`, `cryptoArchive.js`, `runFullBackup.js`
- `server/cron/backupCron.js` + boot wire in `server/index.js`
- Health `backup.encryptedFull`; compose + `.env.example`
- `docs/ops/backup-inventory.md`
- Tests: `server/backup/__tests__/d107Backup.test.js`

## What remains

- **D108** — restore rehearsal, timed (never-compress)
- **D109** — migration / ECD→Mongo cutover rehearsal (never-compress)
- **D110** — load test + DR runbook (never-compress)

## Next

Calendar **D108** — alone, never-compress.
