# D70 — Linking / equating across forms (plink) + W14 handoff (never-compress)

**Status: DONE** locally against running R. Product is `0a2ff01` (first
pass: hand Mean/Sigma after two `mirt` Rasch fits) then `b96511a`
(`plink::plink` Mean/Sigma). The calendar exit check passed on
**local** `R_BACKEND_URL=http://127.0.0.1:4000` (8/8 in
`equatingPipeline.test.js`, including the live describe). GitHub
`lsat7-pipeline` has **not** yet been shown green on a Hub image that
includes `plink`.

`equating` was already a declared job kind (`ingests:
analysisArtefact`). What this unit closed is **`forms` on ADR 0002 +
`POST /calibrate/equating` + artefact ingest + a seeded known
transformation**.

R is still not on any session path (ADR 0001). Observed-score equating
via the `equate` package is installed and unused by this job. Equating
dashboards are later work (same class as D84 for DIF).

## Exit check

| Plan exit check | What was actually executed |
|---|---|
| Two forms with a common-item design are placed on a common scale; a constructed fixture with a known transformation recovers it within a stated tolerance; method and provenance are recorded on the artefact | **Met locally.** Always-run HTTP enqueue → stub process → artefact ingest in `equatingPipeline.test.js`: ingest writes `analysisArtefacts[]` and does not write `parameterSets[]`. **Live path:** same fixture posted to `/calibrate/equating`. Two `mirt` Rasch calibrations, then `plink::plink(..., rescale="MS")`. Stated tolerance: slope **1 ± 0.2**, intercept **−0.5 ± 0.3**. Fixture: seed `20261202`, 400 Form X + 400 Form Y, six common items, Form Y generated **+0.5** logits. `packageVersion` `/^plink /`. Method `Mean/Sigma`; `from` Y `to` X. |

This environment **does** have Docker/R (`http://localhost:4000/health`
2026-09-14 10:54:32 UTC: R 4.6.1, `equate` 2.0.9, `plink` 1.5.1). That
is the acceptance for this close, not Hub CI. `lsat7-pipeline` still
`docker pull rvkmar/r-backend:latest`; until that tag is the rebuilt
image, GitHub will 500 `plink is not installed`.

## What the plan assumed, and what the code was

The 2026-09-03 unit said "equating job kind using equate / plink." The
vocabulary already named `equating`. There was no `/calibrate/equating`,
no `forms` on the ADR 0002 envelope, and no known-transformation
fixture. Hub `rvkmar/r-backend:latest` at first contact did **not**
contain `equate` or `plink`.

First restatement (`0a2ff01`): two `mirt` Rasch fits and a **hand**
Mean/Sigma (Marco 1977) so CI could run on the then-published image.
The user then rebuilt the local image with `equate` and `plink`. Second
restatement (`b96511a`): linking constants come from `plink::plink`.
`equate` (Albano observed-score) stays on the image; this job is IRT
common-item linking (Weeks 2010).

On true Rasch *b* with a uniform 0.5 shift, `link.con()` returns
Mean/Mean, Mean/Sigma, Haebara, and Stocking-Lord all at A=1, B=−0.5.
The operational constants on the artefact are the Mean/Sigma row; the
other three are diagnostics (`allLinkingMethods`).

## What shipped

- `{ fixture: "known-equating" }`: NEAT common-item matrix generated in
  Node (`server/r/knownEquatingFixture.js`). NA = not administered.
- `forms` on the request: person labels, `formX` / `formY`,
  `commonItemIds`.
- `POST /calibrate/equating` → `mirt` Rasch per form →
  `plink::plink` Mean/Sigma putting Y on X.
- Ingest writes an analysis artefact. Equating does not authorise a
  parameter set. Console copy names plink.
- Always-run contract stub + live step when `R_BACKEND_URL` is set.
  CI workflow already has a "known equating full pipeline" step.

## Session-close verification (2026-09-14 IST)

- `NODE_OPTIONS=--max-old-space-size=3072 npx vitest run` — **1371
  passed** (89 files, 97.79s). Close suite ran **without**
  `R_BACKEND_URL`; live R describes skip in that configuration (same
  class as D64–D69). Vitest 5 summary on this run did not print a
  skipped count.
- `npm run build` — Vite 7.3.6, **✓ built in 37.55s**. Chunk warning
  remains (`index-BcFjcalL.js` 2,275.18 kB / gzip 633.99 kB) — D74.
- **Live exit check:**
  `$env:R_BACKEND_URL='http://127.0.0.1:4000'; npx vitest run
  server/r/__tests__/equatingPipeline.test.js` — **8/8**. `/health` as
  reported by the operator at 16:14 IST: `equate` 2.0.9, `plink` 1.5.1.
- **HEAD at product close:** `0a2ff01` + `b96511a`, then this
  verification commit. Local `master` was ahead of `main/master` at
  `b96511a` before this commit (D70 product not yet pushed).
- **Half-applied:** none. The first product was a complete mirt-only
  path on an image that lacked plink; the second replaced the
  operational constants with plink. Not a half-cutover of scoring.

## Honest remaining gaps

- Hub `rvkmar/r-backend:latest` must be the rebuilt image before GitHub
  `lsat7-pipeline` can pass the live equating step. Recorded as
  compression-class **ops debt**, not as an unexecuted exit check.
- Calibration-console enqueue of known equating on `:6060` was not
  walked this session (password fill blocked in the agent browser).
- `equate` is unused by `/calibrate/equating`. Observed-score equating
  is not this unit.
- No equating dashboard copy.
- CTT operational walk still D71/D77.
- Parameter-set diff UI still not started (D65 leftover).

## Next

Calendar **D71** — full core browser pass (W15 Core sign-off). Four
roles, live, not jsdom. Do not start it on a thin budget. W14's R
diagnostics path (LSAT7, sim10GDINA, CTT, DIF, equating) is closed in
the app; Hub image publish is the remaining ops step for equating CI.
