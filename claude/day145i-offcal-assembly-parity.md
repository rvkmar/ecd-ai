# Off-calendar — Assembly Model parity with the model screens

**Not D146.** Not a calendar unit. Not a schema unit. The W29 gate stays open: a Domain Analysis still does not produce a Competency Model. Diagnostic Design was not touched.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Shell | Admin → Models → Assembly Model has three buttons in Task Model order: Dashboard, Assembly Structure, Manage Assembly Models. Dashboard is the default. `?tab=assembly&focus=<id>`, `id`, and `assemblyModelId` open Manage with that record loaded | **DONE** |
| Dashboard | Total, Confirmed, Operational, Draft, and Ready to confirm. Ready to confirm counts draft and reviewed models that pass `meetsAssemblyConfirmedGates`. A confirmed or later model is not counted again. Donuts are Draft or reviewed vs Confirmed or later, and Locked vs Unlocked | **DONE** |
| Structure | Searchable sortable table, plus Table View / Ingredients View through `ModelIngredientsCard`. Columns are the Student Model, SMV target count, stopping rules, selection policy, readiness, and lock | **DONE** |
| Manage | Same list console as Manage Task Model: title, description, black New button, search, status, readiness, expandable cards. New, Edit, and Duplicate open `AssemblyModelWizard`. Duplicate prefills a new draft. Delete confirms, then calls the existing delete route. Cancel and Back to list return to the cards | **DONE** |
| Untouched | Payload, readiness rules, routes, and the server. Competency, Evidence, Task, Design Pattern, Domain Analysis, Templates, and Diagnostic Design stay on their own screens | **DONE** |

## What was delivered

The default export of `AssemblyModelBuilder` is the tab shell. The create and edit form stays the existing wizard. Manage renders `ModelManageList`, and New, Edit, and Duplicate replace the list with the wizard. `onSaved` and Cancel return to the cards.

There is no clone route. Duplicate copies the name (with " copy"), the description, the Student Model citation, the SMV targets, the stopping rules, and the selection policy into the create form. It does not copy status, lock, or version.

`ModelTabShell` and `ModelManageList` are the shared pieces from the Design Pattern, Domain Analysis, and Templates passes. Assembly Model is another caller. The button row is unchanged.

`AssemblyModelList` is gone. The browsing table it held is the Structure tab. `CalibrationJobList` only dropped that file from a comment.

## Fields

An Assembly Model stores a name, a description, a Student Model citation, `targetsBySMV`, `stoppingRules`, a selection policy id, and the full lifecycle including a lock.

- Ready to confirm is a draft or reviewed model that already passes `meetsAssemblyConfirmedGates` (reviewed gates, plus a stopping rule that names max items, min items, or targets met). A confirmed, operational, suspended, or archived model is not counted there.
- The first donut counts draft and reviewed against everything later. The second counts `locked`.
- Ingredient groups are Description, Student Model, SMV targets, Stopping rules, Selection policy, and Version. Target labels come from the bound Student Model's variables. A missing variable shows its id. The subtitle is the Student Model name, or Not linked, and the readiness word.
- The open button uses `openActionLabel`: Edit on a draft, Review on reviewed, View when locked. Delete stays disabled while the record is locked.

`?tab=assembly` with no id stays on Dashboard.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2315 passed | 9 skipped (2324)
  Test Files 254 passed
  50.63s, exit 0

npm run build
  green (1.23s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 373.92 kB (gzip 82.87 kB).
  AssemblyModelBuilder 32.26 kB (gzip 9.06 kB).
```

Previous close on this tree was Templates parity, **2305 passed / 9 skipped**. Delta: **+10 tests / +3 files** (`assemblyDashboard.test.jsx`, `assemblyStructure.test.jsx`, `assemblyTabs.test.jsx`). Skips unchanged.

This VM ran the suite on Node 22. CI installs Node 24. `npm ci` printed an engine warning and still installed.

## Browser

Local Vite `http://127.0.0.1:5173` and the API on `:3000`, `DB_MODE=json`, `ECD_DB_FILE` pointing at the same JSON file the user store uses, signed in as `admin1`. The store held five assembly models and two task models.

Before the shell, Assembly Model was one table: Name, Student Model, SMV Targets, Stopping Rules, Status, and a "+ New Assembly Model" button. There were no Dashboard, Assembly Structure, or Manage Assembly Models buttons. Rows were Plant part naming assembly (Draft, Edit, Delete), Reviewed assembly (Reviewed, Review, Delete), Unfinished assembly (Draft, Edit, Delete), Fraction assembly (Confirmed, Review), and Live fraction assembly (Operational, Review).

After, Dashboard showed Total 5, Confirmed 1, Operational 1, Draft 2, Ready to confirm 2. The donuts were Authoring vs later and Structural lock. Structure listed the five models with Student Model, target count, stopping rules, selection policy, readiness, and lock. Ingredients for Live fraction assembly showed Description 1, Student Model 1, SMV targets 2, Stopping rules 2, Selection policy 1, and Version 1. Manage showed the title, New Assembly Model, search, status, readiness, and five cards. Expanding Plant part naming assembly showed Edit, Duplicate, and Delete. New Assembly Model opened the existing five-step wizard. Back to list returned to the cards. `?tab=assembly&focus=am-ready` opened that wizard with the name, description, and Student Model filled.

Manage Task Model was opened on the same session and was not restyled. It showed Dashboard, Task Model Structure, and Manage Task Model, with the same header, New button, filters, and expandable cards. Light and dark were both readable on Dashboard, Structure, and Manage: cards, table text, badges, and the New button stayed distinct from the page surface. No error toast. Live `:6060` was not rebuilt.

## Half-applied work

None on this screen. Confirm still lives in the existing wizard. There is no clone or version route.

## Compression debt

None new.

## Calendar

D146 was not marked. This screen has no calendar event.

## Next

D151, after the calibration already recorded. Do not treat this shell as that unit. Diagnostic Design is a separate pass. W29 stays open.
