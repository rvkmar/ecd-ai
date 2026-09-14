# D69 — DIF analysis (difR) as a job kind (never-compress)

**Status: DONE.** Product is `a66c475` plus two live-flag restatements
(`2d602bb`, `56de11d`). The calendar exit check passed on CI
[lsat7-pipeline `56de11d`](https://github.com/rvkmar/ecd-ai/actions/runs/34810924755)
(`difR 6.1.0`, `converged: true`, 800×8, unique ETS C on Item.5).

`dif-analysis` was already a declared job kind (`ingests:
analysisArtefact`). What this unit closed is **R + groups on ADR 0002 +
artefact ingest + a planted-item CI path whose unique flag is real**.

R is still not on any session path (ADR 0001). Equating remains
unimplemented (D70). DIF dashboards are D84.

## Exit check

| Plan exit check | What was actually executed |
|---|---|
| A seeded DIF fixture flags the planted item and only that item, at a stated tolerance, in CI | **Met.** Always-run HTTP enqueue → stub process → artefact ingest in `difPipeline.test.js`: Item.5 is the only flagged item on the contract stub; ingest writes `analysisArtefacts[]` and does not write `parameterSets[]`. **Live `difR::difMH` ran in CI** (`lsat7-pipeline` against `rvkmar/r-backend:latest` + app mount). Stated tolerance: **ETS C** (`\|deltaMH\| ≥ 1.5`, Holland and Thayer / ETS, matching `print.MH`). Item.5 is C and flagged; every other item is not C and `\|deltaMH\| < 1.5`. Unadjusted MH p < 0.05 is recorded (`mhSignificantItemIds`) and is **not** the operational flag. This environment has no Docker/R, so the live describe is skipped locally. |

First live CI on `a66c475` ([34808886072](https://github.com/rvkmar/ecd-ai/actions/runs/34808886072))
failed that unique-item check at unadjusted α=0.05 (flagged Item.1,
Item.4, Item.5). Second live CI on `2d602bb`
([34809741666](https://github.com/rvkmar/ecd-ai/actions/runs/34809741666))
switched the flag to ETS C but read a **non-existent** `deltaMH` field
on the MH object, so every item looked unflagged (`nFlagged: 0`) while
MH-significant ids were still Item.1/4/5/8. Third live CI on `56de11d`
computes `deltaMH = -2.35 * log(alphaMH)` and **passed**.

## What the plan assumed, and what the code was

The 2026-09-03 unit said "difR as a job kind." The vocabulary already
named `dif-analysis` / package `difR`. There was no `/calibrate/dif`,
no group vector on the ADR 0002 envelope, and ingest refused analysis
kinds without storing an artefact. There is no published one-item DIF
table in this pipeline (difR's `verbal` dataset flags several GMAT
items). The calendar exit check is a **seeded planted item**, not a
published coefficient pin.

The first live pin (unadjusted MH p < 0.05) was the wrong unique-item
rule on an 8-item matrix. The second pin (ETS C) was the right rule
with the wrong extraction: `print.MH` computes delta; the object stores
`alphaMH` only.

## What shipped

- `{ fixture: "planted-dif" }`: 800×8 Rasch matrix, seed 20261201,
  equal ability, Item.5 focal difficulty +2.5. Groups on the request.
- `POST /calibrate/dif` → `difR::difMH` (Mantel-Haenszel, α=0.05, no
  purification, continuity correction). Per-item MH statistic, p-value,
  `alphaMH`, `deltaMH`, ETS class, flag, method.
- Operational flag is ETS C. Diagnostics keep `mhSignificantItemIds`
  for the unadjusted test.
- Ingest writes an analysis artefact. DIF does not authorise a
  parameter set. Console ingest accepts either id.
- Always-run contract stub + live CI step.

## Session-close verification (2026-09-14 IST)

- `NODE_OPTIONS=--max-old-space-size=3072 npx vitest run` — **1357
  passed / 5 skipped** (88 files, 65.96s). Skips: live LSAT7, two live
  sim10GDINA describes, live CTT, live DIF when `R_BACKEND_URL` is unset.
- `npm run build` — Vite 7.3.6, **✓ built in 28.50s**. Chunk warning
  remains (`index-BiA_K_FV.js` 2,274.40 kB / gzip 633.79 kB) — D74.
- **Live exit check:** CI run
  [34810924755](https://github.com/rvkmar/ecd-ai/actions/runs/34810924755)
  on `56de11d` — `build-and-test` success; `lsat7-pipeline` success
  including **planted DIF full pipeline**. Package `difR 6.1.0`.
- **HEAD at product close:** `a66c475` + `2d602bb` + `56de11d`, then
  this verification commit. Local `master` matched `main/master` at
  `56de11d` before this commit.
- **Half-applied:** none. The scoring/ingest path was complete on
  `a66c475`; the two follow-ups were the unique-flag rule and the
  delta extraction. Not a half-cutover.

## Honest remaining gaps

- Live planted-item flags are not executed in this authoring
  environment. CI is the acceptance (same class as D64/D66/D67).
- Equating (D70) still 501.
- No DIF dashboard copy (D84).
- CTT operational walk still D71/D77.
- Parameter-set diff UI still not started (D65 leftover).

## Next

Calendar **D70** — equating / W14 close. Never-compress. Job kind
`equate` is declared; there is no `/calibrate/equating` yet. Do not
start it on a thin budget.
