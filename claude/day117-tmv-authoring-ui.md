# D117 — Task Model Variable authoring UI (W24 remainder)

**Status: DONE.** Calendar unit **D117**, alone. Started from `main` tip
`b73db48` (post-D116 + Instantiated-tasks copy). Product tip **`61018ee`**;
session-close tip **`64ae908`** (then this close). Did not start D118–D120,
D119 enum re-point, W25, Presentation Model, or SessionPlayer work.

## Exit check

**Calendar original (before contact):** seven-artefact remainder — routes, role
gates, lifecycle promotion validator, readiness mirror, React Query hooks.
D48 collection guard + unauthorized write refused + readiness agrees.

**What was actually executed (rewritten unit):**

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
| Original calendar routes/hooks/readiness exit check | **Already met on D116** (`5d0717c`) — not re-done here; CAF lifecycle omitted on purpose |

Gate is component tests (bind + settings + library create form), not a live
`:6060` browser walk.

## Premise on contact

HEAD `152940c` / later `b73db48`. Code hypothesis held:

- D116 shipped schema, routes, hooks, readiness, and vocabulary. **Zero UI.**
- `taskModelVariableSettings` already existed on Task Models; nothing persisted
  them from the wizard.
- Convention B Task Wizard shell: add a step key, label, and case — do not fork
  a second wizard framework.

**Calendar vs ledger (revised on contact, 2026-09-22):** Calendar W24 split was
D116 schema → D117 routes/hooks → D118 registry UI → D119 enum re-point → D120
per-template settings. D116 absorbed the seven-artefact HTTP surface (no CAF
lifecycle). This unit delivered the authoring surface (calendar D118 create/list
+ Task Model settings bind). Calendar event retitled accordingly; D118 left open
for residual exit check (consumer graph before edit; Storybook both themes).

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
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1983 passed | 9 skipped (1992) — 178 files (86.98s) — session-close re-verify 2026-09-22

npm run build
  green (1m 20s); TaskModelVariableBuilder chunk present (~5.78 kB)
```

Product tip **`61018ee`**; pin tip **`64ae908`**. Calendar ✅ marked 2026-09-22
(`9si8jn0ult3n21frrfqlmklils`). D118 annotated with early-land note.

D116 close was **1980 passed / 9 skipped** (176 files). Delta: **+3 tests /
+2 files** plus shell/admin IA expectation updates. Skips unchanged.

No half-applied work. No new compression debt (no live UI walk required by the
rewritten exit check; residual Storybook/consumer graph stays on D118).

## What remains

- **D118** residual: TMV consumer graph before edit; Storybook both themes
  (create/list/bind already shipped under this D117)
- **D119** enum re-point — later, alone, never-compress
- **D120** per-template settings shape / W24 worked example — not started

## Next

Calibrate **D118** residuals (or D120 if calibration rewrites again). Do not
start D119 or W25 from this close.
