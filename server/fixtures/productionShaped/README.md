# Production-shaped dataset (D109)

Committed **generator** — not a one-off dump. Regenerate whenever the
shape needs refreshing:

```bash
npm run generate:production-shaped
# → fixtures/production-shaped/db.json + manifest.json (gitignored)
```

Defaults (seed `20260920`): ≥1000 items, ≥400 sessions, ≥5 districts,
plus legacy shapes for the migration chain (`in-progress` sessions,
string `toolsAllowed`, lifecycle meta blobs).

Rehearsal: `docs/ops/migration-policies.md` and
`server/migrations/__tests__/d109ProductionShapedMigration.test.js`.

D110 load tests reuse this generator.
