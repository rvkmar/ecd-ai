# Off-calendar — five authoring screens after the 16 Oct walk

**Closed 2026-10-16.** Not a schema unit. Not D146. The W29 gate stays open.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| D145 | Walk the surfaces that exist. Write each break. The unpatterned Student Model path still opens. Do not add the missing links | **DONE** as a walk on 2026-10-15 (`claude/day145-chain-walk.md`, `b273d3f`). Calendar was still unmarked; this close marked it. The date stayed 2027-03-17 |
| Five screens | Wizard fields save the text in the box. A rubric can start from a subject and a topic. An empty form-only library shows a finished example. Libraries and Results are their own menus. A Domain Analysis shows the copied curriculum, and an empty Curricular policies screen opens the form | **DONE** in source and in the component tests. **Not on `:6060`.** That screen is still the previous image |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  close re-run: 2240 passed | 9 skipped (2249)
  Test Files 235 passed
  96.27s, exit 0
  Uncaught PsychometricFigure provenance errors printed during the run.
  They are the provenance tests throwing. The run still exited 0.

npm run build
  green (21.71s). Largest JS chunk EvidenceModelBuilder-CBE0lNo2.js
  371.25 kB (gzip 87.43 kB). CategoricalChart-Zy3gpQQu.js 318.05 kB.
```

Product tip `e306279` matches `main/master` before this close commit. Close commit follows.

The five product commits, already on `main/master`:

- `de9fe77` Student Model fields save the text in the box
- `f82b21a` rubric draft from a subject and a topic
- `09fef3c` worked example on an empty form-only screen
- `079d04b` Libraries and Results menus; Parameter estimation under Delivery
- `e306279` copied curriculum on the Domain Analysis; policy form on an empty list

## What was delivered

The 16 Oct walk asked for wizard fixes, a RubiStar-style rubric, examples on the form-only screens, menu grouping, and the copied curriculum on the Domain Analysis. That is what these five commits are. They do not add a foreign key from a Domain Analysis to a Design Pattern or a Competency Model.

The Student Model name, description, domain, strand, and facet commit the value in the box. Step 1 stops asking for a Domain Analysis once a perspective or an analysis id is stored. Step 7 prints `row.label` instead of `[object Object]`.

A rubric draft writes four levels, Beginning through Exemplary, and copies each sentence into both the descriptor and the exemplar so a generated draft can be confirmed. Subject and topic are not stored.

Work Products, Task Model Variables, Templates, and an empty Q-matrix list show one finished example, and hide it once a record exists. A Design Pattern shows one example line per blank section. Domain Analysis section hints were left as they were.

Admin menus: Libraries holds Work Products, Rubrics, and Task Model Variables. Results holds Psychometrics and Reports. Parameter estimation moved to Delivery. `?tab=` ids were not renamed. Assembly and Templates stayed under Models.

A Domain Analysis that already has `contentStandards` shows that goal tree as read-only. Saving the analysis still writes only the seven statement sections. An empty Curricular policies list opens the form. Saving a policy still creates the `dacs` plus policy-id shell.

## Half-applied work

None in the five commits. Each screen is in the tree that `e306279` pushed. The live nginx image on `:6060` was not rebuilt, so an author on that URL does not see the five screens yet. That is a deploy gap, not a half-written scoring path.

## Compression debt

None new. Standing risks, still open:

- D68 live mid-flight ingest on `:6060`
- Competency-model archive live walk on `:6060`
- D115b instantiated-tasks click-through
- W29 gate: an author still cannot start at a Domain Analysis and reach a Competency Model

## Calendar

D145 marked ✅. The 2027-03-17 date was not moved. D146 was not marked. The five screens have no calendar event.

## Next

D146, alone, after a calibration. Do not treat `9e369f5` (perspective copied onto a Student Model) as the D146 close. The W30 gate is an advisory sourced from the Domain Analysis and visible at every layer. That was not checked here.
