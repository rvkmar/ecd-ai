# D84 — Attribute-profile and DIF dashboards (W17)

**Status: DONE** for the calendar exit check: both aggregate types are
labelled and distinguishable; the DIF view states what a flag means and
what it does not, in the interface.

## Premise on contact

D79 artefacts already carry both estimands under
`payload.parameters.attributes` plus `profileDistribution` and
`diagnostics.estimandNotes`. D69 DIF artefacts carry per-item
statistic / α_MH / δ_MH / etsClass / flag / method / pair. D81–D83 own
stamp + shell tabs. D84 renders both on the Psychometrics shell.

## Exit checks

| Claim | Executed? |
|---|---|
| Both aggregate types labelled and distinguishable | **Yes** — estimand legend + dual bars + separate table columns; tests assert distinct rates |
| DIF view states what a flag means and does not | **Yes** — on-screen framing (`dif-framing`); not only docs |
| Provenance stamps | **Yes** — figures via `PsychometricFigure` |

## What shipped

| Area | Change |
|---|---|
| `attributeProfileView.js` / `AttributeProfileDashboard.jsx` | Cohort mastery + profile distribution |
| `difView.js` / `DifDashboard.jsx` | DIF table + ETS band + investigation framing |
| `PsychometricsDashboard.jsx` | **Attribute profiles** + **DIF** tabs |
| Tests | View helpers + dashboard exit checks |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  130 passed (130)
  Tests  1563 passed | 9 skipped (1572)

npm run build
  largest JS chunk recharts 451.37 kB; built ~18.5s
```

## Honest gaps

- Live `:6060` walks with ingested cohort / planted-dif artefacts not run.
- Equating dashboard was deferred historically with D84-class DIF; calendar
  D84 is attribute-profile + DIF only (no equating pane this unit).
- PDF/CSV export remains D85.

## Next

**D85** — PDF/CSV export + W17 handoff (provenance in exports).

## Calendar

Marked **D84** ✅ with real date **2026-09-17**.
