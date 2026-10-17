# D147 — trait diagnostic advisory, sourced and recorded

**Closed 2026-10-17.** Tier 2, alone. The W30 gate is not met. D148 was not started.

## Exit check

| Unit | Exit check | Status |
|---|---|---|
| D147 | Choosing DINA or G-DINA against an effective trait perspective raises the advisory. The text names whether that perspective is the Domain Analysis or a Student Model override. Confirm is still allowed. The save writes an `auditLog` row | **DONE** as that rewritten check. The panel was not opened on `:6060` |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  close re-run: 2264 passed | 9 skipped (2273)
  Test Files 238 passed
  88.74s, exit 0
  Uncaught PsychometricFigure provenance errors printed during the run.
  They are the provenance tests throwing. The run still exited 0.

npm run build
  green (24.46s). Largest JS chunk EvidenceModelBuilder-BTWYXgSV.js
  371.17 kB (gzip 87.42 kB).
```

Product commit `ea1dedf`. Tip matches `main/master` before this close. Close commit follows.

The exit check was the panel test and `d147CoherenceProceed.test.js`. A trait Domain Analysis is named "Declared on Fractions." A differing stored Student Model value is named as an override until rebuild. A stored non-trait value that overrides a trait analysis stays silent. `validateEntity` adds no perspective error. `applySaveAudits` appends `coherence.proceed` when the departure is new, and a later save of the same departure does not append another row.

## What was delivered

The plan said to invent a modelled rule and to cover three mismatches. `DINAConfigPanel` already showed the trait-plus-DINA note and already called it advisory. It read `competencyModel.psychologicalPerspective` directly.

The note now uses the effective perspective: the stored Student Model value when one exists, otherwise the Domain Analysis. The save path in `applySaveAudits` records the proceed. Evidence routes still do not import the audit module.

Sociocultural and process-trace mismatches were not added.

## Half-applied work

None. Confirmation is unchanged. No second perspective field was stored.

## Compression debt

The new wording was not opened on `:6060`. The image there is still behind `ea1dedf`, `a8abc57`, and the 16 October authoring screens. Discharge at the W30 close, or on the next live admin walk. Standing risks still open: D68 mid-flight ingest, the competency-model archive walk, the D115b instantiated-tasks click-through, and the W29 gate.

## Calendar

D147 marked ✅. The 2027-03-19 date was not moved. D148 was not marked. D150 stays never-compress.

## Next

D148, alone. Finish the decision points that do not yet use the reader. Do not add a second badge where D146 already reads. Do not start D149. The W30 gate is the advisory visible at every layer. D147 does not close it.
