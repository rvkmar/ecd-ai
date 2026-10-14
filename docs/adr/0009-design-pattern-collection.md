# ADR 0009 — Design Patterns are a top-level collection with a reduced lifecycle

**Status:** Accepted (D131 / W27 G9)
**Date:** 2026-10-14
**Deciders:** ecd-claude build

## Context

PADI design patterns are the argument a designer selects from: Title, Summary,
Rationale, Focal KSAs, Additional KSAs, Potential Observations, Potential Work
Products, Potential Rubrics, Characteristic Features, and Variable Features.

A pattern spans Student, Evidence, and Task at once, and one pattern can seed
many models. It cannot be a field on the Competency Model. `curricularPolicies`
is already a separate collection for the same class of reason.

The app's usual status machine (`draft → reviewed → confirmed → operational`)
treats `operational` as "may be delivered to a student." A design pattern
authorises no delivery. Forcing that word onto this entity would make a
confirmed argument look like a live assessment.

`collectionSurfaceGuard` fails if `schema.designPatterns` exists without a
mounted route and a role entry. The schema and its HTTP surface are one unit.

## Decision

**Collection.** `designPatterns` is a top-level collection. The storage
adapter's trailing-s singularizer yields `designPattern`. It is not nested
on a Competency Model.

**Attributes.** The record carries the PADI set under these fields:

| PADI attribute | Field |
|---|---|
| Title | `name` |
| Summary | `summary` |
| Rationale | `rationale` |
| Focal KSAs | `focalKsas[]` |
| Additional KSAs | `additionalKsas[]` |
| Potential Observations | `potentialObservations[]` |
| Potential Work Products | `potentialWorkProducts[]` |
| Potential Rubrics | `potentialRubrics[]` |
| Characteristic Features | `characteristicFeatures[]` |
| Variable Features | `variableFeatures[]` |

Each menu entry is `{ label }`. D134 requires a present library row to cite
a real object: `workProductId` (not a free `workProductType` string),
`rubricId`, `taskModelVariableId`. Potential Observations may copy an
existing observable id; Characteristic Features stay labelled possibilities.
Empty menus remain allowed. Rows are possibilities, not commitments. This
ADR does not seed models (W28).

**Rationale.** An empty Rationale is refused when the pattern is confirmed
or validated strictly. A draft may omit it so a later wizard step can
persist an unfinished record. Confirming a pattern with a blank Rationale
is refused: the Rationale is why the pattern exists. Summary is required
on the same confirm/strict path. Title (`name`) is required on every write.

**Lifecycle.** Reduced set: `draft` | `confirmed`. There is no `reviewed`,
`operational`, `suspended`, or `archived` on this entity.

| Status | Meaning |
|---|---|
| `draft` | The argument is being written. It delivers nothing, authorises nothing, and must not be offered for seeding. |
| `confirmed` | The argument may be referenced by later seeding (W28). It still authorises no student delivery. `confirmed` is not `operational`. |

`operational` is an invalid status. Summary is required to confirm. Menu
arrays may be empty. A present library row must cite a real object (D134).

**Access.** Admin authors. District may read. No wizard in D131.

## Consequences

- W28 can point at a confirmed pattern. It must not treat `confirmed` as permission to deliver a session.
- D136: a template may cite `designPatternId`. The link is optional. Confirming a template does not require a pattern, and a pattern does not own the template. Many templates may cite one pattern. Deleting a pattern that is still cited is refused.
- D134: present work-product / rubric / TMV rows cite collection ids. Observations and characteristic features stay labelled possibilities. Empty menus remain allowed.
- Additional KSAs on the pattern are not the Task Model `fairnessRisks` cards. Those remain the task-form record until W30.
