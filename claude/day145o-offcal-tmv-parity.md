# Off-calendar: Task Model Variables parity with the model screens

**Not D146.** Not a calendar unit. Not a schema unit. The W29 gate stays open: a Domain Analysis still does not produce a Competency Model. Rubrics were not touched.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Shell | Admin, Libraries, Task Model Variables has three buttons in the same order as Work Products: Dashboard, Task Model Variable Structure, Manage Task Model Variables. Dashboard is the default. `?tab=taskmodelvariables` still opens this leaf. `focus` or `id` opens Manage with that record loaded. No new route | **DONE** |
| Dashboard | Total, Ready, Not ready, In use, and Unused. Ready follows `taskModelVariableReadiness(record, { strict: true })`. In use means a task model or a design pattern cites the id. Counts by type use `TMV_TYPES`. Counts by value set use `TMV_VALUE_SET_KEYS`, plus Author-supplied when the record names no value set. Donuts are In use vs unused, and Ready vs not ready. No status chart | **DONE** |
| Structure | Searchable sortable table, plus Table View / Ingredients View through `ModelIngredientsCard`. Columns are ID, Name, Type, Value set, Readiness, Task models, Design patterns, and Updated. There is no Status column. Ingredient groups are Description, Levels, Task models (`taskModelVariableIds`), and Design patterns (`variableFeatures[].taskModelVariableId`) | **DONE** |
| Manage | Same list console as Manage Work Products, with a type filter in place of the status filter, plus a readiness filter. New, search, type, readiness, expandable cards. New, Edit, and Duplicate open the existing form. Duplicate prefills a new record named `<name> (copy)`, then `<name> (copy 2)` when that name is already taken, compared case-insensitively. Delete confirms, then calls the existing delete route, and stays disabled while a task model or a design pattern cites the record. Cancel and Back to list return to the cards | **DONE** |
| Guards | A vocabulary value set locks once set (readonly block, payload keeps `type` and `valueSet`). The type select stays disabled on every edit. Save is still checked on the server against task models that list the variable. Edit shows those task models and the design patterns that cite the record. The worked example still shows when the library is empty. `ecdVocabulary.js` stays the only vocabulary source. The readiness mirror does not import it | **DONE** |
| Untouched | Payload shape, readiness rules, routes, and the server. Competency, Evidence, Task, Design Pattern, Domain Analysis, Templates, Assembly Model, Diagnostic Design, Presentation Model, Rubrics, and Work Products stay on their own screens | **DONE** |

## What was delivered

The default export of `TaskModelVariableBuilder` is the tab shell. The create and edit form stays in that file, inside `TaskModelVariableLibraryView`. The worked-example test still renders that view directly. Manage renders `ModelManageList`, and New, Edit, and Duplicate replace the list with the form. `onDismiss` returns to the cards.

There is no clone route. Duplicate copies the name (with " (copy)"), the description, the type, the value set, and the levels into the create form. It does not copy the id. A duplicated value-set record is a new record, so the value set is not locked until it is saved.

`ModelTabShell` and `ModelManageList` are the shared pieces from the earlier passes. Task Model Variables is another caller. `ModelManageList` takes an optional `facet`. When it is set, that select replaces the lifecycle status filter and the lifecycle badge. Work Products already used this. Other callers leave it unset, so their status filter and badge stay. Readiness is the existing `readinessOf` select.

Delete on the card is stricter than the route. The route returns 409 only when task models list the id. The button is also disabled when only a design pattern cites the id, so that citation is not dropped by a delete the route would allow. The edit-impact check stays on the server PUT: "Task Model Variable change would invalidate a consuming Task Model."

## Fields

A task model variable stores a name, a description, a type, and either a vocabulary `valueSet` or author-supplied levels (`possibleValues`, or `range` for numeric). It does not store a status, a lock, or a version. Names are unique case-insensitively, which is why the copy name walks `(copy)`, `(copy 2)`, and so on.

