# D83 — Test information and reliability dashboard (W17)

**Status: DONE** for the calendar exit check: requiredSEM renders on the
conditional SEM curve; a bank that cannot meet it anywhere is visibly
identifiable without arithmetic.

## Premise on contact

D78 artefacts already store `parameters.{theta,information,conditionalSEM}`
plus `fitStatistics.kr20` / optional `marginalReliability`. D81/D82 own
the stamp + recharts chrome. Assembly Models already declare
`targetsBySMV[].requiredSEM` for continuous SMVs. D83 overlays that
target on the SEM chart and labels classical vs IRT reliability.

## Exit checks

| Claim | Executed? |
|---|---|
| requiredSEM target renders on the curve | **Yes** — dashed `ReferenceLine` on conditional SEM chart when an Assembly target is selected |
| Bank that cannot meet it anywhere is visible without arithmetic | **Yes** — banner `sem-never-meets` when every finite SEM &gt; requiredSEM; curve sits entirely above the dashed line |
| Stamps on figures | **Yes** — both charts via `PsychometricFigure` |
| Reliability labelled distinctly | **Yes** — KR-20 vs marginal reliability + diagnostics note |

## What shipped

| Area | Change |
|---|---|
| `testInformationCurve.js` | Curve flatten, SEM evaluation, Assembly target extract, reliability extract |
| `TestInformationCharts.jsx` | I(θ) + SEM charts; never-meets / meets banners |
| `TestInformationDashboard.jsx` | Artefact + Assembly target pickers; reliability panel |
| `PsychometricsDashboard.jsx` | **Test information** tab |
| Stories + tests | Curve helpers, dashboard overlay, shell tab |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  128 passed (128)
  Tests  1557 passed | 9 skipped (1566)

npm run build
  largest JS chunk recharts 451.37 kB; built ~15.6s
```

## Honest gaps

- Live `:6060` walk with ingested `known-2pl-testinfo` + a real Assembly
  Model not executed this session.
- Equating dashboard remains D84-class (calendar D84 is attribute-profile + DIF).

## Next

**D84** — Attribute-profile and DIF dashboards.

## Calendar

Marked **D83** ✅ with real date **2026-09-17**.
