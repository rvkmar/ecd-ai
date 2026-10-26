# Off-calendar: Rubrics parity with the model screens

**Not D146.** Not a calendar unit. Not a schema unit. The W29 gate stays open: a Domain Analysis still does not produce a Competency Model. Work Products and Task Model Variables were not restyled.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Shell | Admin, Libraries, Rubrics has three buttons in the same order as Work Products: Dashboard, Rubric Structure, Manage Rubrics. Dashboard is the default. `?tab=rubrics` still opens this leaf. `focus` or `id` opens Manage with that record loaded. No new route | **DONE** |
| Dashboard | Total, Draft, Confirmed, Ready, Not ready, In use, and Unused. Ready follows `rubricReadiness(record, { strict: true })`. In use means an evidence model cites the id on `evaluationProcedures[].rubricId` or on `phases[].rubricId`, or a design pattern lists it under `potentialRubrics`. Counts by criteria, counts by levels, and exemplar coverage. Donuts are Draft vs confirmed, Ready vs not ready, In use vs unused, and Exemplar coverage | **DONE** |
| Structure | Searchable sortable table, plus Table View / Ingredients View through `ModelIngredientsCard`. Columns are ID, Name, Status, Readiness, Criteria, Levels, Evidence models, Design patterns, and Updated. Ingredient groups are Description, Criteria (level labels on each criterion), Exemplars, Evidence models (procedure id and phase label), and Design patterns | **DONE** |
| Manage | Same list console as Manage Templates: New, search, lifecycle status (draft / confirmed), readiness, expandable cards. New, Edit, and Duplicate open the existing form. Duplicate prefills a new draft named `<name> (copy)`, then `<name> (copy 2)` when that name is already taken, compared case-insensitively. Delete confirms, then calls the existing delete route, and stays disabled while the rubric is in use. Cancel and Back to list return to the cards. Confirm stays on the edit form and still posts to `POST /:id/confirm` | **DONE** |
| Guards | Names stay unique. A confirmed rubric still needs at least one exemplar, enforced by the existing confirm route and by `rubricReadiness`. The criteria-by-levels grid and "Write a first draft" (`rubricStarter.js`) stay on the form. Edit shows the evidence models that cite the rubric on a procedure, the evidence models that cite it on a phase, and the design patterns that list it. The starter test still renders `RubricLibraryView` directly | **DONE** |
| Untouched | Payload shape, readiness rules, routes, and the server. Competency, Evidence, Task, Design Pattern, Domain Analysis, Templates, Assembly Model, Diagnostic Design, Presentation Model, Work Products, and Task Model Variables stay on their own screens | **DONE** |

## What was delivered

The default export of `RubricBuilder` is the tab shell. The create and edit form stays in that file, inside `RubricLibraryView`. The starter test still renders that view directly. Manage renders `ModelManageList`, and New, Edit, and Duplicate replace the list with the form. `onDismiss` returns to the cards.

There is no clone route. Duplicate copies the name (with " (copy)"), the description, and the criteria-by-levels grid, including exemplars, into the create form. It does not copy the id. The create payload status is draft, including when the source record is confirmed.

`ModelTabShell` and `ModelManageList` are the shared pieces from the earlier passes. Rubrics is another caller. Rubrics keep the lifecycle status filter (draft / confirmed) and the lifecycle badge. Readiness is the existing `readinessOf` select. Work Products and Task Model Variables still pass `facet` instead of that status filter.

Delete on the card is stricter than the route. The route returns 409 only when an evidence model cites `evaluationProcedures[].rubricId` (`evidenceModelsConsumingRubric`). The button is also disabled when the only citation is `phases[].rubricId`, or when only a design pattern lists the id, so that citation is not dropped by a delete the route would allow.

Confirm saves the form, then posts `POST /:id/confirm`. A confirmed record does not show Confirm. The grid and the subject/topic starter are unchanged. Subject and topic are still not stored.

## Fields

A rubric stores a name, a description, a status (`draft` or `confirmed`), and dimensions. Each dimension has an id, a name, levels, `activatesAt`, and exemplars. Names are unique case-insensitively, which is why the copy name walks `(copy)`, `(copy 2)`, and so on.

