# Off-calendar — Diagnostic Design parity with the model screens

**Not D146.** Not a calendar unit. Not a schema unit. The W29 gate stays open: a Domain Analysis still does not produce a Competency Model. This is the last of the three model-screen passes after Templates and Assembly Model.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Shell | Admin → Models → Diagnostic design has three buttons in Task Model order: Dashboard, Diagnostic Design Structure, Manage Diagnostic Designs. Dashboard is the default. `focus`, `id`, and `qMatrixId` open Manage on that record. `?tab=qmatrix` with no record id stays on Dashboard | **DONE** |
| Dashboard | Total, Confirmed, Operational, Draft, and Ready to confirm. Ready to confirm counts draft and reviewed designs that pass `meetsDiagnosticDesignConfirmedGates`. A confirmed or later design is not counted again. Donuts are Draft or reviewed vs Confirmed or later, and Locked vs Unlocked | **DONE** |
| Structure | Searchable sortable table, plus Table View / Ingredients View through `ModelIngredientsCard`. Columns are Student Model, attribute count, entry count, Domain Analysis, readiness, and lock | **DONE** |
| Manage | Same list console as Manage Task Model: title, description, black New button, search, status, readiness, expandable cards. New, Edit, and Duplicate open `QMatrixEditor`. Duplicate prefills a new draft. Delete confirms, then calls the existing delete route. Cancel and Back to list return to the cards | **DONE** |
| Deep link | `?tab=qmatrix&domainAnalysisId=<analysisId>` still opens Manage filtered to designs that name that analysis, and New keeps the citation. `domainAnalysisId` is not a diagnostic-design id | **DONE** |
| Untouched | Payload, readiness rules, routes, and the server. Competency, Evidence, Task, Design Pattern, Domain Analysis, Templates, and Assembly Model stay on their own screens. The district `/district/q-matrices` route stays read-only | **DONE** |

## What was delivered

Diagnostic Design is the Q-matrix screen. The admin tab label stays "Diagnostic design". The default export of `QMatrixModelBuilder` is the tab shell. The create and edit form stays the existing editor. Manage renders `ModelManageList`, and New, Edit, and Duplicate replace the list with that editor. `onSaved` and Cancel return to the cards.

There is no clone route. Duplicate copies the name (with " copy"), the description, the Student Model citation and version, the attribute ids, the entries, and the Domain Analysis citation into the create form. It does not copy id, status, lock, or version.

`ModelTabShell` and `ModelManageList` are the shared pieces from the earlier passes. Diagnostic Design is another caller. The New button is omitted when `onCreate` is not a function, so the district read-only list has no New button. Other callers still pass `onCreate`.

`QMatrixList` is gone. The browsing table it held is the Structure tab. The empty worked example and the read-only posture moved into Manage. `CalibrationJobList` only dropped that file from a comment.

## Fields

A diagnostic design stores a name, a description, a Student Model citation, `attributeIds` (binary Student Model variables), sparse `entries` (`itemId`, `attributeId`), an optional `domainAnalysisId`, and the full lifecycle including a lock.

- Ready to confirm is a draft or reviewed design that already passes `meetsDiagnosticDesignConfirmedGates` (reviewed gates, plus at least one stored entry). A confirmed, operational, suspended, or archived design is not counted there.
- The client mirror matches the stored-record gates. An all-zero row cannot be stored, so it is not re-checked here. The server's unplaced-item check needs evidence models and deliverable items; with nothing bound it passes, and that check is not in the client mirror.
- The first donut counts draft and reviewed against everything later. The second counts `locked`.
- Ingredient groups are Description, Student Model, Attributes, Items, Domain Analysis, and Version. Attribute labels come from the bound Student Model. A missing variable shows its id. Item rows use the item id, with the attribute labels as secondary text. The subtitle is the Student Model name, or Not linked, and the readiness word.
- The open button uses `openActionLabel`: Edit on a draft, Review on reviewed, View when locked. Delete stays disabled while the record is locked. A read-only caller always shows View, and hides Duplicate and Delete.

Dashboard and Structure show the full catalog. Manage is filtered when `domainAnalysisId` is present, because that is the existing authoring handoff from Domain Analysis. Back, Cancel, New, and Duplicate keep that filter.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2328 passed | 9 skipped (2337)
  Test Files 258 passed
  54.53s, exit 0

npm run build
  green (1.28s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 373.92 kB (gzip 82.87 kB).
  QMatrixModelBuilder 29.79 kB (gzip 9.35 kB).
```

Previous close on this tree was Assembly Model parity, **2315 passed / 9 skipped**. Delta: **+13 tests / +4 files** (`diagnosticDesignReadiness.test.js`, `diagnosticDesignDashboard.test.jsx`, `diagnosticDesignStructure.test.jsx`, `diagnosticDesignTabs.test.jsx`). Skips unchanged.

This VM ran the suite on Node 22. CI installs Node 24. `npm ci` printed an engine warning and still installed.

## Browser

Local Vite `http://127.0.0.1:5173` and the API on `:3000`, `DB_MODE=json`, `ECD_DB_FILE` pointing at the same JSON file the user store uses, signed in as `admin1`. The store held five diagnostic designs and two task models.

Before the shell, Diagnostic design was one table: Name, Student Model, Attributes, Entries, Status, and a "+ New Diagnostic design" button. There were no Dashboard, Diagnostic Design Structure, or Manage Diagnostic Designs buttons. Rows were Plant part naming design (Draft, Edit, Delete), Reviewed fraction design (Reviewed, Review, Delete), Unfinished design (Draft, Edit, Delete), Fraction design (Confirmed, Review), and Live fraction design (Operational, Review). Light and dark both showed that table.

After, Dashboard showed Total 5, Confirmed 1, Operational 1, Draft 2, Ready to confirm 2. The donuts were Authoring vs later (40% confirmed or later, 60% draft or reviewed) and Structural lock. Structure listed the five designs with Student Model, attribute count, entry count, Domain Analysis, readiness, and lock. Ingredients for Live fraction design showed Description, Student Model, Attributes 2, Items 2, Domain Analysis, and Version. Manage showed the title, New Diagnostic Design, search, status, readiness, and five cards. Expanding Plant part naming design showed Edit, Duplicate, and Delete. New Diagnostic Design opened the existing editor with an empty name. Back to list returned to the cards.

Manage Task Model was opened on the same session and was not restyled. It showed Dashboard, Task Model Structure, and Manage Task Model, with the same header, New button, filters, and expandable cards. Light and dark were both readable on Dashboard, Structure, and Manage: cards, table text, badges, and the New button stayed distinct from the page surface. No error toast. Live `:6060` was not rebuilt.

## Half-applied work

None on this screen. Confirm still lives in the existing editor. There is no clone or version route.

## Compression debt

None new.

## Calendar

D146 was not marked. This screen has no calendar event.

## Next

D151, after the calibration already recorded. Do not treat this shell as that unit. W29 stays open. The model-screen shell now covers Competency, Evidence, Task, Design Pattern, Domain Analysis, Templates, Assembly Model, and Diagnostic Design.
