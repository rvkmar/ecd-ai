# D149 — Additional KSA relationship

**Closed 2026-10-17.** Tier 2, alone. The W30 gate is not met. D150 was not started.

## Exit check

| Unit | Exit check | Status |
|---|---|---|
| D149 | An Additional KSA is a label plus a relationship. Confirm refuses a missing relationship. A label that matches a Focal KSA on another pattern raises an advisory and still saves | **DONE** as that rewritten check. The Additional KSAs step was not opened on `:6060` |

The confirm refusal is `d149AdditionalKsa.test.js` (strict confirm fails; a non-strict draft with a label and no relationship still validates) and the builder test (Confirm stays disabled until a relationship is chosen). The advisory is the same schema test plus the builder test: the note names the other pattern, Save stays enabled, and validation does not fail.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  close re-run on 3039c0e: 2272 passed | 9 skipped (2281)
  Test Files 241 passed
  114.60s, exit 0
  Uncaught PsychometricFigure provenance errors printed during the run.
  They are the provenance tests throwing. The run still exited 0.

npm run build
  green (19.89s). Largest JS chunk EvidenceModelBuilder-C_ZGRGMn.js
  371.31 kB (gzip 87.45 kB).
```

Product commit `bcfc71a`. After that commit, dependency bumps `#63` through `#77` landed on `master` and the tip before this close is `3039c0e`, matching `main/master`. The close re-run is that tip. Close commit follows.

## What was delivered

The plan said to replace Task Model Step 7 risk cards with Additional KSA records, and to warn when one is another competency's Focal KSA. Additional KSAs were already `{ label }` rows on the Design Pattern. Competencies have no Focal KSA field. `seedFromDesignPattern` does not copy the list. Step 7 is the Evidence Model's fairness notes.

The list stayed on the Design Pattern. Each entry can be `required_but_not_measured` or `potentially_confounding`. Confirm requires the relationship when the label is present. A draft save does not. The advisory compares the trimmed, case-insensitive label with a Focal KSA on a different pattern, names that pattern, and does not block. The same pattern's own Focal KSAs are skipped. The list is not copied onto the Task Model.

## Half-applied work

None. Step 7 fairness notes were not replaced. Seeding was not changed.

## Compression debt

The new relationship control and the overlap note were not opened on `:6060`. The image there is still behind `bcfc71a`. Discharge at the W30 close, or on the next live admin walk. Standing risks still open: D68 mid-flight ingest, the competency-model archive walk, the D115b instantiated-tasks click-through, and the W29 gate. D146–D148 live readouts are still unpaid for the same reason.

## Calendar

D149 marked ✅. The 2027-03-23 date was not moved. D150 was not marked. D150 stays never-compress.

## Next

D150, alone, and never-compress. It is the adversarial review of W27–W30. Do not start it in the same session as another schema unit. The W30 gate is still the advisory visible at every layer. D149 does not close it. The W29 gate stays open: a Domain Analysis still does not produce a Competency Model.