- Ready means the record passes `taskModelVariableReadiness` with `strict: true`. A record with no type is not ready.
- In use means at least one task model or design pattern cites the id. Unused is the rest.
- Counts by type use `TMV_TYPES`. A record with no type is counted under No type only when that count is above zero.
- Counts by value set list every `TMV_VALUE_SET_KEYS` entry, always list Author-supplied, and list Other only when an unknown value set is present.
- The card badge is the type label. The readiness chip is Ready or Not ready. The meta line counts task models and design patterns.
- Ingredient subtitle is the type label, the value-set kind, and the readiness word. The shared ingredients card still draws its own separator in front of a secondary line.
- The leaf id stays `taskmodelvariables`. `?tab=taskmodelvariables` with no focus and no id stays on Dashboard.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2389 passed | 9 skipped (2398)
  Test Files 271 passed
  57.71s, exit 0

npm run build
  green (1.35s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 373.92 kB (gzip 82.87 kB).
  TaskModelVariableBuilder 27.43 kB (gzip 8.11 kB).
  WorkProductBuilder 21.14 kB (gzip 6.58 kB).
```

Previous close on this tree was Work Products parity, **2378 passed / 9 skipped**. Delta: **+11 tests / +3 files** (`taskModelVariableDashboard.test.jsx`, `taskModelVariableStructure.test.jsx`, `taskModelVariableTabs.test.jsx`). The builder test file was extended in place. Skips unchanged.

This VM ran the suite on Node 22. CI installs Node 24. `npm ci` printed an engine warning and still installed.

## Browser

The desktop session was offline. The walk used headless Chrome against local Vite on `http://127.0.0.1:5173` and the API on `:3000`, `DB_MODE=json`, `ECD_DB_FILE` pointing at a JSON file, signed in as `admin1`.

`samples/ecd-sample-complete.zip` was imported through Settings, Data, Upload, with "Keep original ids and statuses" on. Preview reported Task model variables, 3 created. Import finished. The store kept `tmv-diagram`, `tmv-bloom`, and `tmv-denominator`.

Dashboard: Total 3, Ready 3, Not ready 0, In use 3, Unused 0. Counts by type: Categorical 2, Ordinal 0, Numeric 1, Boolean 0. Counts by value set: bloomLevel 0, reasoningType 0, presentationMode 0, responseFormat 0, stimulusPolicy 0, Author-supplied 3. Both donuts counted 3 and read 100 percent (in use, and ready).

Structure listed Plant diagram (`tmv-diagram`), Bloom demand (`tmv-bloom`), and Fraction denominator (`tmv-denominator`). All three were Author-supplied and Ready. Types were Categorical, Categorical, and Numeric. There was no Status column. Ingredients for Plant diagram showed Description 1, Levels 3 (leaf, root, flower), Task models 2 (Name the plant part, draft; Name the plant function, draft), and Design patterns 2 (Explain a labelled diagram; Name a plant part). Subtitle `Categorical • Author-supplied • Ready`.

Manage showed the title, New Task Model Variable, search, Filter by type, and Filter by readiness. There was no lifecycle status filter. Expanding Plant diagram showed Edit, Duplicate, and Delete. Delete was disabled. Edit filled the name Plant diagram, left type disabled, left the value-set select disabled (this sample record is author-supplied, so the vocabulary readonly block is not on it), and kept possible values `leaf, root, flower`. The banner listed consuming task models Name the plant part (draft) and Name the plant function (draft), design patterns Explain a labelled diagram and Name a plant part, and "Saving is checked against the Task Models that use this variable."

The sample zip has no vocabulary value set on these three records. The lock on a set value set is covered by the builder test (Bloom demand with `valueSet: bloomLevel` stays readonly, and save keeps that key).

## Half-applied work

None on this screen. There is no clone or version route. Confirm is not a task model variable action. The delete button and the delete route do not use the same citation set: the button also blocks a design-pattern-only citation. That is intentional, and the route was not changed.

## Compression debt

None new.

## Calendar

D146 was not marked. This screen has no calendar event.

## Next

D151, after the calibration already recorded. Do not treat this shell as that unit. Rubrics are a separate pass. W29 stays open.