- Ready means the record passes `rubricReadiness` with `strict: true`. A confirmed rubric with no exemplar is not ready. A draft with criteria and levels can be ready with no exemplar.
- In use means at least one evidence model cites the id on a procedure or a phase, or a design pattern lists it. Unused is the rest. `seededFrom` is not a citation.
- Counts by criteria are 1, 2, 3, and 4 or more. No criteria is shown only when that count is above zero.
- Counts by levels are 2 and 4, which are the sample shape and the starter shape. No levels and Other level counts are shown only when that count is above zero.
- Exemplar coverage is whether `exemplarCount` is at least 1.
- The card badge is the lifecycle status. The readiness chip is Ready or Not ready. The meta line is the criteria-by-levels shape, then evidence models and design patterns.
- Ingredient subtitle is the status word, the readiness word, the criterion count, and the level count.
- The leaf id stays `rubrics`. `?tab=rubrics` with no focus and no id stays on Dashboard.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2401 passed | 9 skipped (2410)
  Test Files 274 passed
  71.98s, exit 0

npm run build
  green (3.79s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 373.92 kB (gzip 82.87 kB).
  RubricBuilder 33.15 kB (gzip 9.63 kB).
  TaskModelVariableBuilder 27.43 kB (gzip 8.11 kB).
  WorkProductBuilder 21.14 kB (gzip 6.58 kB).

npm audit --audit-level=high
  found 0 vulnerabilities
```

Previous close on this tree was Task Model Variables parity, **2389 passed / 9 skipped**. Delta: **+12 tests / +3 files** (`rubricDashboard.test.jsx`, `rubricStructure.test.jsx`, `rubricTabs.test.jsx`). The starter test file was left in place and passed in the same run. Skips unchanged.

This VM ran the suite on Node 22. CI installs Node 24. `npm ci` printed an engine warning and still installed.

## Browser

Local Vite `http://127.0.0.1:5173` and the API on `:3000`, `DB_MODE=json`, `ECD_DB_FILE` pointing at a JSON file, signed in as `admin1`. Settings, Data, Upload. "Keep original ids and statuses" was on. The file was `samples/ecd-sample-complete.zip`.

Preview: 44 created, 0 failed, including rubrics 2 created. Import finished: "Imported 44 record(s)". The store kept `rub-function` (confirmed) and `rub-equiv` (draft).

Dashboard: Total 2, Draft 1, Confirmed 1, Ready 2, Not ready 0, In use 2, Unused 0. Counts by criteria: 1 criterion 2, and 0 for 2, 3, and 4 or more. Counts by levels: 2 levels 2, 4 levels 0. Exemplar coverage: With exemplars 2, Without exemplars 0. Donuts were 50 percent draft and 50 percent confirmed, and 100 percent ready, in use, and with exemplars.

Structure listed Plant function judgement (`rub-function`, confirmed, Ready, 1 criterion, 2 levels, 1 evidence model, 1 design pattern) and Fraction equivalence judgement (`rub-equiv`, draft, Ready, 1, 2, 1, 1). Ingredients for Plant function judgement showed Criteria (Function match: Wrong job, Right job), Evidence models (Part function evidence, procedure ep-plant-fn and phase 1 on ep-plant-fn), and Design patterns (Explain a labelled diagram). Subtitle `Confirmed • Ready • 1 criterion • 2 levels`.

Manage showed the title, New Rubric, search, Filter by lifecycle status, and Filter by readiness. Expanding Plant function judgement showed Edit, Duplicate, and Delete. Delete was disabled (`disabled` true, title "Remove citations before deleting"). The red label stays at half opacity, which is the shared manage button. Edit filled Name with Plant function judgement, showed the criteria grid (Function match, Wrong job, Right job), hid Confirm because the record is already confirmed, and showed the banner: evidence model Part function evidence on the procedure and on the phase, design pattern Explain a labelled diagram, and "Delete stays off while an evidence model or a design pattern cites this rubric." The draft Fraction equivalence judgement edit showed Confirm, Save, and Cancel, with the grid (Same amount, Different amount, Same amount) and the banner for Fraction evidence and Explain a fraction. Back to list returned to the cards.

The sample zip cites each rubric on both the procedure and a phase, and from a design pattern, so the route would also reject delete. The phase-only and design-pattern-only blocks are covered by the manage tests.

## Half-applied work

None on this screen. There is no clone or version route. Confirm is still `POST /:id/confirm`. The delete button and the delete route do not use the same citation set: the button also blocks a phase-only citation and a design-pattern-only citation. That is intentional, and the route was not changed.

## Compression debt

None new.

## Calendar

D146 was not marked. This screen has no calendar event.

## Next

D151, after the calibration already recorded. Do not treat this shell as that unit. W29 stays open.
