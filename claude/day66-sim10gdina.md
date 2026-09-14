# D66 — sim10GDINA through R (never-compress)

**Status: DONE in code + always-run tests.** Live GDINA is the CI job
`lsat7-pipeline` (same published image + app mount as compose). This
environment has no Docker/R, so the live describe is skipped here.
CTT remains 501 (D67). R is still not on any session path (ADR 0001).

## What sim10GDINA actually is

`GDINA::sim10GDINA` (Ma & de la Torre 2020; package 2.9.12) is a
published simulation: **1000 examinees × 10 dichotomous items**,
**3 attributes**. Components:

| Field | Shape | Role |
|---|---|---|
| `simdat` | 1000 × 10 | response matrix |
| `simQ` | 10 × 3 | Q-matrix |
| `simItempar` | per-item P(success \| reduced pattern) | generating parameters (documented, not stored as the calibration result) |

Extracted from CRAN `GDINA 2.9.12` `data/sim10GDINA.rda`. Item correct
counts the fixture test pins:

| Item.1 | Item.2 | Item.3 | Item.4 | Item.5 | Item.6 | Item.7 | Item.8 | Item.9 | Item.10 |
|---|---|---|---|---|---|---|---|---|---|
| 550 | 461 | 517 | 455 | 279 | 734 | 428 | 384 | 433 | 451 |

`simQ` (rows = items) is **not** the Q-matrix the GDINA vignette
constructs around `simdat` for a walkthrough. This unit uses the
package object's `simQ`.

## What shipped

- `server/r/fixtures/sim10gdina.json` and the R-side twin
  `r-backend/app/tests/fixtures/sim10gdina.json`. Node loads the
  `server/r/fixtures/` copy so Dockerfile.node can see it (#21).
- `{ fixture: "sim10gdina" }` enqueue. Bound statistical-model type
  selects `model.family` `gdina` or `dina`. Job kind is the already
  declared `dina-parameters`.
- R `POST /calibrate/dina` and `POST /calibrate/gdina` call
  `GDINA::GDINA`. G-DINA returns `{ probabilities }` in the package's
  reduced-pattern order (`gdina-graded-lex`, already verified on D37).
  DINA returns `{ slip, guess }` from the first and last category
  probabilities (`g = P(none)`, `1-s = P(all)`).
- Ingest still refuses `converged: false`.
- Always-run contract path + live path when `R_BACKEND_URL` is set.
- Console fixture picker: LSAT7 (IRT/Rasch) or sim10GDINA (DINA/G-DINA).
  No invented item parameters.
- CTT `/calibrate/ctt` is still a contract-shaped 501.

## Live CI finding

The first live run converged (`GDINA 2.9.12`, 1000×10, 45 EM cycles) but
keyed parameters `"Item 1"` … `"Item 10"` — GDINA’s default
`item.names` uses a space, not `Item.1`. The Node test looks up the
request ids. Fix: pass `item.names` from `model.itemIds` and key the
ADR 0002 `parameters` object by that same vector, not
`names(catprob.parm)`.

## Live checks (not a coefficient-table pin)

Same lesson as D64. The live path asserts:

- `/health` reports GDINA
- `succeeded` + `converged: true`
- `packageVersion` `/^GDINA /`
- `sampleSize: 1000`
- G-DINA: each item's `probabilities` length is `2^k` from that row of
  `simQ` (`k = 1,1,1,2,2,2,2,2,2,3`), values in `[0,1]`, and
  P(all mastered) > P(none) — true of every generating `simItempar` row,
  not a recovered-vs-generating numeric tolerance
- DINA: `guess` and `slip` in `[0,1)` with `guess < 1 - slip`

`simItempar` is stored on the fixture as documentation of the generating
model. It is not the expected calibration output.

## How to re-run

```bash
# Always-run half (no R)
npx vitest run server/r/__tests__/sim10gdinaPipeline.test.js

# Live half — compose default image + app mount, or the CI docker run
R_BACKEND_URL=http://127.0.0.1:4000 npm run test:sim10gdina
```

Enqueue by hand (admin token):

```bash
# POST /api/calibrationJobs  body: samples/sample-calibration-job-gdina-sim10gdina.json
# (bind a dina or gdina statistical model; family follows that type)
# POST /api/calibrationJobs/:id/process
# POST /api/calibrationJobs/:id/ingest
```

## D65 ledger correction

The coordinator completed the D65 live operator walk on 2026-09-13 on
localhost:6060 (`admin1` / WalkPass!2026). Job `job1789319022666002`
converged and ingested `ps1789319081640`. That compression-debt row is
closed. Parameter-set diff UI was not part of that walk and is still
not built.

## Honest remaining gaps

- Live GDINA in this authoring environment: no Docker/R here. CI is the
  live acceptance, as with D64. Always-run suite at this close:
  **1323 passed / 3 skipped** (the skips are the live LSAT7 describe and
  the two live sim10GDINA describes when `R_BACKEND_URL` is unset).
  Live CI is green: `GDINA 2.9.12`, `converged: true`, 1000×10, parameters
  keyed by request `itemIds`.
- D67 CTT still 501.
- Parameter-set diff UI still not started.
- `renv.lock` still absent; `/health` on `rvkmar/r-backend:latest` is
  the version record.
- G-DINA still has no session-time information-gain selection path
  (D60 P1-5); this unit calibrates parameters, it does not rank items.

## Next

Calendar **D67** — CTT through R. Never-compress.
