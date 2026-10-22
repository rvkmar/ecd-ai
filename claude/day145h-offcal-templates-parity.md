# Off-calendar — Templates parity with the model screens

**Not D146.** Not a calendar unit. Not a schema unit. The W29 gate stays open: a Domain Analysis still does not produce a Competency Model. Assembly Model and Diagnostic Design were not touched.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Shell | Admin → Models → Templates has three buttons in Task Model order: Dashboard, Template Structure, Manage Templates. Dashboard is the default. `?tab=templates&focus=<id>` opens Manage with that template loaded | **DONE** |
| Dashboard | Total, Confirmed, Draft, and Ready to confirm. Ready to confirm counts drafts that pass `templateReadiness(record, { strict: true })`. A confirmed template that would pass that check is not counted. Donuts are Draft vs Confirmed, and Linked to a Design Pattern vs Not linked. No lock chart and no operational chart | **DONE** |
| Structure | Searchable sortable table, plus Table View / Ingredients View through `ModelIngredientsCard`. Columns are the four bindings, the design pattern, readiness, and family size. Family size is projected from the bound Task Model. The template does not store those settings | **DONE** |
| Manage | Same list console as Manage Task Model: title, description, black New button, search, status, readiness, expandable cards. New, Edit, and Duplicate open `TemplateLibraryView`. Duplicate prefills a new draft. Delete confirms, then calls the existing delete route. Cancel and Back to list return to the cards | **DONE** |
| Untouched | Payload, readiness rules, routes, and the server. Competency, Evidence, Task, Design Pattern, and Domain Analysis shells stay on their own buttons. Assembly Model and Diagnostic Design are unchanged | **DONE** |

## What was delivered

The default export of `TemplateBuilder` is the tab shell. The create and edit form stays in that file, inside `TemplateLibraryView`. Existing tests still render that view directly, including the library column. Manage renders `ModelManageList`, and New, Edit, and Duplicate replace the list with the form. `onDismiss` hides the library column and returns to the cards.

There is no clone route. Duplicate copies the name (with " copy"), the description, the four bindings, and the design-pattern citation into the create form. It does not copy status.

`ModelTabShell` and `ModelManageList` are the shared pieces from the Design Pattern and Domain Analysis passes. Templates is another caller. The button row is unchanged.

## Fields

A template stores a name, a description, four binding ids, an optional `designPatternId`, and `draft` or `confirmed`. It does not store Task Model Variable settings, a lock, or a version.

- Ready to confirm is a draft whose name and four bindings pass `templateReadiness` with `strict: true`. A confirmed template that would pass is counted under Confirmed only.
- The second donut counts templates that store a non-empty `designPatternId`. An id that matches no pattern is still in the linked slice. The structure column shows that id when the pattern record is missing, and "Not linked" when the field is empty.
- Family size is `familySizeFromTaskModel` on the bound Task Model. No task model shows an em dash. A task model with no variables shows 1.
- Ingredient groups are Description, Student Model, Evidence Model, Task Model, Presentation Model, Design pattern, and the bound Task Model Variables (variation as the secondary line). The subtitle is the pattern name, or Not linked, and the readiness word.

`?tab=templates` with no id stays on Dashboard. The pattern screen's link `?tab=templates&focus=` still opens Manage on that template.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2305 passed | 9 skipped (2314)
  Test Files 251 passed
  52.66s, exit 0

npm run build
  green (1.33s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 373.92 kB (gzip 82.87 kB).
  TemplateBuilder 29.37 kB (gzip 8.30 kB).
```

Previous close on this tree was the Manage list console, **2296 passed / 9 skipped**. Delta: **+9 tests / +3 files** (`templateDashboard.test.jsx`, `templateStructure.test.jsx`, `templateTabs.test.jsx`). Skips unchanged. Existing template builder tests, the pattern-template link test, the worked-example test, the perspective-at-decision test, and `adminPageIa.test.jsx` passed in the same run.

This VM ran the suite on Node 22. CI installs Node 24. `npm ci` printed an engine warning and still installed.

## Browser

Filled in after the live walk.

## Half-applied work

None on this screen. Confirm still lives in the existing form. There is no clone or version route.

## Compression debt

None new.

## Calendar

D146 was not marked. This screen has no calendar event.

## Next

D151, after the calibration already recorded. Do not treat this shell as that unit. Assembly Model and Diagnostic Design are separate passes. W29 stays open.
