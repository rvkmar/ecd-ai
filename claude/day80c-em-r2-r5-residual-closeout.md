# Session 2026-09-16 — EM-R2…EM-R5 off-calendar residual closeout

**Not D81.** Calendar D81 remains W17 psychometric dashboards. This session
finished the EM residual stack after EM-R1.

**Status: DONE** for EM-R2, EM-R3, EM-R4, and EM-R5 exit checks (each unit
committed alone).

## Units

| ID | Tier | Exit check | Commit |
|---|---|---|---|
| EM-R2 | 2 | Console-ingest converged Theta set; Accumulation uses non-`ecd-pilot` package | `f732e19` |
| EM-R4 | 2 | Prereq unmet → kinematics blocked; met → proceeds; Newtonian policy fixture | `485c13d` |
| EM-R5 | 1 | Confirm hard-gates Assembly floors; Step 7 still warns | `e2f3d2f` |
| EM-R3 | 2 (schema alone) | Multi-column Force Q; binary attrs; continuous column refused | `127eeef` |

Order followed dependency (R3 schema last) while completing R2→R5.

## Premises on contact

| Unit | Assumed | Actually |
|---|---|---|
| EM-R2 | Need live R for Newtonian | Console-driven `ingestCalibrationJob` path exists; exit check uses it |
| EM-R4 | `prerequisiteGating` unused | Confirmed absent from `activitySelection.js` |
| EM-R5 | Soft Assembly warns only | Step 7 warn-only; schema had no confirm floor |
| EM-R3 | Force Q is 1 attribute | Confirmed; split into 3 binary SMVs |

## What was delivered

### EM-R2
- `newtonianConsoleIngestAccumulation.smoke.test.js` — ingest → Accumulation
- README: attach-seed = draft bridge; console ingest for operational params

### EM-R4
- `applyPrerequisiteGating` in `activitySelection.js` (IRT + BN)
- Policy from governing Assembly `selectionAlgorithm.policyId`
- Tests + Newtonian policy fixture

### EM-R5
- `src/utils/assemblySufficiency.js` shared floors
- Confirm/strict → errors; Step 7 → warnings

### EM-R3
- `newtonian_mechanics_competency_model.json` — Force pair / net / diagram
- Multi-column `newtonian_force_qmatrix.json`; Assembly/policy/EM remaps
- `newtonianForceAttributeSplit.test.js`

## What remains

| Item | Notes |
|---|---|
| Ops | Live `:6060` Newtonian promote walk |
| Calendar | **D81** — W17 psychometric dashboards |
| G7 / W23 | Design Patterns; Presentation Model |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  122 passed (122)
  Tests  1536 passed | 9 skipped (1545)
  Duration  98.78s

npm run build
  largest JS chunk recharts 446.89 kB; entry index-AzxEEuBR.js 31.31 kB
  built in 24.30s
```

Product commits: EM-R2 `f732e19`, EM-R4 `485c13d`, EM-R5 `e2f3d2f`, EM-R3 `127eeef`.

## Calendar

Off-calendar — **do not** mark D81 ✅.

## Next

Calendar **D81** (W17 dashboards).
