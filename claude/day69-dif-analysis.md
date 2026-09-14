# D69 — DIF analysis (difR) as a job kind (never-compress)

**Status: DONE in tests; live flag check is CI.** Product is the D69
commit on this session. `dif-analysis` was already a declared job kind
(`ingests: analysisArtefact`). What was missing — and what this unit
closed — is **R + groups + artefact ingest + a planted-item CI path**.

R is still not on any session path (ADR 0001). Equating remains
unimplemented (D70). DIF dashboards are D84.

## Exit check

| Plan exit check | What was actually executed |
|---|---|
| A seeded DIF fixture flags the planted item and only that item, at a stated tolerance, in CI | **Always-run path executed here.** HTTP enqueue → stub process → artefact ingest in `difPipeline.test.js`: Item.5 is the only flagged item on the contract stub; ingest writes `analysisArtefacts[]` and does not write `parameterSets[]`. **Live `difR::difMH` flag check is CI** (`lsat7-pipeline` step `difPipeline.test.js` against `rvkmar/r-backend:latest` + app mount). This environment has no Docker/R, so the live describe is skipped. Stated live assertions: `packageVersion` `/^difR /`, sampleSize 800, Item.5 `flag === true` and `pValue < 0.05`, every other item `flag === false` and `pValue > 0.05`. |

## What the plan assumed, and what the code was

The 2026-09-03 unit said "difR as a job kind." The vocabulary already
named `dif-analysis` / package `difR`. There was no `/calibrate/dif`,
no group vector on the ADR 0002 envelope, and ingest refused analysis
kinds without storing an artefact. There is no published one-item DIF
table in this pipeline (difR's `verbal` dataset flags several GMAT
items). The calendar exit check is a **seeded planted item**, not a
published coefficient pin.

## What shipped

- `{ fixture: "planted-dif" }`: 800×8 Rasch matrix, seed 20261201,
  equal ability, Item.5 focal difficulty +1.75. Groups on the request.
- `POST /calibrate/dif` → `difR::difMH` (Mantel-Haenszel, α=0.05, no
  purification). Per-item statistic, p-value, flag, method.
- Ingest writes an analysis artefact. DIF does not authorise a
  parameter set. Console ingest accepts either id.
- Always-run contract stub + live CI step.

## Honest remaining gaps

- Live planted-item flags are not executed in this authoring
  environment. CI is the acceptance (same class as D64/D66/D67).
- Equating (D70) still 501.
- No DIF dashboard copy (D84).
- CTT operational walk still D71/D77.

## Next

Calendar **D70** — equating / W14 close. Never-compress. Do not start
it on a thin budget.
