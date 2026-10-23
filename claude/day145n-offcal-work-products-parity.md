# Off-calendar: Work Products parity with the model screens

**Not D146.** Not a calendar unit. Not a schema unit. The W29 gate stays open: a Domain Analysis still does not produce a Competency Model. Rubrics were not touched.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Shell | Admin, Libraries, Work Products has three buttons in Task Model order: Dashboard, Work Product Structure, Manage Work Products. Dashboard is the default. `?tab=workproducts&focus=<id>` opens Manage with that record loaded | **DONE** |
| Dashboard | Total, Ready, Not ready, Used, and Unused. Ready follows `workProductReadiness(record, { strict: true })`. Used means an item, an evidence model, or a design pattern cites the id. Counts by type use the shared work-product vocabulary. Donuts are Used vs unused, and Ready vs not ready. No status chart | **DONE** |
| Structure | Searchable sortable table, plus Table View / Ingredients View through `ModelIngredientsCard`. Columns are ID, Name, Type, Readiness, Items, Evidence models, Design patterns, and Updated. There is no Status column. Ingredient groups are Description, Items (`interaction.workProductId`), Evidence models (`evaluationProcedures[].workProductId`), and Design patterns (`potentialWorkProducts`) | **DONE** |
| Manage | Same list console as Manage Task Model, with a type filter in place of the status filter. New, search, type, readiness, expandable cards. New, Edit, and Duplicate open the existing form. Duplicate prefills a new record named `<name> (copy)`, then `<name> (copy 2)` when that name is already taken, compared case-insensitively. Delete confirms, then calls the existing delete route, and stays disabled while items bind the record. Cancel and Back to list return to the cards | **DONE** |
| Guards | Edit shows the items, evidence models, and design patterns that cite the record. The type select stays disabled while items bind it. Delete stays blocked while items bind it, matching the route. The worked example still shows when the library is empty | **DONE** |
| Untouched | Payload, readiness rules, routes, and the server. Competency, Evidence, Task, Design Pattern, Domain Analysis, Templates, Assembly Model, Diagnostic Design, Presentation Model, Rubrics, and Task Model Variables stay on their own screens | **DONE** |

## What was delivered

The default export of `WorkProductBuilder` is the tab shell. The create and edit form stays in that file, inside `WorkProductLibraryView`. The worked-example test still renders that view directly. Manage renders `ModelManageList`, and New, Edit, and Duplicate replace the list with the form. `onDismiss` returns to the cards.

There is no clone route. Duplicate copies the name (with " (copy)"), the description, and the type into the create form. It does not copy the id.

`ModelTabShell` and `ModelManageList` are the shared pieces from the earlier passes. Work Products is another caller. `ModelManageList` takes an optional `facet`. When it is set, that select replaces the lifecycle status filter and the lifecycle badge. Other callers leave it unset, so their status filter and badge stay.

## Fields

A work product stores a name, a description, and a type. It does not store a status, a lock, or a version. Names are unique case-insensitively, which is why the copy name walks `(copy)`, `(copy 2)`, and so on.

- Ready means the name and the type pass `workProductReadiness` with `strict: true`. A record with no type is not ready.
- Used means at least one item, evidence model, or design pattern cites the id. Unused is the rest.
- Counts by type use `WORK_PRODUCT_TYPES`. A record with no type is counted under No type only when that count is above zero.
- The card badge is the type label. The readiness chip is Ready or Not ready. The meta line counts items, evidence models, and design patterns.
- Ingredient subtitle is the type label and the readiness word. The shared ingredients card still draws its own separator in front of a secondary line.
- Delete and type change stay gated on items, which is what the existing route checks. Evidence models and design patterns are shown before edit, and they do not by themselves block delete or a type change.

`?tab=workproducts` with no id stays on Dashboard.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2378 passed | 9 skipped (2387)
  Test Files 268 passed
  58.37s, exit 0

npm run build
  green (1.36s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 373.92 kB (gzip 82.87 kB).
  WorkProductBuilder 21.14 kB (gzip 6.58 kB).
```

Previous close on this tree was the zip work-product and rubric import, **2367 passed / 9 skipped**. Delta: **+11 tests / +3 files** (`workProductDashboard.test.jsx`, `workProductStructure.test.jsx`, `workProductTabs.test.jsx`). Skips unchanged. The worked-example test, the template manage-tab test, and the presentation manage-tab test passed in the same run.

This VM ran the suite on Node 22. CI installs Node 24. `npm ci` printed an engine warning and still installed.

## Browser

Local Vite `http://localhost:5173` and the API on `:3000`, `DB_MODE=json`, `ECD_DB_FILE` pointing at an empty JSON file, signed in as `admin1`. Settings, Data, Upload. "Keep original ids and statuses" was on. The file was `samples/ecd-sample-complete.zip`.

Preview: 44 created, 0 failed, keeping free original ids. `workProducts`: 3 created, 0 failed. Import finished with the same totals. No error toast.

Before the shell, Work Products was one screen: a Name/Type/Description form and a table. After, Dashboard showed Total 3, Ready 3, Not ready 0, Used 3, Unused 0. Counts by type: Selected Response 3, and 0 for Constructed Response, Numeric Response, Performance, Artifact, Behavior, and Process Trace. The donuts were 100% used and 100% ready, each counting 3.

Structure listed Selected plant-part name (`wp-part-name`, 2 items, 1 evidence model, 1 design pattern), Selected plant-part function (1, 1, 1), and Selected equivalent fraction (1, 1, 1). All three were Selected Response and Ready. There was no Status column. Ingredients for Selected plant-part name showed Description, Items (Leaf on the diagram, Root on the diagram), Evidence models (Part naming evidence), and Design patterns (Name a plant part). Subtitle `Selected Response • Ready`.

Manage showed the title, New Work Product, search, Filter by type (All types, not All statuses), Filter by readiness, and three cards. Expanding Selected plant-part name showed Edit, Duplicate, and Delete. Delete was `disabled` (tooltip: Unbind items before deleting). Clicking it did not open a dialog. Edit filled Name with Selected plant-part name, disabled Type on Selected Response, and showed the banner: items Leaf on the diagram and Root on the diagram, evidence model Part naming evidence, design pattern Name a plant part, and "Type cannot change while items bind this work product." Back to list returned to the cards. New Work Product opened an empty Name, Type Selected Response and enabled, Create, Cancel, and Back to list. The worked example was not on that form, because the library was not empty.

Manage Task Model was opened on the same session and was not restyled. It showed Dashboard, Task Model Structure, and Manage Task Model, with All statuses. No error toast. Live `:6060` was not rebuilt.

## Half-applied work

None on this screen. There is no clone or version route. Confirm is not a work-product action.

## Compression debt

None new.

## Calendar

D146 was not marked. This screen has no calendar event.

## Next

D151, after the calibration already recorded. Do not treat this shell as that unit. Rubrics are a separate pass. W29 stays open.
