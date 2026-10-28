# D152 — generate the task-spec family

**Closed 2026-10-28**, recorded on the D153 close (this unit had no session-close of its own). Calendar unit **D152**, alone (Tier 2). W31. Calibrated at `d146635` / `a6a544b`. Product `5d2dde2`. Did not start D153 / D154 / D155 at the time.

**Status: DONE.**

## Exit check (executed)

| Claim | Executed? |
|---|---|
| A template generates its projected family exactly | **Yes** — D120 ten-spec fixture (bloom 5 × register 2 × stimulus fixed static). `d152GenerateTaskSpecFamily.test.js` |
| Each spec's TMV assignment is recorded | **Yes** — ten distinct bloom\|register keys; stimulus `static` |
| An oversized family is refused rather than silently produced | **Yes** — 26×26 = 676 refused with `projectedSize: 676`; store empty. Size 0 refused. Projector `slice` is not the production path |
| Second generate 409 while specs exist | **Yes** — regeneration was D153 |
| Authored `POST /api/taskSpecs` still 405 | **Yes** |
| District may not generate | **Yes** — 403 |

## Verification

Product `5d2dde2` ≡ `main/master` after that unit. Full suite then **2616 passed / 10 skipped** (306 files). Build green. The 10 skips were live R pipelines with `R_BACKEND_URL` unset.

## What the plan got wrong

The 2026-10-28 rewrite held: loop the existing projector; refuse 0 and >500; 409 if specs exist; no UI.

The dead-export allowlist for `insertGeneratedTaskSpec` was removed because this unit is the production caller.

UI family-size-by-`taskModelVariableIds` vs generate-by-`taskModelVariableSettings` was left as-is. Preview (D153) uses the generate path so it cannot drift.

## What was delivered

| Piece | Where |
|---|---|
| Generator | `server/services/generateTaskSpecFamily.js` |
| Route | admin `POST /api/templates/:id/generate-task-specs` |
| Query | `useGenerateTaskSpecsFromTemplate` |
| Tests | `d152GenerateTaskSpecFamily.test.js` |
| Allowlist | removed from `repoGuards` |

## Half-applied work

None at product time. Regeneration stayed 409 until D153. No preview UI. Item POST unchanged. AIG still unmounted.

## Next

Was D153 (preview and family view). That unit is closed in `claude/day153-generation-preview-family.md`.
