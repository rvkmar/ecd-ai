# D90 — Adversarial R-track review + W18 block close

**Status: DONE.** Never-compress Tier 3: separate Agents refuted the R
calibration track; every verified P0 fixed with regression tests. D54
readiness-mirror debt discharged. W18 block closes with this unit.

## Exit checks

| Claim | Executed? |
|---|---|
| Separate Agent refute of R track (null≠0, itemIds, ingest provenance, artefact≠paramset, seed, scheduler≠ingest, cohort tenancy) | **Yes** — [R calibration audit](f5370085-c879-44fc-85ad-8c850872a093) + [R bypass audit](35c49fab-cfdd-4bb0-bf1c-4cf7029a28e3); coordinator verified and fixed P0s |
| Every P0 fixed + regression | **Yes** — see Fixes below |
| D54 readiness-mirror agreement | **Yes** — `assemblyModelReadiness.js` shared by Step5 + wizard context; agreement test vs `validateAssemblyModelLifecycle` + schema |
| W18 handoff / ledger / calendar | **Yes** — this file + ledger + calendar mark |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1611 passed | 9 skipped (1620)
  Test Files  135 passed (135)
  (one load-order flake on adminPageIa under parallel full run; isolation green)

npm run build
  green; recharts 451.37 kB
```

App live at `:6060` this session (delivery not re-walked; adversarial was code + Agent).

## What the Agents found (ranked)

### P0 — fixed

1. **`POST …/recalibrate` invented provenance** (`sampleSize \|\| 0`,
   `packageVersion \|\| "manual-unspecified"`, `converged` default true)
   and activated the set. Now refuses omission; UI
   `buildRecalibrationPayload` sends `packageVersion` + `converged: true`;
   parse requires `software` / `packageVersion`.
2. **`attach-seed-parameter-sets` auto-activated** the live scoring
   pointer. Now attach-only; activation stays on
   `activate-parameter-set`.
3. **`activate-parameter-set` had no provenance gate.** Now requires
   `converged: true`, non-empty `packageVersion`, positive `sampleSize`.

### P1 — fixed cheaply / deferred

4. **R `response_matrix_to_df`**: stop using `unlist` (drops NULL); map
   NULL → NA explicitly (`contract.R`).
5. **`.require_seed`**: every calibrate_* refuses NA/missing seed (400).
6. **GDINA retry** kept dropping `control`/`randomseed` — fixed.
7. **ItemAnalysisTable** empty copy said “item parameters” — clarified
   artefacts ≠ scoring sets.
8. **Deferred:** ingest check-then-act race; district `analysisArtefacts`
   list unscoped by tenant (P1 carried).

### Solid (Agents + coordinator)

- Live null→0 path was already sound for JSON NA; hardened anyway.
- Scheduler enqueue-only; worker never auto-ingests.
- Analysis-kind ingest writes `analysisArtefacts`, not parameterSets.

## D54 discharge

Shared `src/components/assemblyModels/assemblyModelReadiness.js`
(`meetsAssemblyReviewedGates` / `hasAssemblyStoppingRule` /
`meetsAssemblyConfirmedGates`) is the single client mirror of
`validateAssemblyModelLifecycle`. Lifecycle now refuses empty
`stoppingRules: {}` at confirmed+. Agreement test:
`assemblyModelReadiness.test.js`.

## What remains

- Ingest idempotency under parallel POST (P1).
- District artefact list tenancy scope (P1).
- D68 mid-flight ingest live walk on `:6060` (carried).
- Close-suite intermittent 5s flakes under parallel load (isolation green).

## Next

Calendar after W18 — next block (W19+) per calendar backlog. No unit
queued from this close beyond striking D54 and closing W18.

## Calendar

Mark **D90** ✅ (do not move date). W18 block closed.
