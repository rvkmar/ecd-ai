# W20 block close — Multi-tenancy (D96–D100)

**Status: CLOSED** 2026-09-19.

## Gate

> A district user cannot read another district’s data through ANY endpoint,
> aggregates included, proven by test. The inspector’s answer matches what
> the API actually returns.

**Met** — `d100W20Gate.test.js` (inspector ≡ students list; foreign district
report 403) on top of D97–D99 storage/HTTP/aggregate coverage.

## Units

| Unit | Outcome |
|---|---|
| D96 | ADR 0006 + JWT `districtId`/`schoolId` |
| D97 | ALS + `loadDB`/`dbAdapter` filters + merge-on-save |
| D98 | Role × collection HTTP negatives + sixth mirrorDrift |
| D99 | Aggregate scope naming + `MIN_CELL_SIZE=5` + exposure gates |
| D100 | Scope inspector UI/API + W20 gate test |

## Handoffs

- `claude/day96-tenancy-adr-jwt-claims.md`
- `claude/day97-storage-boundary-tenancy.md`
- `claude/day98-row-level-tenancy-negatives.md`
- `claude/day99-aggregate-leakage.md`
- `claude/day100-w20-tenant-admin-scope-inspector.md`
