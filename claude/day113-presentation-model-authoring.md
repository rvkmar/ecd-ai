# D113 — Presentation Model authoring (W23 G8, first never-compress slice)

**Status: DONE.** Calendar unit **D113** complete 2026-09-21. This is the real
start of Presentation Model authoring. D111/D112 were wizard-shell chrome
(naming collision with the day81 inventory that once labeled W23 = D111–D115
Presentation). `PresentationModelStub` is gone. SessionPlayer still does not
obey the model (later W23 unit; old D115 numbering).

## Premise on contact

HEAD `f44f222` (D112). Delivery > Presentation was `PresentationModelStub.jsx`
(placeholder copy only). No `presentationModels` collection, route, query hook,
or wizard. ItemPresenter already named the three overlay concerns (ordering,
conditional display, accessibility profile) and refused to invent them.

Day81 inventory listed W23 files to create; calendar after D111/D112 puts
**authoring** on D113 alone. Library bake of a pointer and SessionPlayer
obedience stay later.

## Design

Seven-artefact contract plus authoring UI on shared wizard **convention A**
(CM/EM/AM): unconditional step-click, cursor ticks, HTML-disabled Next,
Save/Review/Confirm in `WizardStepContainer`. No convention D.

| Artefact | Where |
|---|---|
| Schema | `schema.presentationModels` + `validateEntity` |
| Vocabulary | `ecdVocabulary.js` §10 |
| Lifecycle | `validatePresentationModelLifecycle` |
| HTTP + RBAC | `presentationModelsRoutes.js`; admin write; district read |
| Query hooks | `src/api/queries/presentationModels.js` |
| Readiness mirror | `presentationModelReadiness.js` + agreement test |
| Authoring UI | list + 5-step wizard replacing the stub |
| ADR | `docs/adr/0008-presentation-library-bake.md` |

**Shape.** Bound to a Task Model (PADI Fig. 7). Overlay fields: `layout`
(itemOrder / grouping / navigation), `conditionalDisplay` (showFeedback /
allowSkip / allowReview / showProgress), `accessibility` (profile / fontScale /
timeMultiplier). Reviewed needs identity + itemOrder + navigation. Confirmed
needs feedback timing + accessibility profile. Operational requires an
instantiable Task Model at the authored version.

**ADR 0008.** Item-level stimulus still bakes per ADR 0003. The Presentation
Model overlay is **not** copied into `compositeLibrary` in this unit. A later
bake, if any, should be a pointer.

## Exit check

| Claim | Executed? |
|---|---|
| Presentation Model authoring is no longer stub-only for D113 paths | **Yes** — Admin Delivery tab mounts `PresentationModelBuilder`; stub file deleted |
| Collection + lifecycle (draft → reviewed → confirmed / archive peers) | **Yes** |
| HTTP + RBAC aligned with assembly/qMatrix | **Yes** — admin author; district read; student/teacher 403 |
| Wizard on shared shell (convention A) | **Yes** |
| Tests: create/edit/promote + stub no longer authoring surface | **Yes** |
| CM/EM/TM/Item wizards still green | **Yes** (full suite) |
| SessionPlayer obedience | **Out of scope** (later W23) |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1894 passed | 9 skipped (1903) — 165 files (~29s)

npm run build
  green (~6.7s); PresentationModelBuilder chunk 18.21 kB (peer of Assembly 18.40 kB)
```

D112 close was **1850 passed / 9 skipped** (161 files). Delta: **+44 tests / +4 files**. New files: `presentationModels.test.js`, `presentationModelsLifecycle.test.js`, `presentationModelReadiness.test.js`, `presentationModelWizard.test.jsx` (25 tests). Remaining +19 are extensions of existing guards (lifecycle, RBAC, collection surface, routeAuth, admin IA). Skips unchanged.

Shared `WizardStepContainer` remains its own production chunk. CM/EM/TM/Item wizards still green.

## Delivered

New files listed in the PR. `PresentationModelStub.jsx` removed.

## Next

Calendar **D114** — not started. Remaining W23: composite-library pointer
(if that is the calendar unit) and SessionPlayer obedience. Do not start W25
or W27 here.
