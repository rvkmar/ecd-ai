# ADR 0003b — Task specs go stale when their template changes

**Status:** Accepted
**Date:** 2026-10-28 (Day 151, Week 31)
**Depends on:** [ADR 0003](0003-composite-library-denormalisation-boundary.md)

## Context

D151 adds `taskSpecs`: PADI's final plan for an individual task, generated from a template with TMV values fixed. A spec is derived. An authored create would become a second surface that drifts from the template.

When the source template later changes, three options exist: regenerate the family, mark existing specs stale, or freeze them.

ADR 0003's boundary is the reasoning: structural facts compile; live pointers stay live; a structural change invalidates the compiled record. A confirmed spec may already have been delivered. Auto-regenerating would rewrite a plan that sessions may have used. Freezing would leave the family lying about the current template.

## Decision

**Mark stale.** A successful PUT or confirm of a template sets `stale: true` on every `taskSpecs` row whose `templateId` matches. The assignment is not rewritten. Regeneration is D152.

`POST /api/taskSpecs` is refused. The only insert is `insertGeneratedTaskSpec`, which stamps `templateId`, `tmvAssignment`, `stale: false`, and `generatedAt`.

## Consequences

- D152's generator is the only way a family appears.
- Delivery must not treat a stale spec as current; that check waits until specs are delivered (D155).
- Recalibration of an Evidence Model does not stale specs — parameters are a live pointer, same as ADR 0003.
