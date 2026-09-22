# D117 — Task Model Variable authoring UI (W24 remainder)

**Status: DONE.** Calendar unit **D117**, alone. Started from `main` tip
`b73db48` (post-D116 + Instantiated-tasks copy). Did not start D118–D120,
D119 enum re-point, W25, Presentation Model, or SessionPlayer work.

## Exit check

> An author can create a Task Model Variable in the library and bind it on a
> Task Model with per-model settings (`required`, `allowedValues`). The wizard
> step and Admin Models tab exist. Schema / HTTP from D116 are unchanged.
> No CAF lifecycle on the variable. D119 enum re-point is not this unit.

| Claim | Executed? |
|---|---|
| Models → **Task Model Variables** library CRUD surface | **Yes** — `TaskModelVariableBuilder.jsx` + Admin tab `taskmodelvariables` |
| Task Model Wizard **Variables** step binds library ids + settings | **Yes** — `StepVariables.jsx`; draft carries `taskModelVariableIds` / `taskModelVariableSettings` |
| Settings: required + allowed levels from vocabulary value set | **Yes** — step tests toggle required and `analyze` on Bloom |
| Review summary shows bound count | **Yes** — `Step8Review` SummaryBlock |
| Variables step is advisory (does not block Next) | **Yes** — `stepCanAdvance` + shell contract |
| No second schema / no D119 re-point of `presentationMode` etc. | **Yes** — D116 collections and TM scalar fields untouched |
| Shell rail labels / review index stay aligned after +1 step | **Yes** — `taskWizardShell.test.jsx` (review = step 8 of 9) |

## Premise on contact

HEAD `152940c` / later `b73db48`. Hypothesis from calibration held:

- D116 shipped schema, routes, hooks, and vocabulary. **Zero UI.**
- `taskModelVariableSettings` already existed on Task Models; nothing persisted
  them from the wizard.
- Convention B Task Wizard shell: add a step key, label, and case — do not fork
  a second wizard framework.
- Student Model Variables remain on competency models; they are not the TMV store.

## Design

| Surface | Where |
|---|---|
| Library | `src/components/taskModelVariables/TaskModelVariableBuilder.jsx` — list / create / delete via existing query hooks |
| Admin IA | Models tab **Task Model Variables** (lazy), beside Task Model |
| Wizard step | `variables` between blueprint and itemMapping; advisory |
| Draft | `buildInitialDraft` already had ids/settings; step mutates them |
| Review | Bound count + required count |
| Tests | `stepVariables.test.jsx`, `taskModelVariableBuilder.test.jsx`, shell + admin IA updates |

**What this is not.** Re-pointing Task Model design-feature scalars at variable
ids (D119). Instantiated-task / SessionPlayer work. CAF status on TMVs.

## Verification

```
npm test
  1983 passed | 9 skipped (1992) — 178 files (~80s)

npm run build
  green (~74s); TaskModelVariableBuilder chunk present (~5.78 kB)
```

D116 close was **1980 passed / 9 skipped** (176 files). Delta: **+3 tests /
+2 files** (`stepVariables.test.jsx`, `taskModelVariableBuilder.test.jsx`) plus
shell/admin IA expectation updates. Skips unchanged.

Gate is component tests (bind + settings + library create form), not a live
`:6060` browser walk. Schema/HTTP coverage remains D116’s.

## Next

Calendar **D118** (or whatever the calendar titles next in W24 — do not start
D119 enum re-point from this unit). Re-calibrate before starting. Do not start
W25.
