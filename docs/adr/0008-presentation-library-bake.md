# ADR 0008 — Presentation Model vs composite-library bake

**Status:** Accepted (pointer bake completed D114)
**Date:** 2026-09-21 (Day 113 authoring; Day 114 pointer)
**Deciders:** ecd-claude build
**Depends on:** [ADR 0003 — Composite library denormalisation boundary](0003-composite-library-denormalisation-boundary.md)

## Context

PADI TR9 Fig. 7 places Materials & Presentation on the task template. Delivery
Fig. 12 then has a Presentation *process* that shows the examinee what the
composite library compiled. Until D113 the Admin Delivery tab was a stub
(`PresentationModelStub`) and `ItemPresenter` explicitly refused to invent
ordering, conditional display, or an accessibility profile locally.

ADR 0003 already bakes **item-level** presentation material (`item.stimulus`)
and interaction params into `compositeLibrary.items[]`. That is not the
Presentation Model. Baking the wrong thing would either:

- duplicate live overlay facts (navigation, a11y profile) into every package
  so a confirmed Presentation Model edit silently does nothing until recompile,
  or
- leave authoring as a stub while SessionPlayer keeps hard-coding chrome.

D113 authors `presentationModels` as a first-class lifecycle-governed
collection bound to a Task Model. D114 stamps a `presentationModelId`
pointer on the compiled package and resolves the overlay live at delivery
(`/next-task`). SessionPlayer still does not obey the overlay (D115).

## Decision

**Authored and stored on `presentationModels` (D113):**

- Layout: `itemOrder` (`authored` | `random`), `grouping`, `navigation`
- Conditional display: `showFeedback`, `allowSkip`, `allowReview`, `showProgress`
- Accessibility: `profile`, `fontScale`, `timeMultiplier`
- Binding: `taskModelId` + `taskModelVersion` (PADI task-template home)

**Still baked into `compositeLibrary.items[]` per ADR 0003 (unchanged):**

- Per-item stimulus blocks and interaction params
- Evidence-activation mapping and weights of evidence

**Baked as pointer only (D114):**

- `compositeLibrary.presentationModelId` — id of a linkable Presentation
  Model for the same Task Model version. Selected at compile
  (operational > confirmed > suspended). Never copies overlay fields.
- Live resolve: `server/delivery/presentationModelResolution.js` re-reads
  the authored record; a confirmed accessibility edit takes effect on the
  next `/next-task` without recompile. Revising a Presentation Model does
  **not** stale the composite library.

**Still not done (D115):**

- SessionPlayer / ItemPresenter reading and obeying the overlay in the UI

## Consequences

- Delivery can know which Presentation Model applies before the player
  learns to obey it.
- Overlay edits do not require package rebuild.
- `validateEntity("compositeLibrary")` refuses baked `layout` /
  `conditionalDisplay` / `accessibility` on the package.
