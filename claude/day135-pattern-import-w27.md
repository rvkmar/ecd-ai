# Session close — D135 import/export + W27 gate

**Closed 2026-10-14.** W27 closes.

## Exit check

| Unit | Exit check | Status |
|---|---|---|
| D134 live menus | Possibilities framing and five menus on `:6060` | **DONE** (nginx rebuilt this session) |
| D135 | A pattern is authored and confirmed with its attribute set; export/re-import keeps refs or reports them unresolvable | **DONE** |

Live Admin (`admin1`) on `http://localhost:6060/admin?tab=designpatterns` after `docker compose up -d --build nginx node`. Index `index-DMTNO5PB.js`, chunk `DesignPatternBuilder-CUI9gFgh.js`. Framing and all five menus visible. Draft **Explain a labelled diagram** confirmed. Work-product / rubric / TMV libraries were empty on this mongo, so those menus were left empty (allowed). Bulk round-trip is in tests, not a second live import.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2124 passed | 9 skipped (2133)

npm run build
  green (~34s). Largest JS chunk recharts 488.42 kB.
  DesignPatternBuilder-CUI9gFgh.js 15.34 kB; SettingsPage-Cn8Kndem.js 77.63 kB.
```

## What was delivered

`POST /api/designPatterns/bulk` on the existing route (207, always draft). Settings Download + Upload cards, unified stage after the ECD chain. `samples/sample-design-patterns.json` uses id placeholders. Missing `workProductId` fails that row. No name remapping. No WP/rubric/TMV bulk. No W28 seeding.

## Half-applied work

None. Node and nginx were rebuilt together so UI and `/bulk` match.

## Compression debt

| Unit | What was compressed | Why | Discharge by |
|---|---|---|---|
| D135 live bulk upload | Settings Data click-through of the new card | Confirm on the wizard was the W27 behavioural gate; bulk is covered by the 207 test | W28 start if the card is unused |

Standing risks, still open:

- D68 live mid-flight ingest on `:6060`
- Competency-model archive live walk on `:6060`

## Calendar

D134 and D135 marked ✅. Dates were not moved. W27 gate held: a pattern was authored and confirmed.

## Next

W28 — `seedFromDesignPattern`. Do not treat `confirmed` as delivery. Do not rebuild D132 routes.
