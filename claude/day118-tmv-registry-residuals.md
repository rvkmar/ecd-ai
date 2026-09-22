# D118 — TMV registry residuals (consumers + Storybook)

**Status: DONE.** Calendar unit **D118**, alone (Tier 1). Started from
`d59c191` (post-D117 close). Did not start D119, D120, or W25.

## Exit check

**Calendar (as revised after D117):**

> A TMV's consumers are visible before it is edited; Storybook story in both
> themes; no arbitrary Tailwind values.

Create/list/bind already landed under D117 — this unit closed the residual.

| Claim | Executed? |
|---|---|
| Consumers visible on the library row | **Yes** — `Used by` column from Task Models' `taskModelVariableIds` |
| Consumers listed again before edit | **Yes** — amber banner `tmv-consumers-before-edit` |
| Delete blocked client-side when consumers exist (names them) | **Yes** — toast; server 409 remains |
| `valueSet` levels read-only with vocabulary note | **Yes** — `tmv-valueset-readonly` |
| Edit wired via existing PUT + `useUpdateTaskModelVariable` | **Yes** — name/description; levels locked for valueSet |
| Storybook light + dark (theme toolbar) | **Yes** — `Task Model Variables/Library` stories |
| No D119 enum re-point | **Yes** — TM scalars untouched |

## Premise on contact

Held as calibrated: create/list/delete + wizard bind done; no consumer column;
no edit UI; update hook unused; zero TMV stories.

## Design

| Piece | Where |
|---|---|
| Presentational library | `TaskModelVariableLibraryView` (Storybook + tests) |
| Wired shell | `TaskModelVariableBuilder` + `useTaskModels` for consumers |
| Helper | `consumersForVariable` |
| Stories | `src/components/taskModelVariables/__stories__/TaskModelVariableLibrary.stories.jsx` |
| Tests | Extended `taskModelVariableBuilder.test.jsx` |

No new HTTP route — consumers derived from Task Models list (same predicate as
`taskModelsConsumingVariable` on the server).

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1987 passed | 9 skipped (1996) — 178 files (~109s)

npm run build
  green (1m 58s)
```

D117 close was **1983 passed / 9 skipped**. Delta: **+4 tests** (consumers
helper, row, edit banner + valueSet lock, delete guard).

## Next

Calendar **D120** (per-template fixed/vary settings + W24 worked example) after
re-calibration — or confirm ordering. **D119** enum re-point is never-compress;
do not start from this unit.
