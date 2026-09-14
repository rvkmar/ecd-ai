# D67 — CTT through R (never-compress)

**Status: DONE with a restated live check** (same class as D64/D66).
Product is on `master` at **`4e8881a`** (#23). Live TAM is CI job
`lsat7-pipeline` (same published image + app mount as compose). This
environment has no Docker/R, so the live describe is skipped here.
`POST /calibrate/ctt` is implemented for this path. Live CI on
`45de56f`: `TAM 4.3.25`, `converged: true`, 1000×5, method
`TAM::tam.ctt2`. R is still not on any session path (ADR 0001).

The original G6 exit check (“a CTT Evidence Model reaches
`operational`”) was **not** executed as a lifecycle POST. What ran is
enqueue → R → ingest of a native `ctt-statistics` parameter set.
`readinessErrorsFor` now has something it can accept; the confirm →
operational walk itself was not this unit. `classicalCalibration.js`
still emits provisional IRT *a*/*b* from a CSV.

## Exit check

| Plan exit check | What was actually executed |
|---|---|
| Published (or well-documented classical) CTT coefficients through enqueue → R → ingest; check in CI | **Restated in part.** Live path does **not** pin a published KR-20 or point-biserial table — none exists for LSAT7 in this pipeline. It runs the published **1000×5** Bock & Lieberman matrix through enqueue → `TAM::tam.ctt` → ingest and asserts `converged: true`, `packageVersion` `/^TAM /`, `sampleSize: 1000`, each item's CTT **difficulty equals the published item mean** (definitional for complete dichotomous data), Item.5 p > Item.4 p, item-total rpb in (0, 1), and KR-20 in (0, 1). CI: [lsat7-pipeline on `45de56f`](https://github.com/rvkmar/ecd-ai/actions/runs/34802897124) (`TAM 4.3.25`, `TAM::tam.ctt2`, observed KR-20 0.4542 — recorded, not pinned). |

## What the CTT fixture actually is

Investigated, not assumed:

- Job kind `ctt-statistics` was already declared (`ecdVocabulary.js`),
  package **TAM**, R path `/calibrate/ctt`. Health already reports TAM.
  `psych` is **not** a declared runtime package on
  `rvkmar/r-backend:latest` (`HEALTH_PACKAGES` / `DESCRIPTION`).
- ADR 0002 names CTT fit as KR-20 and point-biserial per item. The
  authoring panel (`CTTConfigPanel`) names the same three estimates:
  Cronbach's alpha / KR-20, p-value difficulty, point-biserial
  discrimination.
- No separate published CTT coefficient table is in the repo or in TAM
  as used here. Inventing a response matrix labelled as published would
  violate never-compress.
- **LSAT7** (Bock & Lieberman 1970 / `mirt::LSAT7`) is already a
  published classical dichotomous test: **1000 examinees × 5 items**.
  CTT difficulty **is** that published item mean. D67 reuses that
  matrix as `{ fixture: "lsat7-ctt" }` so the IRT enqueue
  `{ fixture: "lsat7" }` stays unchanged.

Published counts the fixture test already pins (unchanged from D64):

| Item.1 | Item.2 | Item.3 | Item.4 | Item.5 |
|---|---|---|---|---|
| 828 | 658 | 772 | 606 | 843 |

Means 0.828, 0.658, 0.772, 0.606, 0.843. Mean total 3.707.

## What shipped

- `{ fixture: "lsat7-ctt" }` enqueue. Same Node table
  `server/r/fixtures/lsat7-frequency-table.json` (#21). Job kind is the
  already declared `ctt-statistics`. Bound statistical model must be
  type `ctt`.
- R `POST /calibrate/ctt` calls `TAM::tam.ctt2` (fallback `tam.ctt`)
  with the **raw total** as `wlescore`, so `rpb.WLE` is the ordinary
  item-total point-biserial, not an IRT WLE. Parameters keyed by
  request `itemIds`: `{ difficulty, discrimination, n }`.
  `fitStatistics.kr20` is Kuder & Richardson (1937) on that matrix
  (equals Cronbach's alpha for complete dichotomous data).
- CTT is not iterative. `converged: true` means every item has finite
  p in [0,1], finite rpb in (-1,1), and finite KR-20 (total-score
  variance > 0). Ingest still refuses `converged: false`.
- Always-run contract path + live path when `R_BACKEND_URL` is set.
- CI job `lsat7-pipeline` runs `cttPipeline.test.js` against
  `rvkmar/r-backend:latest` + `./r-backend/app` mount.
- Console fixture picker: LSAT7 (IRT), sim10GDINA (DINA/G-DINA),
  LSAT7 CTT. No invented item statistics.
- Sample: `samples/sample-calibration-job-ctt-lsat7.json`.

## Live checks (not a KR-20 table pin)

Same lesson as D64/D66. The live path asserts:

- `/health` reports TAM
- `succeeded` + `converged: true`
- `packageVersion` `/^TAM /`
- `sampleSize: 1000`
- each item's `difficulty` matches the published item mean
- Item.5 difficulty > Item.4 difficulty (p=0.843 vs 0.606)
- discrimination in (0, 1) — structural for this aptitude section, not
  a published table
- KR-20 in (0, 1); `meanScore` close to 3.707

Do not treat a recovered KR-20 as a published coefficient.

## Live CI finding

[`lsat7-pipeline` on `45de56f`](https://github.com/rvkmar/ecd-ai/actions/runs/34802897124)
identified CTT on the first live run: `TAM 4.3.25`, `converged: true`,
1000×5, parameters keyed `Item.1` … `Item.5`, method `TAM::tam.ctt2`.
Observed (not pinned) `fitStatistics.kr20` 0.4542, `meanScore` 3.707
(published), `sdScore` 1.1986. No column-name or keying fix was needed.

## How to re-run

```bash
# Always-run half (no R)
npx vitest run server/r/__tests__/cttPipeline.test.js

# Live half — compose default image + app mount, or the CI docker run
R_BACKEND_URL=http://127.0.0.1:4000 npm run test:ctt
```

Enqueue by hand (admin token):

```bash
# POST /api/calibrationJobs  body: samples/sample-calibration-job-ctt-lsat7.json
# (bind a ctt statistical model)
# POST /api/calibrationJobs/:id/process
# POST /api/calibrationJobs/:id/ingest
```

## Session-close verification (2026-09-14 IST)

- `NODE_OPTIONS=--max-old-space-size=3072 npx vitest run` — **1332 passed / 4 skipped** (85 files), 62.56s. Skips: live LSAT7, two live sim10GDINA describes, and the live CTT describe when `R_BACKEND_URL` is unset.
- `npm run build` — Vite 7.3.6, **26.59s**. Chunk warning remains (`index-4BMHM0La.js` 2,272.82 kB / gzip 633.36 kB) — D74.
- `git status` at this recording — dirty only with this close until committed. Product HEAD **`4e8881a`**.
- Live R not run locally (no Docker/R). CI `lsat7-pipeline` CTT step green on merge (`TAM 4.3.25`, `TAM::tam.ctt2`, KR-20 0.4542 observed not pinned).

## Honest remaining gaps

- Live TAM in this authoring environment: no Docker/R here. CI is the
  live acceptance, as with D64/D66. Always-run suite at this close:
  **1332 passed / 4 skipped** (85 files). Skips: live LSAT7, two live
  sim10GDINA describes, and the live CTT describe when `R_BACKEND_URL`
  is unset. `npm run build` green (chunk warning remains — D74).
  Live CI is green: `TAM 4.3.25`, `converged: true`, 1000×5,
  `TAM::tam.ctt2`.
- No published KR-20 / point-biserial table for LSAT7 was found; that
  pin is not invented. Tightening is D88-class if a table is later
  sourced.
- DIF and equating job kinds remain declared and unimplemented (W14
  remainder).
- Parameter-set diff UI still not started.
- `renv.lock` still absent; `/health` on `rvkmar/r-backend:latest` is
  the version record.
- `classicalCalibration.js` still wraps a response matrix as
  `kind: "irt-parameters"`. File-import CTT is not this pipeline.
- No test or browser walk promotes a CTT Evidence Model to
  `operational` after ingest. G6’s original behavioural check stays
  open as that walk (D68 / D71), not as a missing R endpoint.

## Next

Calendar **D68** — calibrated parameters supersede pilot (never-compress).
D69 DIF and D70 equating follow. Do not start D68 on a thin budget.
