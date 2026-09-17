# D81 — Psychometric dashboard shell + provenance stamp (W17)

**Status: DONE** for the calendar exit check: shell renders; a figure cannot
compose without a provenance stamp (test-asserted); Storybook stories exist
for the stamp and one reference chart (both themes via toolbar).

## Premise on contact (rewritten)

Calendar said `/admin/psychometrics` + stamp-first + settle the chart system.
Against the repo:

- Admin chrome is nested Delivery tabs (D73b), not only path routes — ship
  **both** Delivery → Psychometrics and `/admin/psychometrics` (D65 pattern).
- Chart library already settled: **recharts** (D74). Do not add a second.
- `analysisArtefacts` already carry `jobId` / `packageVersion` / `sampleSize` /
  `computedAt`; no top-level `parameterSetId` — stamp derives source from
  `parameterSetId` | `statisticalModelId` | `evidenceModelId` | `derivedFrom`.
- `useAnalysisArtefacts` already existed — consume, do not rebuild.
- Delivery → Reports stays session analytics; Psychometrics is separate.

## Exit checks

| Claim | Executed? |
|---|---|
| Shell renders | **Yes** — Admin Delivery tab + `/admin/psychometrics` page |
| Figure cannot compose without stamp | **Yes** — `assertPsychometricProvenance` + `PsychometricFigure` throw; tests |
| Storybook stamp + reference chart, both themes | **Yes** — stories under `Psychometrics/`; theme toolbar flips `.dark` |

## What shipped

| Area | Change |
|---|---|
| `src/components/psychometrics/provenance.js` | normalize + assert contract |
| `ProvenanceStamp.jsx` | reusable stamp UI |
| `PsychometricFigure.jsx` | mandatory frame (stamp always mounted) |
| `chartTheme.js` | shared recharts axis/tooltip/legend/colours + dash patterns |
| `ReferenceInformationChart.jsx` | reference I(θ)/SEM chart |
| `PsychometricsDashboard.jsx` | artefact list shell + reference chart |
| `src/pages/PsychometricsPage.jsx` | addressable page |
| `AdminPage.jsx` / `App.jsx` | Delivery tab + route |
| Stories | `ProvenanceStamp`, `ReferenceInformationChart` |
| Tests | compose guard, dashboard, Admin IA |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  124 passed (124)
  Tests  1544 passed | 9 skipped (1553)
  Duration  61.70s

npm run build
  largest JS chunk recharts 446.89 kB; built in 12.54s
```

## Honest gaps (not D81 blockers)

- Per-kind live artefact charts (item analysis, TIF, DIF, equating, cohort) — D82+.
- PDF/CSV export — later W17.
- Live `:6060` Admin click-through of the new tab not walked this session (jsdom + route/source tests).
- Storybook stories authored; `npm run storybook` not launched this close.

## Next

**D82+** — concrete psychometric figure panes on this shell. Do not start W25
in the same session.

## Calendar

Marked **D81** ✅ on ecd-claude calendar with real date **2026-09-17**.
