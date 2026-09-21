# ADR 0008 — Presentation Model vs composite-library bake

**Status:** Accepted
**Date:** 2026-09-21 (Day 113, W23 G8 first slice)
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
collection bound to a Task Model. It does **not** change the composite-library
builder or SessionPlayer.

## Decision

**Authored and stored on `presentationModels` (this unit):**

- Layout: `itemOrder` (`authored` | `random`), `grouping`, `navigation`
- Conditional display: `showFeedback`, `allowSkip`, `allowReview`, `showProgress`
- Accessibility: `profile`, `fontScale`, `timeMultiplier`
- Binding: `taskModelId` + `taskModelVersion` (PADI task-template home)

**Still baked into `compositeLibrary.items[]` per ADR 0003 (unchanged):**

- Per-item stimulus blocks and interaction params
- Evidence-activation mapping and weights of evidence

**Not baked in D113 (later W23 units):**

- A `presentationModelId` pointer on the compiled package or the session
- SessionPlayer / ItemPresenter reading the overlay

Invalidation: revising a Presentation Model does **not** stale the composite
library. Recalibration still does not stale it (ADR 0003). A later bake, if
any, should be a pointer (`presentationModelId`), not a copy of accessibility
or navigation, so an overlay edit takes effect on the next delivery without
recompiling every package.

## Consequences

- D113 authoring can confirm and lock a Presentation Model without pretending
  the player obeys it.
- Day 24's builder stays on the ADR 0003 boundary.
- The next W23 unit that wires delivery must resolve the overlay live (or bake
  only the id), never copy `accessibility` into `compositeLibrary.items[]`.
