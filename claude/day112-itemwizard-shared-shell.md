# D112 — ItemWizard onto shared wizard shell (never-compress)

**Status: DONE.** Calendar unit **D112** complete 2026-09-21. **Not** Presentation
Model authoring (day81 inventory W23 / G8 naming collision). PresentationModelStub
untouched. D113+ not started.

## Premise on contact

HEAD `daac216` (D111). Day 44 extracted CM/EM onto `src/components/wizard/` and
left Task Model and Item off. D111 folded Task Model in as **convention B**
(gated rail, amber-dots, named blocking-reason toast, Save/Confirm promote).
Item still owned inline private chrome inside `ItemWizard.jsx` (custom sidebar
+ sticky top bar + lifecycle buttons + step router). A naive props-only drop-in
of convention A — or a reuse of B without extension — would silently regress
Item authoring.

**Code at calibration (`daac216`):** shared shell = convention A + B. ItemWizard
chrome was a single 490-line `ItemWizard.jsx` (sidebar ticks from
`stepCompletion`, Next gated on `isStepValid` / `stepBlockers`, banner of named
blockers, lifecycle toolbar for reject / activate / suspend / reactivate /
archive / clone, confirm on Step 8).

**Became:** shared shell grew an explicit **convention C**; Item adapters map
`useItemWizard()` onto those props. Step routing stays in the Item adapter.

## Design (not an Item-only file move)

Three calling conventions, all tested. Preferring this over moving Item files
into `src/components/wizard/` as a fork.

| | Convention A (default) | Convention B (Task Model) | Convention C (Item) |
|---|---|---|---|
| Callers | CM, EM, AM, Q-matrix | TaskWizard adapters | ItemWizard adapters |
| Rail | `onStepClick` always fires; parent gates | `canNavigateTo(index)` disables the button; forward only via Next while editing | Reuse `canNavigateTo`; current step stays clickable (`index <= currentStep`) |
| Ticks | cursor (`index < current`) | cursor | `isStepComplete(step, index)` — real readiness / furthest-step, not cursor |
| Readiness dots | none | `outstandingWork` amber-dots | none (ticks, not dots) |
| Blocked Next | HTML-disabled; no named reason | `blockingReason` title + `toastOnBlock` | `blockersBanner` (named copy) + title; **no toast** |
| Promote | `onSaveAndReview` / `onConfirm` / `onReturnToDraft` | same chrome; adapter wires `handlePromote` | `hidePromoteActions`; confirm lives on Step 8; extra transitions in `toolbarActions` |
| Locked notice | `This {modelLabel} is confirmed and locked.` | `lockedNotice` | `lockedNotice` interpolates item status |
| Cancel | "Cancel" (or Evidence OK) | "Cancel" | `cancelLabel` "Close" |

Mapping lives in `itemWizardShellContract.js` so rail labels, completion ticks,
Next-only-forward (plus current), named blocker copy, and locked-notice text
cannot drift from the adapters.

## Exit check

| Claim | Executed? |
|---|---|
| ItemWizard imports/uses shared `src/components/wizard/*` | **Yes** — adapters import `@/components/wizard/WizardSidebar` and `WizardStepContainer`; source-level test |
| Authoring behaviour preserved (gating, blockers, ticks, lifecycle, lock/clone) | **Yes** — convention C props + adapter tests |
| Tests prove no silent UX/lifecycle regression | **Yes** — would fail if Next gating, banner copy, cursor-vs-real ticks, or reject/activate/suspend/reactivate/archive/clone change |
| CM/EM/AM/Q-matrix + TaskWizard still green | **Yes** — convention A/B tests unchanged and passing |
| D113 / Presentation Model out of scope | **Yes** — not touched |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1850 passed | 9 skipped (1859) — 161 files (~28s)

npm run build
  green (~6.5s)
```

D111 close was **1821 passed / 9 skipped** (160 files). Delta: **+29 tests / +1
file**, all D112 (`wizardShell.test.jsx` convention C + new
`itemWizardShell.test.jsx`). Skips unchanged.

Shared `WizardStepContainer` remains its own production chunk, consumed by
Item/Task/Competency/Evidence/Assembly builders.

## Delivered

| Area | Change |
|---|---|
| `src/components/wizard/WizardSidebar.jsx` | Optional `isStepComplete`, `statusLabel`, active `step.blurb` |
| `src/components/wizard/WizardStepContainer.jsx` | Optional `blockersBanner`, `hidePromoteActions`, `toolbarActions`, `cancelLabel`, `editable`, `stepTitle` |
| `src/components/itemBank/ItemWizard/itemWizardShellContract.js` | Item → shared mapping |
| `src/components/itemBank/ItemWizard/WizardSidebar.jsx` | Thin convention C adapter |
| `src/components/itemBank/ItemWizard/WizardStepContainer.jsx` | Step router + convention C adapter + lifecycle toolbar |
| `src/components/itemBank/ItemWizard/ItemWizard.jsx` | Orchestration only (provider + adapters) |
| Tests | `wizardShell.test.jsx` extended; `itemWizardShell.test.jsx` new |

## Next

Calendar **D113** — not started. Do not conflate with leftover Item chrome
(discharged). Presentation Model authoring remains stub-only (W23 G8 / day81
inventory).
