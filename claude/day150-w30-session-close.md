# W30 session close — D150

**Closed 2026-10-17.** Tier 3, alone, never-compress. The restated W30 gate holds. W29 stays open.

## Exit check (executed)

| Unit | Exit check | Executed? |
|---|---|---|
| D150 | Ranked findings. Every P0 fixed the same day with a regression test. The handoff says whether the trait/diagnostic advisory holds. | **Yes** — `claude/day150-adversarial-w30.md`. No P0, so nothing was fixed under that clause. |

The advisory fires for `dina` and `gdina` when the effective perspective is `trait`. Confirm is not blocked. Information processing or sociocultural with DINA, and trait with IRT, stay silent. On `:6060` the DINA configuration panel for **Part naming evidence** showed the advisory and named Fractions before that model was confirmed as Rasch 1PL.

Re-run at close, on the tree that is `c3ac300`:

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2277 passed | 9 skipped (2286) — 242 files (101.46s)
  Uncaught PsychometricFigure provenance errors printed during the run.
  They are the provenance tests throwing. The run still exited 0.

npm run build
  green (19.17s). Largest JS chunk EvidenceModelBuilder-DrrP3SVN.js
  371.35 kB (gzip 87.47 kB).
```

## Half-applied work

None in the review. The P1 is recorded and not applied: `DELETE /api/designPatterns/:id` still ignores `seededFrom.designPatternId`.

The same day, after the review, dichotomous `equalsCorrect` rules were taught to resolve against the item key (`c3ac300`). That change is complete in the repo and covered by `evidenceIdentification.test.js`. The running `ecd-node` container received those files by copy. The node image was not rebuilt, so a recreate without a rebuild drops the live copy until the image is built from `c3ac300`.

## What the plan got wrong

The calendar asked one review to close W27–W30. W27 and W28 were already closed. W29 cannot close: a Domain Analysis still does not produce a Competency Model. The action-plan W30 gate is the trait/diagnostic advisory, not the phrase “visible at every layer.” The item wizard was left out of that readout on purpose in D148.

## What remains

- **P1.** Deleting a confirmed Design Pattern does not look at seeded Evidence or Task Models. Descendants then 404. Scoring is unchanged.
- **P2.** A relation that still points at the deleted pattern fails the next save. An inactive DINA model can disagree between the audit and the panel. Renaming a Domain Analysis can append `coherence.proceed`.
- **W29.** Still open.
- Standing risks: D68 mid-flight ingest, the competency-model archive walk, the D115b instantiated-tasks click-through.
- Attribute profiles on the plant-part evidence model stay empty. That job binds only to DINA or G-DINA, and the operational model is Rasch.

## Tip

Product through `c3ac300` ≡ `main/master` before this close commit. The remote is named `main`, tracking `master`.

## Calendar

D150 and the W30 block event were marked ✅. Dates were not moved. W29 was not marked.

## Next

Re-calibrate before **D151**. A task spec cannot be created except by generation, and the template-change policy has to be recorded and enforced.
