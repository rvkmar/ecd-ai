# ADR 0011 — A curricular policy is content standards on a Domain Analysis

**Status:** Accepted (D143 / W29 G10)
**Date:** 2026-10-15
**Deciders:** ecd-claude build

## Context

`curricularPolicies` are curriculum documents: curricular goals, competencies, and learning outcomes. Competency Wizard Step 3 stores `constructFramework.policyId` and a snapshot of the selected goals. ADR 0010 made `valuedKnowledge` an array of `{ label }` and refused `curricularPolicyId` on those rows.

Flattening a policy into those labels would drop the goal tree. Deleting the collection would break Step 3 and Settings while they still read `/api/curricularPolicies`.

## Decision

Each curricular policy is copied onto a Domain Analysis as `contentStandards`, keeping its id and its goal tree. `valuedKnowledge` is not filled from that tree. The collection stays. Reads of `/api/curricularPolicies` prefer the Domain Analysis copy, so Step 3 resolves the same `policyId` through the analysis. A dry-run of migration `006-domain-analysis-content-standards` writes nothing. The Settings curricular surface stays until nothing reads that route.

## Consequences

- D144 still re-homes Q-matrices. Knowledge–task relationships stay labels.
- D146 still decides perspective inheritance. This unit does not copy a perspective onto a competency model.
- An empty draft created only to hold content standards can be removed when that policy is deleted. An analysis that already has statements keeps those statements.
