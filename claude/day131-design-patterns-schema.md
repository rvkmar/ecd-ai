# D131 — designPatterns collection (W27 G9)

**Date:** 2026-10-14
**Tier:** 2, alone
**ADR:** `docs/adr/0009-design-pattern-collection.md`

## What shipped

`designPatterns` is a top-level collection (storage singularizer yields `designPattern`). It carries the PADI attribute set: Title (`name`), Summary, Rationale, Focal KSAs, Additional KSAs, Potential Observations, Potential Work Products, Potential Rubrics, Characteristic Features, Variable Features.

Lifecycle is `draft | confirmed`. `operational` is refused. A confirmed pattern may be referenced by later seeding. It authorises no student delivery.

A draft may omit Summary and Rationale. Confirm, and any strict validation, refuses a blank Rationale and a blank Summary. Menu entries, when present, are `{ label }` objects. Optional reference ids may be stored. Requiring those references is D134.

Admin authors. District may read. Routes: list, get, create, update, confirm, delete, all authenticated. Query hooks and a readiness mirror ship with the collection. `collectionSurfaceGuard` and the status mirror check are green.

## What did not ship

No wizard (D133–D134). No JSON import (D135). No seeding (W28). D132's route and lifecycle work was absorbed here; it is not a second routes unit. W27 is still open: the gate is a pattern authored and confirmed through the wizard, with menus pointing at real objects.

## Verification

Suite **2109 passed / 9 skipped** (199 files). Build green. PsychometricFigure provenance traces in the vitest log are the existing uncaught render errors inside passing tests.

## Next

Re-calibrate before D132. The remaining wizard work is D133 (narrative) and D134 (real object references). Do not start D135 until a pattern can be confirmed from the wizard.
