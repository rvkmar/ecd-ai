# D148 — perspective at the model choice and the template binding

**Closed 2026-10-17.** Tier 1, alone. The W30 gate is not met. D149 was not started.

## Exit check

| Unit | Exit check | Status |
|---|---|---|
| D148 | The statistical-model choice and the template's Student Model binding show the effective perspective. A Storybook story shows the inherited state and the override. The four D146 screens are left as they are | **DONE** as that rewritten check. The screens were not opened on `:6060`. Storybook itself was not launched; the same component was rendered for both states in `d148PerspectiveAtDecision.test.jsx` |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  close re-run: 2267 passed | 9 skipped (2276)
  Test Files 239 passed
  96.79s, exit 0
  Uncaught PsychometricFigure provenance errors printed during the run.
  They are the provenance tests throwing. The run still exited 0.

npm run build
  green (19.31s). Largest JS chunk EvidenceModelBuilder-BOK0D7DW.js
  371.31 kB (gzip 87.45 kB).
```

Product commit `8fdf732`. Tip matches `main/master` before this close. Close commit follows.

The selector test shows a Student Model override beside the model cards. The template test stays blank until a Student Model is chosen, then names the Domain Analysis. The readout uses the existing `text-xs text-slate-600` classes.

## What was delivered

The plan said to put the perspective on every wizard, including the Item wizard, and to start with the DINA panel. D146 already showed it on four screens. D147 already made the DINA panel use the reader, and only as a conflict note.

What was missing was the moment of choosing a measurement model, and the moment a template binds a Student Model. Both now use `PerspectiveAtDecision`. An inherited value is named as declared on the Domain Analysis. A differing stored value is named as an override until rebuild. The Item wizard was left out.

## Half-applied work

None. No second readout was added on the four D146 screens.

## Compression debt

The new lines were not opened on `:6060`. The image there is still behind `8fdf732` and the earlier authoring commits. Discharge at the W30 close, or on the next live admin walk. Standing risks still open: D68 mid-flight ingest, the competency-model archive walk, the D115b instantiated-tasks click-through, and the W29 gate.

## Calendar

D148 marked ✅. The 2027-03-22 date was not moved. D149 was not marked. D150 stays never-compress.

## Next

D149, alone. Additional KSAs are still labels on a Design Pattern. Task Model Step 7 is still fairness notes. Do not start D150 in that session. The W30 gate is the advisory visible at every layer. D148 does not close it.
