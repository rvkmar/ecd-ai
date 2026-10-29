# Disaster recovery runbook (D110)

**Status:** Procedure derived from an executed restore (D108), not from
aspiration. Rehearsal record: `docs/ops/restore-rehearsal-record.json`.
Companion procedure notes: `docs/ops/restore-rehearsal.md`.

## Stated objectives

| | Value | Source |
|---|---|---|
| **RPO** | 24 hours | Daily encrypted full backup (`ECD_BACKUP_CRON` default `20 2 * * *` UTC) |
| **RTO** | 60 minutes | App-level restore of ECD JSON + mongo exports + materials into a clean tree |

D108 rehearsal: backup age ~12 h (RPO met); restore **3 ms** (RTO met).

---

## 1. Detection

1. Operator notices delivery/authoring outage, corrupt `ECD_DB_FILE`, or
   missing Mongo user store.
2. Check health without a shell if the UI is up: **System Health** screen
   (D105) or public `GET /api/health`. `GET /api/metrics` requires an admin
   access token (`Authorization: Bearer` of that user's access JWT).
3. Confirm backup age on metrics (`backup.ageMs`). If age > 24 h, RPO is
   already breached — restore the newest good archive and investigate the
   scheduler (`ECD_BACKUP_CRON`, compose key env).

**Expected:** `health.status === "ok"` does **not** mean data is good; it
means process + stores answer. Data loss symptoms: empty collections,
failed login for known users, missing sessions after a host failure.

---

## 2. Decision

| Situation | Action |
|---|---|
| Accidental wipe / corrupt ECD JSON; encrypted backup ≤ 24 h old | Restore from latest `ecd-full-*.ecd.bak.enc` |
| Only Mongo users lost | Restore `mongo/users.json` from archive; `mongoimport` (follow-on) |
| Backup older than RPO | Restore newest available; escalate data-loss window to stakeholders |
| R container down only | Do **not** restore — calibration degrades; sessions keep serving (ADR 0001 / D89) |

Do **not** restore over a live write path without stopping writers (scale
compose `node` to 0 or maintenance window).

---

## 3. Restore steps (executed path)

These are the steps D108 actually ran (`npm run backup:restore-rehearsal`
→ `performRestoreRehearsal` / `runRestore`):

1. **Obtain key** — `ECD_BACKUP_ENCRYPTION_KEY` (32-byte material; compose
   env, not in the image). Without it, `runRestore` refuses.
2. **Choose archive** — newest `ecd-full-*.ecd.bak.enc` under the backup
   volume / `ECD_BACKUP_DIR`.
3. **Prepare clean target** — empty directory (rehearsal used a temp tree;
   production: staged volume or new host path).
4. **Run restore**
   ```bash
   # Rehearsal (self-contained fixture + timed verify):
   npm run backup:restore-rehearsal

   # Or app-level restore into TARGET:
   # node -e "…" / ops wrapper calling runRestore({ key, archivePath, targetRoot })
   ```
5. **Point the app** — set `ECD_DB_FILE` (and materials dir) at restored
   `ecd/db.json`; import `mongo/users.json` if the user store was lost.
6. **Restart** node (and mongo if users were re-imported).

**Expected output (rehearsal):** `ok: true`, `restoreElapsedMs` ≪ 60 m,
four verification checks `ok: true`.

**If it differs:** archive decrypt fails → wrong key or truncated file;
missing `ecd/db.json` in archive → inventory gap (see
`docs/ops/backup-inventory.md`); verification fail → do not cut traffic
back; keep prior volume and escalate.

---

## 4. Verification (four checks — D108)

After restore, before declaring service restored:

| # | Check | Pass criterion |
|---|---|---|
| 1 | Posterior recomputes from restored responses | EAP matches pre-restore (bit-identical in rehearsal) |
| 2 | Parameter set → calibration job | `parameterSet.calibrationJobId` resolves; job lists ingested set |
| 3 | Materials render | Item stimulus + materials file content present |
| 4 | Audit log intact | Expected audit rows present |

Automated in rehearsal: `server/backup/restoreRehearsal.js`.

---

## 5. Communication

1. **Detect** — page on-call; note backup age and suspected blast radius.
2. **Decide** — announce maintenance window; stop writers if restoring in place.
3. **Restore** — execute §3; paste `restoreElapsedMs` and check results into the incident channel.
4. **Verify** — §4; spot-check login + one session report.
5. **Close** — confirm RPO/RTO vs stated objectives; file follow-ups (scheduler, key rotation) if any check was soft.

---

## Entry points

| Artefact | Path |
|---|---|
| Encrypt / full backup | `server/backup/runFullBackup.js` |
| Restore | `server/backup/runRestore.js` |
| Timed rehearsal | `npm run backup:restore-rehearsal` |
| This runbook’s evidence | `docs/ops/restore-rehearsal-record.json` |
| Collection inventory | `docs/ops/backup-inventory.md` |
