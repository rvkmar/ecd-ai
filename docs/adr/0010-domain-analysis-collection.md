# ADR 0010 — Domain Analysis is a top-level collection with a reduced lifecycle

**Status:** Accepted (D141 / W29 G10)
**Date:** 2026-10-15
**Deciders:** ecd-claude build

## Context

PADI Layer 1 is a Domain Analysis: valued work, task features, representational forms, performance outcomes, valued knowledge, knowledge structure, and knowledge–task relationships, plus the psychological perspective the analysis is written from.

Build reference Part 2 withheld this field schema until the collection was built. `schema.js` has no `domainAnalyses` key. Design-pattern menus are Layer 2 and are not these seven entities.

`curricularPolicies` are already the content-standards documents Competency Wizard Step 3 cites. Absorbing them is D143. `qMatrixModels` already exist as the diagnostic grid. Re-homing them is D144. `psychologicalPerspective` is already required on a Competency Model. Inheritance down the chain is D146.

`collectionSurfaceGuard` fails if `schema.domainAnalyses` exists without a mounted route and a role entry. The schema and its HTTP surface are one unit, as they were for design patterns (ADR 0009).

`capitalize()` in `dbAdapter.js` singularizes by stripping a trailing `s`. The collection name `domainAnalyses` therefore persists as the Mongoose model `DomainAnalyse`.

## Decision

**Collection.** `domainAnalyses` is a top-level collection. The storage adapter's model name is `DomainAnalyse`. It is not nested on a Competency Model, a Design Pattern, or a curricular policy.

**Entities.** The seven Layer-1 entities are fields on that one record. Each is an array of `{ label }`. A label is a statement from the analysis. It is not a foreign key.

| PADI entity | Field |
|---|---|
| Valued work | `valuedWork[]` |
| Task features | `taskFeatures[]` |
| Representational forms | `representationalForms[]` |
| Performance outcomes | `performanceOutcomes[]` |
| Valued knowledge | `valuedKnowledge[]` |
| Knowledge structure | `knowledgeStructure[]` |
| Knowledge–task relationships | `knowledgeTaskRelationships[]` |

A row may not carry `curricularPolicyId`, `qMatrixId`, or `competencyModelId`. Valued knowledge is not a curricular policy. A knowledge–task relationship is not a Q-matrix cell. Nothing in this record is copied onto a Competency Model.

**Perspective.** `psychologicalPerspective` uses the existing `PSYCHOLOGICAL_PERSPECTIVE_VALUES` enum. It is declared on this record. Confirming a Domain Analysis does not write that value onto any Competency Model.

**Lifecycle.** `draft` | `confirmed`. There is no `operational`. A Domain Analysis authorises no student delivery.

| Status | Meaning |
|---|---|
| `draft` | The analysis is being recorded. Sections may be empty. It delivers nothing. |
| `confirmed` | All seven sections name at least one statement, and a perspective is declared. It still authorises no student delivery. |

**Access.** Admin authors. District may read. There is no upload card and no correction form in this unit.

## Consequences

- D142 adds bulk intake and a light correction form on this route. It does not invent a second collection.
- D143 migrates `curricularPolicies` into this record. Until then, Step 3 keeps citing `curricularPolicies`.
- D144 re-homes Q-matrices. Until then, `knowledgeTaskRelationships` stay labels.
- D146 decides how the perspective declared here is read downstream. This unit does not inherit it.
