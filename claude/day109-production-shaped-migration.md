# D109 — Production-shaped migration rehearsal (never-compress)

**Status: DONE.** Calendar unit **D109** complete 2026-09-20.

## Premise on contact

Calendar: build a production-**shaped** dataset (realistic item bank, session
volume, tenant spread) as a **committed regenerable generator**; rehearse the
full migration chain including D102’s pending lifecycle-meta removal; dry-run
first; every migration gets a rollback plan or forward-only justification.
Dataset reused by D110 load tests. Not an ECD→Mongo cutover (ADR 0007).

**Code at calibration (`c91a740`):** Migrations 001–004; 004 preview-only;
writers still stamp `reviewMeta` / `operationalMeta` / `deactivation`; no
production-shaped fixture.

**Became:** generator + **005** real strip + writer stoppage + rollback
policy doc + rehearsed dry-run/apply on 1000 items / 480 sessions / 8
districts.

## Exit check

| Claim | Executed? |
|---|---|
| Full chain runs clean on production-shaped dataset | **Yes** — dry-run then apply on generated db (61 hyphen sessions, 2 string toolsAllowed, 12 meta groups → 13 reconstructed audit rows; meta stripped) |
| Every migration has rollback or forward-only justification | **Yes** — `docs/ops/migration-policies.md` + fields on each migration module |
| Generator is committed (not a one-off dump) | **Yes** — `server/fixtures/productionShaped/generate.js` + `npm run generate:production-shaped` |

## Verification

```
# Temp-dir rehearsal (this unit)
node server/scripts/generateProductionShapedDataset.js <tmp>/db.json
ECD_DB_FILE=<tmp>/db.json npm run migrate:dry-run
ECD_DB_FILE=<tmp>/db.json npm run migrate
  → metaLeft:false, hyphenLeft:false, recon:13, toolsOk:true, items:1000, sessions:480

NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1793 passed | 9 skipped (1802) — 158 files (~247s)

npm run build
  green
```

Live `:6060` `/api/health` ok (ecd-json + mongo users); metrics showed
registry pending 001–004 before this unit — 005 adds to registry; apply on
live walk DB is operator choice (backup first), not required for exit.

## Delivered

| Area | Change |
|---|---|
| `server/fixtures/productionShaped/generate.js` | Seeded regenerable dataset (defaults ≥1000 items, ≥400 sessions, ≥5 districts + legacy shapes) |
| `server/scripts/generateProductionShapedDataset.js` | CLI + `npm run generate:production-shaped` |
| `005-remove-lifecycle-meta.js` | Real strip after 003/004; forward-only |
| `002` | Reads ECD JSON (`readRawDB`) so rehearsal hits task models where they live |
| `001`–`005` | `rollback` / `forwardOnly` metadata |
| `docs/ops/migration-policies.md` | Policy table + rehearsal procedure |
| Writers | EM/CM/TM stop persisting denormalized meta; CM confirm uses `resolveReviewSubmitter` |
| Tests | `d109ProductionShapedMigration.test.js` + lifecycle assertion updates |

## What remains

- **D110** — five load scenarios + DR runbook (reuse this generator)
- Operator: run 005 against live ECD volume only after D107 backup

## Next

Calendar **D110** — alone (load testing + DR runbook + W22 handoff).
