# D146 — perspective is read from the Domain Analysis

**Closed 2026-10-17.** Tier 2, alone. The W30 gate is not met. D147 was not started.

## Exit check

| Unit | Exit check | Status |
|---|---|---|
| D146 | The perspective is declared on the Domain Analysis and readable on a Design Pattern, a Student Model, an Evidence Model, and a Task Model. A stored Student Model value that differs is an override, and rebuild copies the analysis again. Asserted by a test | **DONE** as that rewritten check. The live screens on `:6060` were not opened |

The calendar's original line, "no two fields can disagree," was the part that was already false. A Student Model keeps its own field. This close keeps that field as a named override until rebuild. Evidence, Task, and Design Pattern do not grow a second perspective field.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  close re-run: 2256 passed | 9 skipped (2265)
  Test Files 237 passed
  97.22s, exit 0
  Uncaught PsychometricFigure provenance errors printed during the run.
  They are the provenance tests throwing. The run still exited 0.

npm run build
  green (21.31s). Largest JS chunk EvidenceModelBuilder-DOboSlOP.js
  371.57 kB (gzip 87.57 kB).
```

Product commit `a8abc57`. Tip matches `main/master` before this close. Close commit follows.

## What was delivered

The Domain Analysis already held `psychologicalPerspective` (D141). `9e369f5` already copied it onto an empty Student Model and left a stored value until rebuild. That commit is not this close.

What was missing was a read through the rest of the chain. An Evidence Model reads the Student Model of its competency. A Task Model reads the primary Evidence Model. A Design Pattern cites `domainAnalysisId` and reads that analysis. The pattern schema has no `psychologicalPerspective` field. A test names a differing Student Model value as an override and shows rebuild clears it.

The citation was placed on the Identity step of the design-pattern wizard that landed the same morning (`8f64001`). The Domain Analysis workspace (`f0181f7`) was not part of this unit.

## Half-applied work

None. Migration `008` still writes nothing. No perspective was copied onto Evidence, Task, or Design Pattern records.

## Compression debt

The readout was not opened on `:6060`. The image there is still behind this commit and the five authoring screens from 16 October. Discharge at the W30 close, or on the next live admin walk. Standing risks still open: D68 mid-flight ingest, the competency-model archive walk, the D115b instantiated-tasks click-through, and the W29 gate.

## Calendar

D146 marked ✅. The 2027-03-18 date was not moved. D147 was not marked. D150 stays never-compress.

## Next

D147, alone. The coherence advisory, sourced from the Domain Analysis. A trait perspective scored with a diagnostic model raises it, proceeding is allowed, and the departure is recorded. Do not start D148 or D149 in that session. The W30 gate is that advisory, visible at every layer. D146 does not close it.
