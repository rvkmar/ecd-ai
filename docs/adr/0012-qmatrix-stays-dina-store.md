# ADR 0012 — A Q-matrix stays the DINA store

**Status:** Accepted (D144 / W29)
**Date:** 2026-10-15
**Deciders:** ecd-claude build

## Context

DINA resolves `structureConfig.qMatrixId` against `qMatrixModels`. Those records already carry `competencyModelId`, binary `attributeIds`, and `entries`. `knowledgeTaskRelationships` are `{ label }` and refuse `qMatrixId`. Competency models have no `domainAnalysisId`.

## Decision

`/api/qMatrixModels` remains the store. Migration `007-qmatrix-domain-analysis-link` does not create a Domain Analysis and does not rewrite a Q-matrix id or `competencyModelId`. `domainAnalysisId` is optional and valid only when that analysis already exists. The Admin Diagnostic design tab stays. A saved Domain Analysis can open that tab with its own id so a new matrix names the analysis. Knowledge–task statements are not the cells.

## Consequences

- D145 still walks the chain. This unit does not create a path from a Domain Analysis to a Competency Model.
- D146 still decides perspective inheritance.
