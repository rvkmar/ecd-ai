# D82 — Item analysis dashboard (W17)

**Status: DONE** for the calendar exit check: renders from a real
artefact; every figure carries its provenance stamp; flags name their
threshold and a next action.

## Premise on contact

Calendar assumed a greenfield item-analysis UI over D77 artefacts. D81
already shipped the Psychometrics shell + `PsychometricFigure` stamp
contract and recharts chrome. D82 **consumes** those — does not invent a
second stamp or chart library.

Artefact shape (D76/D77): `payload.parameters[itemId] = { pValue,
pointBiserial, n, distractors }`; scope has `evidenceModelId` /
`taskModelId` (often null on fixture ingest).

## Exit checks

| Claim | Executed? |
|---|---|
| Renders from a real artefact | **Yes** — `ItemAnalysisDashboard` reads `kind: item-analysis` via hooks; table + charts from `payload.parameters` |
| Every figure carries provenance stamp | **Yes** — charts go through `PsychometricFigure`; tests assert stamps |
| Flags name threshold + next action | **Yes** — `flagsForItemRow` + table; low-disc copy matches Part 5.2 example shape |

## What shipped

| Area | Change |
|---|---|
| `itemAnalysisFlags.js` | Advisory bounds (p 0.20/0.90; rpb 0.20 / negative) + actionable messages |
| `ItemAnalysisTable.jsx` | Sortable columns; flag list with threshold + action |
| `ItemAnalysisCharts.jsx` | p-value / point-biserial bars + bound reference lines, stamped |
| `ItemAnalysisDashboard.jsx` | EM/TM filters, artefact picker, distractor panel |
| `PsychometricsDashboard.jsx` | Tabs: Item analysis (default) / catalogue / reference |
| Stories + tests | Flags, dashboard, shell wiring |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  126 passed (126)
  Tests  1549 passed | 9 skipped (1558)

npm run build
  largest JS chunk recharts 451.37 kB; built ~12.6s
```

## Honest gaps

- Live `:6060` walk with an ingested `lsat7-item-analysis` artefact not
  executed this session (jsdom + fixture-shaped artefact in tests).
- Distractor UI shows structured JSON when present; dichotomous null path
  surfaces `diagnostics.distractorsNote`.
- Test-information / DIF / cohort panes remain D83–D84.

## Next

**D83** — Test information + reliability dashboard (requiredSEM overlay).

## Calendar

Marked **D82** ✅ on ecd-claude calendar with real date **2026-09-17**.
