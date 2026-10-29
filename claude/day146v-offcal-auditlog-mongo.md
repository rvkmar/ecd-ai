# Off-calendar: auditLog leaves db.json for Mongo

**Not D146.** Not a calendar unit. Does not start D154. Follows day146h (sessions) and the staged Mongo plan PR 2.

Handoff id: day146v.

## Premise

After sessions left the ECD file (day146h, PR #118), `auditLog` was still rewritten on every `saveDB` and on every `recordAuditEvent`. Live measured sizes on 2026-10-29: `db.json` 4.0 MB; `auditLog` alone 2.05 MB (51%, 4,690 rows, ~440 B each, mostly `detail`). Rating alone adds about 900 `human_rating.complete` rows per day.

## Choice

`server/auditLog/auditRepository.js` is the audit data access. Three backends, selected by `AUDITLOG_BACKEND`, otherwise by environment (same resolution as sessions):

| Backend | When |
|---|---|
| `mongo` | `NODE_ENV=production`, or storage mode mongo, or `AUDITLOG_BACKEND=mongo` |
| `json` | Vitest and `npm run dev` when neither of the above is set |
| `memory` | `AUDITLOG_BACKEND=memory` (unit tests) |

The Mongo collection is `auditLog` (model `EcdAuditLog`, strict false, `minimize: false`). It reuses `MONGO_URI` and database `ecd_assessment`. Indexes: `id` (unique), `at`, `action`, `actor.userId`, `entity.collection` + `entity.id`, and `action` + `at`. A Date twin `atTime` supports optional TTL.

`saveDB` still diffs lifecycle / calibration / rating changes through `applySaveAudits`. When the store is external it upserts those rows (and any `rememberAudit` / `recordAuditEvent` rows) into the store and omits the `auditLog` key from the file. `recordAuditEvent` no longer rewrites `db.json` when the store is external. Admin audit list, ops alerts, and health-summary read through the repository.

Migration `012-auditlog-to-mongo` runs on boot when the store is external, and from `npm run migrate`. It is a no-op on the JSON harness. On mongo or memory it copies the file array, verifies count and canonical form (ignoring `_id`, `__v`, `atTime`), then deletes the key. A mismatch leaves `db.json` unchanged. A copy is written to `backups/db.json.pre-auditlog-mongo` and to `backups/db.json.<timestamp>` before the strip. Encrypted full backup exports `mongo/auditLog.json`.

Optional retention: `AUDITLOG_RETENTION_DAYS`. Unset or `0` = off (default). Do not enable on deploy. With ~900 rating rows/day plus lifecycle noise, a 90 or 180 day window is a reasonable first ops choice once volume and query needs are confirmed. Turning it on creates a TTL index on `atTime`; it does not delete live data while left at the default.

## What was not preserved

- The JSON harness still stores `auditLog` inside `db.json`. That is how `npm run dev` and Vitest keep working without Mongo.
- Other ECD collections stay in the file. This change does not touch them.
- CI does not start Mongo. The suite uses the memory backend for the new seam.

## Rollback

Stop `ecd-node`. Copy `backups/db.json.pre-auditlog-mongo` over `/data/db.json`. Restore the `auditLog` collection from the `mongodump` taken before deploy, or drop it if the file copy is the source of truth. Set `AUDITLOG_BACKEND=json` if the restored file must be read again. Start the previous image.

Details are in `docs/ops/migration-policies.md`.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npm test
  2823 passed | 13 skipped (2836)

npm run build
  green (1.40s). Largest JS chunk EvidenceModelBuilder 374.75 kB (gzip 83.14 kB).

npm audit --audit-level=high
  found 0 vulnerabilities at high or above (1 moderate elsewhere, unrelated)
```

## Calendar

D146 was not marked. D154 stays next.
