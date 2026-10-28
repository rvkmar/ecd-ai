# D153 — generation preview and family view

**Closed 2026-10-28.** Calendar unit **D153**, alone (Tier 2). W31. Started from `5d2dde2` (D152 product; that unit had no close). Did not start D154 or D155.

**Status: DONE.**

## Exit check (executed)

| Claim | Executed? |
|---|---|
| Preview matches what generation produces exactly | **Yes** — `GET /api/templates/:id/task-spec-preview` returns the same assignment array generate writes. `d153TaskSpecFamily.test.js` |
| Family view shows varying dimensions as columns | **Yes** — bloom and register are columns; stimulus is a fixed note. `taskSpecFamilyMatrix.test.js` and `d153TaskSpecFamilyPanel.test.jsx` |
| Bulk confirm and retire work on a whole family | **Yes** — Generate writes the preview; `{ replace: true }` deletes then regenerates; `DELETE /api/templates/:id/task-specs` retires every spec. Specs have no CAF status |

Live `:6060` was the previous Docker image (no bind-mount of `server/` or `dist/`). The panel was not walked there. The exit check was executed in tests.

## Verification

Product `f81bc2b`. Follow-on this session: D133 confirm timeout `9392667`; live R auto-detect `43fb35f`. Close also adds a 180s timeout on the planted-MCQ live test (it had none, so the first close suite timed it out at 15s).

Close re-run, concurrent with `npm run build`:

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1 failed | 2636 passed (2637) — 309 files (308.29s)
  The fail is planted MCQ live R, Test timed out in 15000ms.
  After adding }, 180_000):
    npx vitest run server/r/__tests__/plantedMcqPipeline.test.js
      4 passed (4.86s)

npm run build
  green (3m 19s). Largest JS chunk
  EvidenceModelBuilder-Dh8357Os.js 371.68 kB (gzip 87.59 kB).
  TemplateBuilder-DCGxOYS8.js 35.37 kB (gzip 10.29 kB).
```

Zero skipped on that close run because plumber on `:4000` was healthy (`43fb35f`). PsychometricFigure uncaught errors still print from tests that expect a throw; they are not failures.

D133 confirm did not time out on this close run (`9392667`).

Tree was clean at `43fb35f` ≡ `main/master` before this close. Remote is named `main`, tracking `master`.

## What the plan got wrong

Calendar said “bulk confirm.” Specs have no CAF status (`stale` boolean only). Confirm is generate-from-preview. Retire is bulk delete. Regeneration (D152 left 409) belongs here.

Preview must share the server plan (`planTaskSpecFamily`), not a second client cross-product. The builder’s live family size still uses `taskModelVariableIds`; generate uses all `taskModelVariableSettings`. Preview follows generate.

## What was delivered

| Piece | Where |
|---|---|
| Shared plan | `planTaskSpecFamily` in `generateTaskSpecFamily.js` |
| Preview | `GET /api/templates/:id/task-spec-preview` (any authenticated) |
| Replace | `POST .../generate-task-specs` with `{ replace: true }` |
| Retire | `DELETE /api/templates/:id/task-specs` (admin) |
| Matrix | `src/utils/taskSpecFamilyMatrix.js` |
| UI | `TaskSpecFamilyPanel` on a confirmed template in Manage |
| Tests | `d153TaskSpecFamily.test.js`, `taskSpecFamilyMatrix.test.js`, `d153TaskSpecFamilyPanel.test.jsx` |

Also this session, not D153: neighbourhood memo so D133 confirm does not re-layout React Flow per keystroke; live R describes run when `:4000/health` is healthy, serialized across files.

## Half-applied work

None on D153. Item POST unchanged. AIG still unmounted. itemMappings write-back is D154. W31 gate (ten specs delivered and scored) is D155.

## Compression debt

None new. Standing, still open:

- D68 live mid-flight ingest on `:6060`
- Competency-model archive live walk on `:6060`
- D115b instantiated-tasks click-through
- P1: deleting a Design Pattern drops `seededFrom.designPatternId`

## Calendar

D152 and D153 marked ✅. Dates were not moved. W31 was not marked. W29 stays open.

## Next

Re-calibrate before **D154** (itemMappings write-back; Task Model Step 6 becomes authoritative). Do not start D155 from this close. D155 stays never-compress. W29 stays open.
