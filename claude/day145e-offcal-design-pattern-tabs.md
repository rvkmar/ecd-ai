# Off-calendar — Design Pattern three-tab shell

**Not D146.** Not a calendar unit. Not a schema unit. The W29 gate stays open: a Domain Analysis still does not produce a Competency Model.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Shell | Admin → Models → Design Patterns has three buttons in Task Model order: Dashboard, Design Pattern Structure, Manage Design Pattern. Dashboard is the default. `?tab=designpatterns&focus=<id>` opens Manage with that pattern loaded | **DONE** |
| Dashboard | Total, Confirmed, Draft, and Ready to confirm. Ready to confirm counts drafts that pass `designPatternReadiness(record, { strict: true })`. Donuts are Draft vs Confirmed, and Linked to Domain Analysis vs Not linked. No lock chart and no operational chart | **DONE** |
| Structure | Searchable sortable table, plus Table View / Ingredients View through `ModelIngredientsCard`. Ingredient groups come from `formFromRow`, plus linked templates and seeded models. The seeded count is Evidence and Task Models that still store `seededFrom.designPatternId`. The label says a deleted pattern drops that back-link (open D150 P1) | **DONE** |
| Manage | `DesignPatternLibraryView` as before, including its existing Delete. No new delete action | **DONE** |
| Untouched | `designPatternPayload`, the body of `formFromRow`, readiness rules, routes, and the server. Competency, Evidence, and Task shells stay on their own buttons | **DONE** |

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2283 passed | 9 skipped (2292)
  Test Files 245 passed
  49.90s, exit 0

npm run build
  green (1.25s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 373.87 kB (gzip 82.85 kB).
  DesignPatternBuilder 47.10 kB (gzip 12.90 kB).
```

Previous close on this tree was the D150 re-run, **2277 passed / 9 skipped**. Delta: **+6 tests / +3 files** (`designPatternDashboard.test.jsx`, `designPatternStructure.test.jsx`, `designPatternTabs.test.jsx`). Skips unchanged. Existing Design Pattern tests and `adminPageIa.test.jsx` passed in the same run.

This VM ran the suite on Node 22. CI installs Node 24. `npm ci` printed an engine warning and still installed.

## What was delivered

The default export of `DesignPatternBuilder` is the tab shell. The nine-step wizard stays in that file, inside `DesignPatternLibraryView`. Manage renders that view with the same props as before. `ModelTabShell` draws the buttons and the active panel. Only Design Pattern calls it.

The dashboard reads `useDesignPatterns`. A confirmed pattern that would pass the strict check is not counted as Ready to confirm. The structure table reads the same hook plus domain analyses, templates, evidence models, and task models. `formFromRow` is exported so the ingredient groups use that mapping. The function body is unchanged.

## Browser

Local Vite `http://localhost:5173` and the API on `:3000`, `DB_MODE=json`, signed in as `admin1`. The store held three patterns: a ready draft linked to Plant structure (one template, two models that still cite it), a thin draft, and a confirmed pattern. An evidence model citing a missing pattern id stayed out of every count.

Dashboard showed Total 3, Confirmed 1, Draft 2, Ready to confirm 1. The donuts were about 67% draft / 33% confirmed, and 33% linked / 67% not linked. Structure showed those rows. Ingredients for Name a plant part showed the eleven groups, subtitle `Plant structure • Ready`. Opening `?tab=designpatterns&focus=dp-ready` selected Manage and filled Title with Name a plant part. The neighbourhood listed the two seeded models. No error toast.

Live `:6060` was not rebuilt.

## Half-applied work

None on this screen. Payload, readiness, and routes are unchanged. `formFromRow` gained an export and no new branch.

## Compression debt

None new. D150 P1 stays open: deleting a pattern drops the seed back-link, so the structure count is not a history of seeds. The table says that.

## Calendar

D146 was not marked. This screen has no calendar event.

## Next

D151, after the calibration already recorded. Do not treat this shell as that unit. W29 stays open.
