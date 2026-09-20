# D108 — Restore rehearsal (performed and timed)

**Status: DONE.** Calendar unit **D108** complete 2026-09-20. **W22 block gate met** (restore performed and timed).

## Premise on contact

Calendar: restore from yesterday’s backup into a clean environment; time it;
verify four points (posterior recompute, parameter set → job, materials,
audit log); state RPO/RTO and confirm met. Never-compress.

**Code at calibration (`94710b6`):** D107 encrypted full backup exists; no
restore path or rehearsal record.

**Became:** `runRestore` + timed `performRestoreRehearsal`; CLI
`npm run backup:restore-rehearsal`; record + procedure docs. All four checks
passed; RPO 24h / RTO 60m stated and met (restore **3 ms**).

## Exit check

| Claim | Executed? |
|---|---|
| Timed restore performed (not only described) | **Yes** — `restoreElapsedMs: 3` |
| Posterior recomputes from restored responses | **Yes** — bit-identical EAP |
| Parameter set resolves to calibration job | **Yes** |
| Materials still render | **Yes** — stimulus + `materials/passage.txt` |
| Audit log intact | **Yes** |
| RPO/RTO stated and met | **Yes** — RPO 24h (backup age ~12h); RTO 60m (3 ms) |

## Verification

```
npm run backup:restore-rehearsal
  ok: true; restoreElapsedMs: 3; rpoMet/rtoMet: true; four checks pass

NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1787 passed | 9 skipped (1796) — 157 files (~289s)

npm run build
  green (~18s)
```

## Delivered

- `server/backup/runRestore.js`, `restoreRehearsal.js`
- `server/scripts/d108RestoreRehearsal.js` + `npm run backup:restore-rehearsal`
- `docs/ops/restore-rehearsal.md`, `docs/ops/restore-rehearsal-record.json`
- Tests: `server/backup/__tests__/d108RestoreRehearsal.test.js`

## What remains

- **D109** — production-shaped migration rehearsal (never-compress)
- **D110** — load test + DR runbook (cite this restore record)

## Next

Calendar **D109** — alone, never-compress.
