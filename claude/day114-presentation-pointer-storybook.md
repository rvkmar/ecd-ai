# D114 — Presentation Model delivery pointer + Storybook (W23)

**Status: DONE.** Calendar unit **D114** complete 2026-09-21.
**Premise rewritten on contact** — calendar said “build the authoring wizard”;
that shipped in D113. This unit became ADR 0008’s pointer bake + live resolve
+ residual Storybook. SessionPlayer obedience remains **D115** (never-compress).

## Premise on contact

HEAD `efc7d67` (W23 session close). Wizard + accessibility authoring already
live. No `presentationModelId` on packages. No Storybook. ItemPresenter still
refused to invent overlay fields.

## Exit check

| Claim | Executed? |
|---|---|
| Delivery resolves which Presentation Model applies without baking overlay into `compositeLibrary.items[]` | **Yes** — package stamps `presentationModelId` only; `validateEntity` refuses baked layout/a11y; live resolve re-reads authored record |
| Storybook story for Presentation wizard exists (both themes via toolbar) | **Yes** — `PresentationModelWizard.stories.jsx`; preview theme toolbar |
| Accessibility profile still authored and persisted | **Yes** — live-resolve test shows confirmed edit visible on next resolve without recompile; wizard Step 4 unchanged |
| No new shell conventions | **Yes** |
| SessionPlayer obeys overlay | **Out of scope** (D115) |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1905 passed | 9 skipped (1914) — 166 files

npm run build
  green (~13.5s)
```

D113 close was **1894 passed / 9 skipped**. Delta ≈ **+11 tests**. Skips unchanged.

## Delivered

| Area | Change |
|---|---|
| `server/delivery/presentationModelResolution.js` | Select + live resolve |
| `server/compositeLibrary/builder.js` | Stamp `presentationModelId` pointer |
| `src/utils/schema.js` | Field + refuse baked overlay keys |
| `server/routes/sessionRoutes.js` | `/next-task` attaches `presentation` overlay |
| Storybook | `Presentation Model/Wizard` stories |
| ADR 0008 | Pointer bake marked done; D115 still open |

## Next

Calendar **D115** — SessionPlayer obeys the Presentation Model; W23 gate
(never-compress). Do not start on a thin budget.
