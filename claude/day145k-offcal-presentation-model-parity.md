# Off-calendar — Presentation Model parity with the model screens

**Not D146.** Not a calendar unit. Not a schema unit. The W29 gate stays open: a Domain Analysis still does not produce a Competency Model. This pass moves Presentation Model out of Delivery and onto the same shell as the other model screens.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Nav | Admin → Models includes Presentation Model, between Task Model and Templates. Delivery no longer lists it. The leaf id stays `presentation`, so `?tab=presentation` still selects this Models tab. `/admin/presentation-models` still mounts the builder | **DONE** |
| Shell | Three buttons in Task Model order: Dashboard, Presentation Structure, Manage Presentation Models. Dashboard is the default. `focus`, `id`, and `presentationModelId` open Manage on that record, from the Models tab, from a Delivery-era `?tab=presentation` address, and from `/admin/presentation-models` | **DONE** |
| Dashboard | Total, Confirmed, Operational, Draft, and Ready to confirm. Ready to confirm counts draft and reviewed models that pass `meetsPresentationConfirmedGates`. A confirmed or later model is not counted again. Donuts are Draft or reviewed vs Confirmed or later, and Locked vs Unlocked | **DONE** |
| Structure | Searchable sortable table, plus Table View / Ingredients View through `ModelIngredientsCard`. Columns are ID, Name, Status, Readiness, Task Model, Order, Grouping, Navigation, Profile, Templates, Locked, Updated | **DONE** |
| Manage | Same list console as Manage Task Model: title, description, black New button, search, status, readiness, expandable cards. New, Edit, and Duplicate open the existing Presentation Model wizard. Duplicate prefills a new draft. Delete confirms, then calls the existing delete route. Cancel and Back to list return to the cards. Delete stays disabled while the record is locked | **DONE** |
| Untouched | Payload, readiness rules, routes, and the server. Competency, Evidence, Task, Design Pattern, Domain Analysis, Templates, Assembly Model, and Diagnostic Design stay on their own screens. District is not given a Presentation Model tab. Delivery's other leaves stay | **DONE** |

## What was delivered

Presentation Model was a Delivery leaf: one browsing table and a "+ New Presentation Model" button. It is now a Models leaf, placed after Task Model and before Templates because the overlay is bound to a Task Model and is one of the four bindings a Template cites.

The default export of `PresentationModelBuilder` is the tab shell. The create and edit form stays the D113 W23 wizard. Manage renders `ModelManageList`, and New, Edit, and Duplicate replace the list with that wizard. `onSaved` and Cancel return to the cards.

There is no clone route. Duplicate copies the name (with " copy"), the description, the Task Model citation and version, `layout`, `conditionalDisplay`, and `accessibility` into the create form. It does not copy id, status, lock, or version.

`ModelTabShell` and `ModelManageList` are the shared pieces from the earlier passes. Presentation Model is another caller. The open button uses `openActionLabel`.

`PresentationModelList` is gone. The browsing table it held is the Structure tab. The samples README pointer now says Admin → Models → Presentation Model wizard. No other in-app link targeted the Delivery leaf; Templates cite a presentation model by id, and that citation is unchanged.

The Admin leaf id stays `presentation`. `RoleWorkbench` selects a leaf by id across groups, so an old `?tab=presentation` address opens the Models group on this tab and still honors `focus`, `id`, and `presentationModelId`.

## Fields

A presentation model stores a name, a description, a Task Model citation and version, `layout` (`itemOrder`, `grouping`, `navigation`), `conditionalDisplay` (`showFeedback`, `allowSkip`, `allowReview`, `showProgress`), `accessibility` (`profile`, `fontScale`, `timeMultiplier`), and the full lifecycle including a lock and `versionNumber` / `parentModelId`.

- Ready to confirm is a draft or reviewed model that already passes `meetsPresentationConfirmedGates` (reviewed gates: name, task model, item order, navigation; confirmed also needs feedback timing and an accessibility profile). A confirmed, operational, suspended, or archived model is not counted there.
- The card and the table use the gate itself for Ready / Not ready, matching Assembly and Diagnostic Design. The readiness filter uses the same gate.
- The first donut counts draft and reviewed against everything later. The second counts `locked`.
- Ingredient groups are Description, Task Model (version as secondary text), Layout, Conditional display, Accessibility, Templates that cite `presentationModelId`, and Version. A template that cites a missing id is not counted. The subtitle is the Task Model name, or Not linked, and the readiness word.
- The open button uses `openActionLabel`: Edit on a draft, Review on reviewed, View when locked. Delete stays disabled while the record is locked.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2340 passed | 9 skipped (2349)
  Test Files 261 passed
  56.98s, exit 0

npm run build
  green (1.48s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 373.88 kB (gzip 82.85 kB).
  PresentationModelBuilder 31.03 kB (gzip 8.63 kB).
```

Previous close on this tree was Diagnostic Design parity, **2328 passed / 9 skipped**. Delta: **+12 tests / +3 files** (`presentationDashboard.test.jsx`, `presentationStructure.test.jsx`, `presentationTabs.test.jsx`). The Admin IA suite gained the saved-address case. Skips unchanged.

This VM ran the suite on Node 22. CI installs Node 24. `npm ci` printed an engine warning and still installed.

## Browser

Local Vite `http://localhost:5173` and the API on `:3000`, `DB_MODE=json`. Login uses `./data/db.json`. Presentation, task, and template routes use `loadDB()` (`/workspace/db.json`). The route file held five presentation models, two task models, and two templates. Signed in as `admin1`.

Before the shell, Presentation sat under Delivery: Sessions, Human rating, Evidence Accumulation (inspect), Presentation, Parameter estimation. The panel was one table: Name, Task Model, Order, Navigation, Status, and a "+ New Presentation Model" button. There were no Dashboard, Presentation Structure, or Manage Presentation Models buttons. Rows were Plant part presentation (Draft), Reviewed presentation (Reviewed), Unfinished presentation (Draft), Fraction presentation (Confirmed), and Live fraction presentation (Operational). Light and dark both showed that table.

After, `?tab=presentation` opens Models with Presentation Model active. Dashboard showed Total 5, Confirmed 1, Operational 1, Draft 2, Ready to confirm 2. Structure listed the five models with readiness, grouping, profile, template count, and lock. Ingredients for Plant part presentation showed Description, Task Model, Layout, Conditional display, Accessibility, Templates, and Version. Manage showed the title, New Presentation Model, search, status, readiness, and the cards. Expanding Plant part presentation showed Edit, Duplicate, and Delete. `?tab=presentation&focus=pm-ready` opened Manage on the wizard for Plant part presentation, with the Task Model combobox set to Plant part naming, and Back to list. Delivery's remaining leaves are Sessions, Human rating, Evidence Accumulation (inspect), and Parameter estimation.

Manage Task Model was opened on the same session and was not restyled. It showed Dashboard, Task Model Structure, and Manage Task Model, with the same header, New button, and filters. Light and dark were both readable on Dashboard, Structure, and Manage: cards, table text, badges, and the New button stayed distinct from the page surface. No error toast. Live `:6060` was not rebuilt.

## Half-applied work

None on this screen. Confirm still lives in the existing wizard. There is no clone or version route.

## Compression debt

None new.

## Calendar

D146 was not marked. This screen has no calendar event.

## Next

D151, after the calibration already recorded. Do not treat this shell as that unit. W29 stays open. The model-screen shell now covers Competency, Evidence, Task, Design Pattern, Domain Analysis, Templates, Assembly Model, Diagnostic Design, and Presentation Model.
