# Off-calendar: Wave 2A D65 parameter-set diff

**Not D146.** Not a calendar unit. Closes the D65 leftover: parameter-set diff against the current active set, largest movements first. Does not start Wave 2B (D60 P1-4). Does not start D155. D129 was not reopened. W29 stays open.

Handoff id: day146ab.

**Status: DONE.** Exit check: a succeeded IRT inspect pane diffs against the current active set and lists rows by largest |Δ| first. Evidence Model Parameter Sets Compare uses the same table.

## Premise (rewritten on contact)

The ledger still said the diff was never built. That was stale. Evidence Model Calibration → Parameter Sets already had “Compare active against…” and an IRT Δa/Δb table. It listed observables in file order. The D65 console inspect pane had no diff at all.

Wave 2A is therefore: a testable helper, largest-|Δ| sort, DINA slip/guess in the same table, and the same surface on `CalibrationJobDetail`.

## Choice

- `diffParameterSets(active, other)` returns rows sorted by `max(|Δa|,|Δb|,|Δslip|,|Δguess|)` descending, then id. Δ = active − other.
- `ParameterSetDiff` replaces the inline `ParameterDrift`. Bayesian CPTs stay “inspect both”; CTT/empty numeric maps say there is nothing to compare.
- Console inspect loads `useEvidenceModel(job.evidenceModelId)`, takes the statistical model’s active set, and diffs `job.response.parameters` (or ingest result parameters) labeled as the ingested id or “this run”.
- Did not invent a second compare on ParameterSetViewer. Did not add PCM, Sympson–Hetter, or multivariate EAP.

## Live walk on `:6060`

Rebuilt and recreated `ecd-node` + `ecd-nginx` from this tree. Index `/assets/index-Cdv-oe6_.js`. Health ok; R reachable; hybrid `ecd-json` + mongo backends.

Live Evidence Models each had **one** parameter set and **no** `activeParameterSetId`, so Compare was hidden (needs two sets) and the console table was hidden (needs an active set).

Activated candidate `ps1793177976685` on **Part naming evidence** / `sm-plant-irt` (confirmed, locked, `converged: true`, `mirt 1.48`, n=300). Then `/admin/calibration` → Inspect `job1793177974633000`. The inspect pane rendered **Drift — active vs ps1793177976685 (largest movement first)**. This run *is* that ingested set, so every Δ was 0.000 and rows sorted by id (`it_mvrvcqqs_000` first). The heading and the largest-first contract are on the D65 surface.

Largest-movement order with non-zero Δ is covered by the helper and console tests (`Item.5` before `Item.1`).

Did not enqueue a second calibration. Did not import `sample-calibration-irt-2pl.json` (observables `o1`/`o2`/`o3` do not match this live EM).

## What was not done

Wave 2B D60 P1-4. Wave 3 W29. Wave 4 limits. D68 / Continue / Newtonian still need a store that can host them. D155. Reopening D129. `docker compose build r-backend`. Did not commit (not asked). Did not archive live confirmed Student Models.

## Leftovers on `:6060`

- Draft clone of Plant part naming (first Manage row; Edit/Delete).
- **Wave 1 walk teachers only**.
- **Wave 2 walk public**.
- Part naming IRT `sm-plant-irt` now has `activeParameterSetId = ps1793177976685`. Sessions on this store are already completed; new sessions would score with this set.

## Rollback

Revert the product files. Recreate `ecd-node` + `ecd-nginx` from the previous image. Optionally clear `activeParameterSetId` on `sm-plant-irt` if that pointer must not stay.

## Verification

```
npx vitest run (related)
  3 files, 21 passed

NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  332 passed (332)
  Tests  2874 passed | 5 skipped (2879)
  Duration  198.62s

npm run build
  EvidenceModelBuilder 369.20 kB gzip 87.23 kB
  ParameterSetDiff 5.73 kB gzip 1.87 kB
  built in 21.78s

docker compose build node nginx
docker compose up -d --force-recreate node nginx
  ecd-node Recreated / Started
  ecd-nginx Recreated / Started
  nginx EvidenceModelBuilder-sl-wcalT.js 371.78 kB gzip 82.67 kB
  nginx ParameterSetDiff-D64T4Zrr.js 5.82 kB gzip 1.81 kB

curl.exe http://localhost:6060/api/health
  status ok, R reachable, servingSessions true

curl.exe http://localhost:6060/
  /assets/index-Cdv-oe6_.js
```

Browser: Parameter Sets showed one candidate (no Compare). After Activate, inspect `job1793177974633000` showed the drift table vs `ps1793177976685`.

## Calendar

Not a calendar unit. D65’s start/watch/inspect/ingest walk was already closed 2026-09-13. This close only discharges the leftover diff. Last completed calendar unit stays D154. Next remains D155, never-compress, not started. W29 stays open.

## Next

Wave 2B D60 P1-4 if still wanted. Unexecuted standing walks once the store can host them (D68, Continue, Newtonian). Do not start D155 from this close.
