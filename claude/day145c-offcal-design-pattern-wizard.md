# Off-calendar — Design Pattern authoring on the shared wizard shell

**Not D146.** Not a calendar unit. Not a schema change. The W29 gate stays open.

## Premise on contact

Design Pattern authoring was one long form in `DesignPatternLibraryView`: narrative fields, five menus, relations, template link/unlink, the seed panel, and the descendants report, with the library and neighbourhood beside it. Competency, Evidence, Task, and Item already use `src/components/wizard/`. Item is convention C.

## What changed

The form is nine steps on the shared shell. The rail does not gate: any step opens from any other step. Completion ticks come from the form (`designPatternStepComplete`), not from the cursor. Confirm blockers keep the readiness sentences in the shell banner.

| Step | Contents |
|---|---|
| 1 Identity | Title, summary |
| 2 Rationale | Rationale |
| 3 Focal KSAs | Focal KSAs |
| 4 Additional KSAs | Additional KSAs |
| 5 Potential observations | Menu framing, potential observations |
| 6 Work products & rubrics | Potential work products, potential rubrics |
| 7 Characteristic & variable features | Both feature menus |
| 8 Relations (kind-of) & references | Kind-of / part-of, references |
| 9 Review & confirm | Argument recap, template link/unlink, seed panel (confirmed patterns only, explicit action), descendants report |

Lifecycle stays `draft` | `confirmed`. `hidePromoteActions` removes Save for Review and Lock & Confirm. Create draft (new) / Save (existing) and Confirm sit in `toolbarActions`. `editable` is set so a confirmed pattern stays editable; the server re-validates. Cancel still leaves immediately.

`designPatternPayload`, `formFromRow`, `designPatternReadiness.js`, and the design-pattern routes and payload are unchanged. The library list, neighbourhood graph, and Edit / Delete stay beside the wizard.

## Exit check

| Claim | Status |
|---|---|
| Shared shell, convention C | **Yes** — `WizardSidebar` and `WizardStepContainer` from `@/components/wizard` |
| Real ticks, ungated rail, named confirm banner | **Yes** — `designPatternWizardShell.test.jsx` |
| Create draft / Save / Confirm names kept | **Yes** — d133–d140 assertions unchanged except the step navigation they now need |
| Confirmed pattern stays editable | **Yes** — shell test types the title; screenshot shows no lock notice |
| Seed only on a confirmed pattern, on an explicit action | **Yes** — d137 still sends picked indexes and refuses seed on a draft |
| Not D146 | **Yes** — no Domain Analysis link, no calendar mark |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2247 passed | 9 skipped (2256)
  Test Files 236 passed
  42.79s, exit 0
  Uncaught PsychometricFigure provenance errors printed during the run.
  They are the provenance tests throwing. The run still exited 0.

npm run build
  green (1.12s). Largest JS chunk EvidenceModelBuilder-g0n5MweE.js
  373.86 kB (gzip 82.80 kB). DesignPatternBuilder-rP_aEKsy.js 34.58 kB.
```

Previous off-calendar close was **2240 passed / 9 skipped** (235 files). Delta: **+7 tests / +1 file** (`designPatternWizardShell.test.jsx`). Skips unchanged.

Browser: Admin → Models → Design Patterns, signed in as `admin1` against a local JSON store. Each step was opened from the rail. A confirmed pattern opened on Review with Save and Confirm in the toolbar, the seed panel, template unlink, and no lock notice.

## Calendar

D146 was not marked. This screen has no calendar event.
