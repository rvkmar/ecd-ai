# D111 — TaskWizard onto shared wizard shell (never-compress)

**Status: DONE.** Calendar unit **D111** complete 2026-09-21. **Not** Presentation
Model authoring (day81 inventory W23 / G8 naming collision). PresentationModelStub
untouched. D112 (ItemWizard) not started.

## Premise on contact

HEAD `c799ce2` (D110 pin). Day 44 extracted CM/EM onto `src/components/wizard/`
and **deliberately left Task Model off**: TM sidebar is context-driven, gates
the rail (`canNavigateBack = isEditable ? index < currentStep : true`), and
shows per-step readiness amber-dots. A props-only drop-in of the CM/EM shell
would have silently regressed authoring.

**Code at calibration (`c799ce2`):** shared shell = convention A only (ungated
rail, no dots, generic locked notice). TM still owned a private
`WizardSidebar` / `WizardStepContainer` pair (chrome + step router + promote).

**Became:** shared shell grew an explicit **convention B**; TM adapters map
`useTaskModelWizard()` onto those props. Step routing stays in the TM adapter.

## Design (not a TM-only file move)

Two calling conventions, both tested. Preferring this over moving TM files
into `src/components/wizard/` as a fork.

| | Convention A (default) | Convention B (Task Model) |
|---|---|---|
| Callers | CM, EM, AM, Q-matrix | TaskWizard adapters |
| Rail | `onStepClick` always fires; parent gates | `canNavigateTo(index)` disables the button; forward only via Next while editing |
| Readiness | none | `outstandingWork(step, index)` amber-dots |
| Blocked Next/Save/Confirm | HTML-disabled; no named reason | `blockingReason` title + `toastOnBlock` wrap (native-disabled swallows clicks) |
| Locked notice | `This {modelLabel} is confirmed and locked.` | `lockedNotice` (interpolates lifecycle status) |
| Promote | `onSaveAndReview` / `onConfirm` / `onReturnToDraft` | same chrome; adapter wires `handlePromote("reviewed"\|"confirmed"\|"draft")` |

Mapping lives in `taskWizardShellContract.js` so rail labels, which checks
flag which step, Next-only gating, and the named blocking reason cannot drift
from the adapters.

## Exit check

| Claim | Executed? |
|---|---|
| TaskWizard imports/uses shared `src/components/wizard/*` | **Yes** — adapters import `@/components/wizard/WizardSidebar` and `WizardStepContainer`; source-level test |
| Authoring behaviour preserved (gating, readiness, promote/save) | **Yes** — convention B props + adapter tests |
| Tests prove no silent UX/lifecycle regression | **Yes** — would fail if dots, Next-only rail, named toasts, or promote targets change |
| CM/EM wizards still green | **Yes** — convention A tests unchanged and passing; AM/Q-matrix still omit B props |
| D112 / Presentation Model out of scope | **Yes** — not touched |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1821 passed | 9 skipped (1830) — 160 files (~27s)

npm run build
  green (~7s)
```

W22 close was **1794 passed / 9 skipped** (159 files). Delta: **+27 tests / +1
file**, all D111 (`wizardShell.test.jsx` convention B + new
`taskWizardShell.test.jsx`). Skips unchanged.

Shared chrome is now its own production chunks (`WizardSidebar-*.js`,
`WizardStepContainer-*.js`) consumed by Task/Competency/Evidence/Assembly
builders.

## Delivered

| Area | Change |
|---|---|
| `src/components/wizard/WizardSidebar.jsx` | Optional `canNavigateTo`, `outstandingWork` |
| `src/components/wizard/WizardStepContainer.jsx` | Optional `blockingReason`, `toastOnBlock`, `lockedNotice` |
| `src/components/taskModels/TaskWizard/taskWizardShellContract.js` | TM → shared mapping |
| `src/components/taskModels/TaskWizard/WizardSidebar.jsx` | Thin convention B adapter |
| `src/components/taskModels/TaskWizard/WizardStepContainer.jsx` | Step router + convention B adapter |
| Tests | `wizardShell.test.jsx` extended; `taskWizardShell.test.jsx` new |

## Next

Calendar **D112** — ItemWizard onto shared shell (never-compress). **Update
(2026-09-21):** D112 shipped — `claude/day112-itemwizard-shared-shell.md`. Next: D113.
Do not conflate with Presentation Model authoring (still stub-only).
