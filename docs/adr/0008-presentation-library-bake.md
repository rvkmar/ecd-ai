# ADR 0008 — Presentation Model vs composite-library bake

**Status:** Accepted (pointer D114; SessionPlayer obedience D115)
**Date:** 2026-09-21 (Day 113–115, W23 G8)
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

## Decision

**Authored on `presentationModels` (D113):** layout, conditionalDisplay,
accessibility, Task Model binding.

**Still baked into `compositeLibrary.items[]` (ADR 0003):** item stimulus,
interaction, evidence activation — never accessibility/navigation.

**Pointer + live resolve (D114):** `compositeLibrary.presentationModelId`.
`/next-task` attaches a live overlay. Delivery live-select prefers
operational > confirmed so switching which PM is operational changes the
overlay without touching item content.

**SessionPlayer obedience (D115):** `presentationChrome()` drives progress /
skip chrome and accessibility profile classes on SessionPlayer +
ItemPresenter. Stimulus text still comes only from the item.

## Consequences

- W23 gate: changing a Presentation Model changes what an examinee sees
  without touching item content (proven by two-overlay / one-item tests).
- Overlay edits and operational flips do not require package rebuild.
- `validateEntity("compositeLibrary")` still refuses baked overlay fields.
