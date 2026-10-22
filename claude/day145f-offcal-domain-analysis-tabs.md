# Off-calendar — Domain Analysis three-tab shell

**Not D146.** Not a calendar unit. Not a schema unit. The W29 gate stays open: a Domain Analysis still does not produce a Competency Model.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Shell | Admin → Models → Domain Analyses has three buttons in Task Model order: Dashboard, Domain Analysis Structure, Manage Domain Analysis. Dashboard is the default. `?tab=domainanalyses&focus=<id>` opens Manage with that analysis loaded. `id` and `domainAnalysisId` do the same | **DONE** |
| Dashboard | Total, Confirmed, Draft, Ready to confirm, and Linked to Q-matrix. Ready to confirm counts drafts that pass `domainAnalysisReadiness(record, { strict: true })`. A confirmed analysis that would pass that check is not counted. Donuts are Draft vs Confirmed, and design patterns that store `domainAnalysisId` vs those that do not. No lock chart and no operational chart | **DONE** |
| Structure | Searchable sortable table, plus Table View / Ingredients View through `ModelIngredientsCard`. Columns: ID, Name, Status, Readiness, Linked policy, Design Patterns, Q-matrices, Updated. Ingredient groups are the seven sections, Perspective, Linked policy, Design patterns, and Q-matrices. Subtitle is policy name (or Not linked) • readiness | **DONE** |
| Manage | `DomainAnalysisWorkspace` as before, including Guided setup, New, the section tabs, and the confirm checklist. No new delete action | **DONE** |
| Untouched | `payloadFromForm`, readiness rules, routes, the server, and the schema. Competency, Evidence, Task, and Design Pattern shells stay on their own buttons | **DONE** |

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2290 passed | 9 skipped (2299)
  Test Files 248 passed
  49.80s, exit 0

npm run build
  green (1.24s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 373.87 kB (gzip 82.84 kB).
  DomainAnalysisEditor 28.59 kB (gzip 7.73 kB).
```

Previous close on this tree was the Design Pattern shell, **2283 passed / 9 skipped**. Delta: **+7 tests / +3 files** (`domainAnalysisDashboard.test.jsx`, `domainAnalysisStructure.test.jsx`, `domainAnalysisTabs.test.jsx`). Skips unchanged. Existing Domain Analysis tests and `adminPageIa.test.jsx` passed in the same run.

The two workspace tests import `DomainAnalysisWorkspace` instead of the default export. That is the same split Design Pattern already uses (`DesignPatternLibraryView` vs the shell). The assertions are unchanged. `adminPageIa.test.jsx` was not edited. `ModelTabShell` gained a comment that Domain Analysis calls it. The button row is unchanged.

This VM ran the suite on Node 22. CI installs Node 24. `npm ci` printed an engine warning and still installed.

## What was delivered

The default export of `DomainAnalysisEditor` is the tab shell. The workspace and Guided setup stay in that file, inside `DomainAnalysisWorkspace`. Manage renders that view. `ModelTabShell` draws the buttons and the active panel.

The dashboard reads `useDomainAnalyses`, `useDesignPatterns`, and `useQMatrixModels`. The structure table reads the same three hooks.

## Fields

A Domain Analysis does not store a design-pattern id or a Q-matrix id. `schema.js` rejects `curricularPolicyId`, `qMatrixId`, and `competencyModelId` on the record. The links that do exist:

- Design patterns store `domainAnalysisId`. The second donut counts patterns with a non-empty value against patterns with none (`Patterns counted`). A pattern whose id does not match any analysis is still in that linked slice, and it is not added to any row. The table's Design Patterns column counts only patterns whose `domainAnalysisId` equals that row.
- Q-matrices store `domainAnalysisId` (D144). The stat card Linked to Q-matrix counts analyses that at least one Q-matrix cites. The table's Q-matrices column is the same citation, per row. An orphan Q-matrix stays out of every row.
- The linked policy is `contentStandards.name`, the copied curricular policy (ADR 0011). There is no separate policy id on the analysis. Ingredient group Linked policy lists that document's goal statements, competency statements, and learning outcomes. The seven section groups are the statement lists. Perspective is `psychologicalPerspective`. There is no separate statements field.

`?tab=domainanalyses` with no id stays on Dashboard. Design Pattern does not link to a Domain Analysis URL: the identity step is a select, and the structure column is text. Those shells were not changed. The Q-matrix button on Manage still sets `domainAnalysisId` and switches to Diagnostic design. Coming back with that param still on the URL opens Manage and loads the analysis. `focus` and `id` do the same.

## Browser

Local Vite `http://127.0.0.1:5173` and the API on `:3000`, `DB_MODE=json`, signed in as `admin1`. The store held the fixture: Plant structure (ready draft, policy Plant diagram curriculum, two design patterns, one Q-matrix), Unfinished analysis (thin draft), and Fractions (confirmed, one design pattern, no policy, no Q-matrix). An orphan pattern and an orphan Q-matrix cite `da-missing` and stay out of every row.

Dashboard showed Total 3, Confirmed 1, Draft 2, Ready to confirm 1, Linked to Q-matrix 1. The donuts were Analyses counted 3 and Patterns counted 5. Structure showed those three rows. Ingredients for Plant structure showed the eleven groups and the subtitle `Plant diagram curriculum • Ready`. Opening `?tab=domainanalyses&focus=da-ready` selected Manage and filled Name with Plant structure. Guided setup and New were on that screen. No error toast.

Live `:6060` was not rebuilt.

## Half-applied work

None on this screen. Payload, readiness, and routes are unchanged.

## Compression debt

None new.

## Calendar

D146 was not marked. This screen has no calendar event.

## Next

D151, after the calibration already recorded. Do not treat this shell as that unit. W29 stays open.
