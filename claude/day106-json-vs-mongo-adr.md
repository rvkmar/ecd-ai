# D106 — JSON vs Mongo ADR + production harness boundary

**Status: DONE.** Calendar unit **D106** complete 2026-09-20.

## Premise on contact

Calendar: `dbAdapter` has two storage implementations; decide JSON vs Mongo
as an ADR (ends ambiguity); likely Mongo for deployment, JSON as harness
behind an enforced boundary. Exit: ADR with decision, consequences for
backup/restore/tenancy/audit, and the boundary that keeps the retained mode
out of production. Model: ADR before cutover code.

**Code at calibration:** Two stores, not one. Users/questions via
`dbAdapter` (`DB_MODE`, compose `mongo`). ECD entities (CM/EM/TM/items/
sessions/`auditLog`/jobs/…) via `loadDB`/`saveDB` (`ECD_DB_FILE`). ADR 0005
already steered compose+Mongo interim; final call was still open.

**Became:** ADR 0007 — Mongo is the sole production database of record
(including ECD collections as the *target*); JSON is harness only; today's
`ECD_DB_FILE` in compose is interim debt until cutover (not a reopen). Boot
refuses harness mode under `NODE_ENV=production`; compose pin asserted in
suite. No ECD collection cutover in this unit.

## Exit check

| Claim | Executed? |
|---|---|
| Written ADR with a decision (not a deferral) | **Yes** — `docs/adr/0007-json-vs-mongo-storage.md` |
| Consequences for backup / restore / tenancy / audit | **Yes** — ADR Consequences |
| Boundary keeps harness JSON out of production | **Yes** — `storageMode.js` + compose `DB_MODE=mongo` pin test |
| No ECD cutover code claimed | **Yes** |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1775 passed | 9 skipped (1784) — 155 files (~261s)

npm run build
  green (~16s)
```

(One prior full run had two 15s route timeouts; those files pass alone —
Windows flake, not this unit.)

## Delivered

- `docs/adr/0007-json-vs-mongo-storage.md`
- `server/config/storageMode.js` + tests
- `server/index.js` boot call
- Health `database.storagePolicy` (ADR 0007 fields)
- Compose pin assertion (`d94SecurityPosture` + storageMode test)
- `.env.example` production note
- Threat model T-NET-04 / W22 / §6 JSON question closed
- ADR 0005 pointer updated to “settled in ADR 0007”

## What remains

- **D107** — full backup (Mongo volume + interim ECD file / materials / jobs)
- **D108** — restore rehearsal, timed (never-compress)
- **D109** — production-shaped migration / ECD→Mongo cutover rehearsal (never-compress)
- **D110** — load test + DR runbook (never-compress)

## Next

Calendar **D107** — backup (depends on ADR 0007; do not pair with D106).
